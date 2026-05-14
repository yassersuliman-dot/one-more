/* ============================================================
   ONE MORE — Admin API
   All routes require role = 'admin'.
   ============================================================ */
const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { db, normalizePlan } = require("./db");
const { requireAdmin } = require("./middleware");

const router = express.Router();
router.use(requireAdmin);

function genPassword(len = 10) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  const buf = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) out += alphabet[buf[i] % alphabet.length];
  return out;
}

function publicUser(u) {
  return {
    id: u.id, username: u.username, role: u.role, disabled: !!u.disabled,
    access_granted: !!u.access_granted, access_source: u.access_source,
    access_granted_at: u.access_granted_at, email: u.email, plan: u.plan || "plus",
    full_name: u.full_name, birth_year: u.birth_year, grad_year: u.grad_year,
    school: u.school, city: u.city,
    created_at: u.created_at, last_login_at: u.last_login_at
  };
}

// GET /api/admin/users
router.get("/users", (req, res) => {
  const rows = db.prepare(`
    SELECT id, username, role, disabled, access_granted, access_source, access_granted_at,
           email, full_name, birth_year, grad_year, school, city, plan, created_at, last_login_at
    FROM users ORDER BY created_at DESC
  `).all();
  res.json(rows.map(publicUser));
});

// POST /api/admin/users  { username?, full_name?, role?, birth_year?, ... }
// Returns the cleartext password ONCE.
router.post("/users", (req, res) => {
  const body = req.body || {};
  const username = (body.username || ("student-" + crypto.randomBytes(2).toString("hex"))).trim();

  if (!/^[A-Za-z0-9_.-]{2,32}$/.test(username)) {
    return res.status(400).json({ error: "invalid_username" });
  }

  const exists = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (exists) return res.status(409).json({ error: "username_taken" });

  const password = body.password && body.password.length >= 8 ? body.password : genPassword(10);
  const hash = bcrypt.hashSync(password, 10);
  const role = body.role === "admin" ? "admin" : "student";
  const plan = normalizePlan(body.plan || "plus");

  const now = Date.now();
  const info = db.prepare(`
    INSERT INTO users (username, password_hash, role, full_name, email,
                       birth_year, grad_year, school, city, plan,
                       access_granted, access_source, access_granted_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'admin', ?, ?)
  `).run(
    username, hash, role,
    body.full_name || null,
    body.email || null,
    body.birth_year || null,
    body.grad_year || null,
    body.school || null,
    body.city || null,
    plan,
    now, now
  );

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ ...publicUser(user), password });
});

// PATCH /api/admin/users/:id  { full_name?, disabled?, role?, birth_year?, ... }
router.patch("/users/:id", (req, res) => {
  const id = +req.params.id;
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!user) return res.status(404).json({ error: "not_found" });
  if (user.id === req.user.id) return res.status(400).json({ error: "cannot_modify_self" });

  const allowed = ["full_name", "birth_year", "grad_year", "school", "city", "disabled", "role", "plan"];
  const fields = [];
  const values = [];
  for (const k of allowed) {
    if (k in req.body) {
      let v = req.body[k];
      if (k === "disabled") v = v ? 1 : 0;
      if (k === "role" && v !== "admin" && v !== "student") continue;
      if (k === "plan") v = normalizePlan(v);
      fields.push(`${k} = ?`); values.push(v);
    }
  }
  if (!fields.length) return res.status(400).json({ error: "no_changes" });

  values.push(id);
  db.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  const updated = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  res.json(publicUser(updated));
});

// POST /api/admin/users/:id/reset-password — returns new cleartext password
router.post("/users/:id/reset-password", (req, res) => {
  const id = +req.params.id;
  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(id);
  if (!user) return res.status(404).json({ error: "not_found" });

  const password = genPassword(10);
  const hash = bcrypt.hashSync(password, 10);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, id);
  res.json({ password });
});

// DELETE /api/admin/users/:id
router.delete("/users/:id", (req, res) => {
  const id = +req.params.id;
  if (id === req.user.id) return res.status(400).json({ error: "cannot_delete_self" });
  const info = db.prepare("DELETE FROM users WHERE id = ?").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "not_found" });
  res.json({ ok: true });
});

// POST /api/admin/users/:id/grant-access — manually grant exam access (optional plan)
router.post("/users/:id/grant-access", (req, res) => {
  const id = +req.params.id;
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!user) return res.status(404).json({ error: "not_found" });

  const now = Date.now();
  const plan = (req.body && req.body.plan) ? normalizePlan(req.body.plan) : (user.plan || "plus");
  db.prepare(`
    UPDATE users SET access_granted = 1, access_source = 'admin', access_granted_at = ?, plan = ?
    WHERE id = ?
  `).run(now, plan, id);

  // Record a "manual" payment row for audit
  db.prepare(`
    INSERT INTO payments (user_id, email, status, amount_cents, currency, metadata, created_at, completed_at)
    VALUES (?, ?, 'manual', 0, 'usd', ?, ?, ?)
  `).run(id, user.email || null, JSON.stringify({ granted_by_admin_id: req.user.id }), now, now);

  const updated = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  res.json(publicUser(updated));
});

// POST /api/admin/users/:id/revoke-access — revoke exam access
router.post("/users/:id/revoke-access", (req, res) => {
  const id = +req.params.id;
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!user) return res.status(404).json({ error: "not_found" });

  db.prepare(`
    UPDATE users SET access_granted = 0, access_granted_at = NULL WHERE id = ?
  `).run(id);

  const updated = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  res.json(publicUser(updated));
});

// GET /api/admin/payments — all payments (paid, refunded, manual, created)
router.get("/payments", (req, res) => {
  const rows = db.prepare(`
    SELECT p.id, p.user_id, p.email, p.stripe_session_id, p.stripe_payment_intent,
           p.amount_cents, p.currency, p.status, p.created_at, p.completed_at,
           u.username, u.full_name
    FROM payments p
    LEFT JOIN users u ON u.id = p.user_id
    ORDER BY p.created_at DESC
    LIMIT 500
  `).all();
  res.json(rows);
});

// GET /api/admin/attempts
router.get("/attempts", (req, res) => {
  const rows = db.prepare(`
    SELECT a.id, a.user_id, a.started_at, a.submitted_at, a.ip, a.user_agent,
           u.username, u.full_name
    FROM attempts a
    JOIN users u ON u.id = a.user_id
    ORDER BY a.started_at DESC
    LIMIT 500
  `).all();
  res.json(rows);
});

module.exports = router;
