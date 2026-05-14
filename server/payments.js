/* ============================================================
   ONE MORE — Stripe payments helper
   Wraps the Stripe SDK and owns the "grant access from session"
   logic that's shared between the webhook and the success page.
   ============================================================ */
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { db, normalizePlan, PLAN_RULES } = require("./db");

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID || "";
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "http://localhost:3000";

/* Per-plan English labels for the Stripe line item.
   Real customer-facing copy is rendered from i18n on the client. */
const PLAN_LABELS = {
  basic:   "ONE MORE Basic — 1 MOR Full Simulation",
  plus:    "ONE MORE Plus — 1 MOR Simulation + Personalized Strategic Feedback",
  premium: "ONE MORE Premium — 2 MOR Simulations + 2 Strategic Feedback Sessions"
};

function planPrice(plan) {
  const key = normalizePlan(plan);
  const r = PLAN_RULES[key] || PLAN_RULES.plus;
  return {
    plan: key,
    amount_cents: r.amount_agorot,     // agorot = ₪×100, same unit Stripe uses
    currency: r.currency,
    label: PLAN_LABELS[key] || PLAN_LABELS.plus
  };
}

function allPlanPrices() {
  const out = {};
  for (const k of Object.keys(PLAN_RULES)) out[k] = planPrice(k);
  return out;
}

let stripe = null;
if (STRIPE_SECRET_KEY && STRIPE_SECRET_KEY !== "sk_test_replace_me") {
  // Lazy-require so the server still boots without a Stripe key for non-payment routes.
  // eslint-disable-next-line global-require
  stripe = require("stripe")(STRIPE_SECRET_KEY);
}

function isConfigured() { return !!stripe; }
function getStripe() { return stripe; }
function planRank(plan) { return ({ basic: 1, plus: 2, premium: 3 })[normalizePlan(plan)] || 2; }

function getPriceInfo(plan) {
  // Back-compat: when no plan is given, default to 'plus' so older callers keep working.
  const p = planPrice(plan || "plus");
  return {
    price_id: STRIPE_PRICE_ID || null,
    amount_cents: p.amount_cents,
    currency: p.currency,
    label: p.label,
    plan: p.plan
  };
}

function genPassword(len = 10) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const buf = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[buf[i] % alphabet.length];
  return out;
}

function usernameFromEmail(email) {
  const base = String(email || "").split("@")[0].replace(/[^A-Za-z0-9._-]/g, "") || "student";
  let candidate = base.slice(0, 24);
  // Ensure unique
  let n = 0;
  while (db.prepare("SELECT id FROM users WHERE username = ?").get(candidate)) {
    n += 1;
    candidate = (base.slice(0, 22) + "-" + n).slice(0, 26);
  }
  return candidate;
}

/* ============================================================
   createCheckoutSession({ email, currentUserId })
   - email: required for new-user flow
   - currentUserId: if a logged-in student is upgrading themselves
   Returns { url, session_id }
   ============================================================ */
async function createCheckoutSession({ email, currentUserId, plan }) {
  if (!stripe) throw new Error("stripe_not_configured");

  const safePlan = normalizePlan(plan);
  const info = getPriceInfo(safePlan);
  // If an env-level Stripe price is configured we still honour it (legacy),
  // otherwise we build per-plan price_data on the fly.
  const line_items = info.price_id
    ? [{ price: info.price_id, quantity: 1 }]
    : [{
        quantity: 1,
        price_data: {
          currency: info.currency,
          unit_amount: info.amount_cents,
          product_data: { name: info.label }
        }
      }];

  const params = {
    mode: "payment",
    line_items,
    success_url: `${PUBLIC_BASE_URL}/purchase-success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${PUBLIC_BASE_URL}/purchase-canceled.html`,
    metadata: {
      intent: currentUserId ? "upgrade_self" : "new_user",
      currentUserId: currentUserId ? String(currentUserId) : "",
      plan: safePlan
    }
  };
  if (email) params.customer_email = email;

  const session = await stripe.checkout.sessions.create(params);

  db.prepare(`
    INSERT INTO payments (user_id, email, stripe_session_id, amount_cents, currency, status, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, 'created', ?, ?)
  `).run(
    currentUserId || null,
    email || null,
    session.id,
    info.amount_cents,
    info.currency,
    JSON.stringify({ intent: params.metadata.intent, plan: safePlan }),
    Date.now()
  );

  return { url: session.url, session_id: session.id };
}

/* ============================================================
   grantAccessForSession(session, { allowPasswordIssue })
   Idempotent. Called from both the webhook and the success page.
   - Marks the payment row paid.
   - Creates a student user if one doesn't yet exist for this payment.
   - If allowPasswordIssue is true AND the password has not yet been
     shown, generates a fresh password, hashes it, and returns the
     cleartext ONCE.
   Returns: { user, password? }  (password only present when issued here)
   ============================================================ */
function grantAccessForSession(session, opts = {}) {
  const payment = db.prepare("SELECT * FROM payments WHERE stripe_session_id = ?").get(session.id);
  if (!payment) {
    // Webhook arrived for a session we don't know about — record it.
    db.prepare(`
      INSERT INTO payments (stripe_session_id, stripe_payment_intent, email, amount_cents, currency, status, created_at, completed_at, metadata)
      VALUES (?, ?, ?, ?, ?, 'paid', ?, ?, ?)
    `).run(
      session.id,
      session.payment_intent || null,
      session.customer_email || session.customer_details?.email || null,
      session.amount_total || null,
      (session.currency || "usd"),
      Date.now(), Date.now(),
      JSON.stringify({ source: "webhook_first" })
    );
    return grantAccessForSession(session, opts); // re-run; row exists now
  }

  const meta = (() => { try { return JSON.parse(payment.metadata || "{}"); } catch (e) { return {}; } })();
  const email = payment.email || session.customer_email || (session.customer_details && session.customer_details.email) || null;
  // Plan can arrive via our payments-row metadata or via Stripe session metadata.
  const planFromSession = session && session.metadata && session.metadata.plan;
  const plan = normalizePlan(meta.plan || planFromSession || "plus");

  // Find or create the user.
  let user = null;
  if (payment.user_id) {
    user = db.prepare("SELECT * FROM users WHERE id = ?").get(payment.user_id);
  } else if (email) {
    user = db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").get(email);
  }

  let issuedPassword = null;
  if (!user) {
    const username = usernameFromEmail(email || "student");
    const password = genPassword(10);
    const hash = bcrypt.hashSync(password, 10);
    const now = Date.now();
    const info = db.prepare(`
      INSERT INTO users (username, password_hash, role, email, access_granted, access_source, access_granted_at, plan, created_at)
      VALUES (?, ?, 'student', ?, 1, 'stripe', ?, ?, ?)
    `).run(username, hash, email, now, plan, now);
    user = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);

    if (opts.allowPasswordIssue) {
      issuedPassword = password;
      meta.password_shown_at = now;
    } else {
      // Stash for later display by verify-session (cleared on first show).
      meta.pending_password = password;
    }
  } else {
    // Existing user: ensure access is granted and upgrade plan if the new
    // purchase is a higher tier.
    const updates = [];
    const params = [];
    if (!user.access_granted) {
      updates.push("access_granted = 1", "access_source = 'stripe'", "access_granted_at = ?");
      params.push(Date.now());
    }
    if (planRank(plan) > planRank(user.plan)) {
      updates.push("plan = ?");
      params.push(plan);
    }
    if (updates.length) {
      params.push(user.id);
      db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...params);
      user = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
    }
    // If success page asks and we have a pending password, reveal it once.
    if (opts.allowPasswordIssue && meta.pending_password && !meta.password_shown_at) {
      issuedPassword = meta.pending_password;
      delete meta.pending_password;
      meta.password_shown_at = Date.now();
    }
  }
  meta.plan = plan;

  db.prepare(`
    UPDATE payments
       SET user_id = ?,
           email = COALESCE(email, ?),
           stripe_payment_intent = COALESCE(stripe_payment_intent, ?),
           amount_cents = COALESCE(amount_cents, ?),
           currency = COALESCE(currency, ?),
           status = 'paid',
           completed_at = COALESCE(completed_at, ?),
           metadata = ?
     WHERE stripe_session_id = ?
  `).run(
    user.id,
    email,
    session.payment_intent || null,
    session.amount_total || null,
    (session.currency || null),
    Date.now(),
    JSON.stringify(meta),
    session.id
  );

  return { user, password: issuedPassword };
}

module.exports = {
  isConfigured,
  getStripe,
  getPriceInfo,
  allPlanPrices,
  planPrice,
  createCheckoutSession,
  grantAccessForSession
};
