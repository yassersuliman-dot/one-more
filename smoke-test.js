/* ============================================================
   ONE MORE — end-to-end smoke test
   Mocks better-sqlite3 with Node 22's built-in node:sqlite
   (so we don't need a compiled native module in this sandbox).
   Run: node --experimental-sqlite smoke-test.js
   ============================================================ */
const Module = require("module");
const origLoad = Module._load;

// Env for the test
process.env.STRIPE_SECRET_KEY = "sk_test_smoke";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_smoke";
process.env.PUBLIC_BASE_URL = "http://127.0.0.1:0";
process.env.EXAM_PRICE_CENTS = "9900";
process.env.EXAM_PRICE_CURRENCY = "usd";

/* In-memory fake Stripe for the smoke test.
   Only the calls payments.js / routes-payments.js use. */
const fakeStripe = {
  _sessions: {},
  _nextId: 1,
  checkout: {
    sessions: {
      create: async (params) => {
        const id = "cs_test_" + (fakeStripe._nextId++);
        const session = {
          id,
          url: "https://example.test/checkout/" + id,
          customer_email: params.customer_email || null,
          payment_status: "unpaid",
          amount_total: (params.line_items[0].price_data && params.line_items[0].price_data.unit_amount) || 9900,
          currency: "usd",
          metadata: params.metadata || {}
        };
        fakeStripe._sessions[id] = session;
        return session;
      },
      retrieve: async (id) => {
        const s = fakeStripe._sessions[id];
        if (!s) throw new Error("No such session");
        return s;
      }
    }
  },
  webhooks: {
    constructEvent: (rawBody, sig, secret) => {
      if (secret !== process.env.STRIPE_WEBHOOK_SECRET) throw new Error("bad secret");
      // For the test we accept the raw body as a JSON event directly
      return JSON.parse(rawBody.toString("utf8"));
    }
  }
};

Module._load = function (req, parent) {
  if (req === "better-sqlite3") {
    const { DatabaseSync } = require("node:sqlite");
    return function BetterSqlite3(filename, opts) {
      // Sandbox-only: mounted folder rejects sqlite I/O. Use in-memory.
      const inner = new DatabaseSync(":memory:");
      return {
        pragma(_) { /* no-op */ },
        exec(sql) { inner.exec(sql); },
        prepare(sql) {
          const stmt = inner.prepare(sql);
          return {
            run: (...args) => stmt.run(...args.map(coerce)),
            get: (...args) => stmt.get(...args.map(coerce)),
            all: (...args) => stmt.all(...args.map(coerce))
          };
        }
      };
    };
  }
  if (req === "stripe") {
    return function () { return fakeStripe; };
  }
  return origLoad.apply(this, arguments);
};
// Expose for tests
global.__fakeStripe = fakeStripe;

function coerce(v) {
  if (v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  return v;
}

/* Wipe any prior DB / secret so the test starts clean */
const fs = require("fs");
const path = require("path");
const DATA_DIR = path.join(__dirname, "data");
if (fs.existsSync(DATA_DIR)) {
  for (const f of fs.readdirSync(DATA_DIR)) {
    try { fs.unlinkSync(path.join(DATA_DIR, f)); } catch (e) {}
  }
}

const { db, seedAdminIfMissing } = require("./server/db");
const seeded = seedAdminIfMissing();
if (!seeded) { console.error("Seed didn't run; aborting."); process.exit(1); }

const express = require("express");
const cookieParser = require("cookie-parser");
const authRoutes = require("./server/routes-auth");
const adminRoutes = require("./server/routes-admin");
const examRoutes = require("./server/routes-exam");
const paymentRoutes = require("./server/routes-payments");

const app = express();
// Webhook needs raw body
app.post("/api/webhook/stripe", express.raw({ type: "application/json" }), paymentRoutes.webhookHandler);
app.use(express.json());
app.use(cookieParser());
app.use("/api", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/exam", examRoutes);
app.use("/api", paymentRoutes);

const server = app.listen(0, async () => {
  const base = "http://127.0.0.1:" + server.address().port;
  let ok = true;
  function check(label, cond, extra) {
    console.log((cond ? "✓ " : "✗ ") + label + (cond ? "" : " — " + JSON.stringify(extra || "").slice(0, 200)));
    if (!cond) ok = false;
  }
  async function call(p, opts, jar) {
    opts = opts || {};
    const headers = { ...(opts.headers || {}) };
    if (jar && jar.cookie) headers.cookie = jar.cookie;
    if (opts.body) { headers["content-type"] = "application/json"; opts.body = JSON.stringify(opts.body); }
    opts.headers = headers;
    const r = await fetch(base + p, opts);
    if (jar) {
      const sc = r.headers.get("set-cookie");
      if (sc) jar.cookie = sc.split(";")[0];
    }
    let body; try { body = await r.json(); } catch (e) { body = await r.text(); }
    return { status: r.status, body };
  }

  try {
    let r = await call("/api/me");
    check("/api/me unauth → 401", r.status === 401);

    r = await call("/api/login", { method: "POST", body: { username: "admin", password: "wrong" } });
    check("wrong password → 401", r.status === 401);

    const jar = {};
    r = await call("/api/login", { method: "POST", body: { username: seeded.username, password: seeded.password } }, jar);
    check("admin login → 200 + role admin + cookie", r.status === 200 && r.body.role === "admin" && !!jar.cookie, r);

    r = await call("/api/me", {}, jar);
    check("/api/me with cookie → admin", r.status === 200 && r.body.username === "admin", r);

    r = await call("/api/admin/users", {}, jar);
    check("GET /api/admin/users → list of 1", r.status === 200 && Array.isArray(r.body) && r.body.length === 1, r);

    r = await call("/api/admin/users", {
      method: "POST",
      body: { username: "test_student", full_name: "Test Student", birth_year: 2003, school: "Demo HS", city: "TLV" }
    }, jar);
    check("create student → 201 + cleartext password", r.status === 201 && r.body.role === "student" && !!r.body.password, r);
    const studentPwd = r.body.password;
    const studentId = r.body.id;

    const sJar = {};
    r = await call("/api/login", { method: "POST", body: { username: "test_student", password: studentPwd } }, sJar);
    check("student login → 200 + role student", r.status === 200 && r.body.role === "student", r);

    r = await call("/api/admin/users", {}, sJar);
    check("student → admin route → 403", r.status === 403, r);

    r = await call("/api/exam/attempt/start", { method: "POST" }, sJar);
    check("student attempt/start → attempt_id", r.status === 200 && !!r.body.attempt_id, r);
    const aid = r.body.attempt_id;

    r = await call("/api/admin/attempts", {}, jar);
    check("admin sees the attempt", r.status === 200 && r.body.length === 1 && r.body[0].username === "test_student", r);

    r = await call("/api/exam/attempt/submit", { method: "POST", body: { attempt_id: aid } }, sJar);
    check("student attempt/submit → ok", r.status === 200 && r.body.ok, r);

    r = await call("/api/admin/users/" + studentId, { method: "PATCH", body: { disabled: true } }, jar);
    check("admin disables student", r.status === 200 && r.body.disabled, r);

    r = await call("/api/login", { method: "POST", body: { username: "test_student", password: studentPwd } });
    check("disabled student → 403", r.status === 403, r);

    r = await call("/api/admin/users/" + studentId + "/reset-password", { method: "POST" }, jar);
    check("admin resets password", r.status === 200 && !!r.body.password, r);
    const newPwd = r.body.password;

    await call("/api/admin/users/" + studentId, { method: "PATCH", body: { disabled: false } }, jar);
    r = await call("/api/login", { method: "POST", body: { username: "test_student", password: newPwd } });
    check("re-enabled student + new password works", r.status === 200, r);

    r = await call("/api/admin/users/" + studentId, { method: "DELETE" }, jar);
    check("admin deletes student", r.status === 200 && r.body.ok, r);

    /* ===== Payment flow ===== */

    // GET /api/pricing is public
    r = await call("/api/pricing");
    check("GET /api/pricing → ok + configured", r.status === 200 && r.body.configured === true, r);

    // create-session requires email
    r = await call("/api/checkout/create-session", { method: "POST", body: {} });
    check("create-session w/o email → 400", r.status === 400, r);

    // create-session with email → URL + session_id
    r = await call("/api/checkout/create-session", { method: "POST", body: { email: "buyer@example.com" } });
    check("create-session → URL + session_id", r.status === 200 && r.body.url && r.body.session_id, r);
    const cs_id = r.body.session_id;

    // At this point, payment is in 'created' status. Stripe webhook fires.
    // Simulate Stripe marking it paid and the webhook event
    global.__fakeStripe._sessions[cs_id].payment_status = "paid";
    global.__fakeStripe._sessions[cs_id].payment_intent = "pi_test_" + cs_id;
    const webhookEvent = {
      id: "evt_test_1",
      type: "checkout.session.completed",
      data: { object: global.__fakeStripe._sessions[cs_id] }
    };
    const rawBody = Buffer.from(JSON.stringify(webhookEvent));
    const whResp = await fetch(base + "/api/webhook/stripe", {
      method: "POST",
      headers: { "stripe-signature": "test", "content-type": "application/json" },
      body: rawBody
    });
    check("webhook → 200 received", whResp.status === 200, await whResp.json().catch(() => ({})));

    // verify-session shows credentials once
    r = await call("/api/checkout/verify-session?session_id=" + cs_id);
    check("verify-session → user created + password issued", r.status === 200 && r.body.user && r.body.user.access_granted, r);
    const newUsername = r.body.user.username;
    // password may have been issued by verify-session (webhook didn't have allowPasswordIssue)
    check("verify-session returns one-time password", !!r.body.password, r);
    const issuedPwd = r.body.password;

    // verify-session called twice should NOT re-issue the password
    r = await call("/api/checkout/verify-session?session_id=" + cs_id);
    check("verify-session second call → no password", r.status === 200 && r.body.password === null, r);

    // New student can log in with the issued credentials
    const newJar = {};
    r = await call("/api/login", { method: "POST", body: { username: newUsername, password: issuedPwd } }, newJar);
    check("new student can log in", r.status === 200 && r.body.access_granted === true, r);

    // Admin sees the new paid user and the payment row
    r = await call("/api/admin/users", {}, jar);
    const paid = r.body.find(u => u.username === newUsername);
    check("admin sees paid user with access_source=stripe", paid && paid.access_granted && paid.access_source === "stripe", paid);

    r = await call("/api/admin/payments", {}, jar);
    check("admin /api/admin/payments → contains paid row", r.status === 200 && r.body.some(p => p.stripe_session_id === cs_id && p.status === "paid"), r);

    // Admin revokes
    r = await call("/api/admin/users/" + paid.id + "/revoke-access", { method: "POST" }, jar);
    check("admin revokes access", r.status === 200 && r.body.access_granted === false, r);

    // Student now blocked by paywall middleware test: hitting an attempt should still work for unpaid? Yes, attempts route uses requireAuth not requirePaid.
    // But /api/me should reflect access_granted = false
    r = await call("/api/me", {}, newJar);
    check("/api/me reflects revoked access", r.status === 200 && r.body.access_granted === false, r);

    // Admin grants access manually
    r = await call("/api/admin/users/" + paid.id + "/grant-access", { method: "POST" }, jar);
    check("admin grants access (manual)", r.status === 200 && r.body.access_granted && r.body.access_source === "admin", r);

    // A second payment "manual" row should be present
    r = await call("/api/admin/payments", {}, jar);
    check("manual grant recorded in payments", r.body.some(p => p.user_id === paid.id && p.status === "manual"), r);

    /* ===== /Payment flow ===== */

    r = await call("/api/logout", { method: "POST" }, jar);
    check("logout → ok", r.status === 200, r);

    r = await call("/api/me", {}, jar);
    check("after logout /api/me → 401", r.status === 401, r);
  } catch (e) {
    console.error("Test crashed:", e);
    ok = false;
  }

  console.log("\n" + (ok ? "ALL PASSED ✓" : "SOME FAILED ✗"));
  server.close();
  process.exit(ok ? 0 : 1);
});
