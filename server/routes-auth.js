/* ============================================================
   ONE MORE — /api/login, /api/logout, /api/me, /api/change-password
   ============================================================ */
const express = require("express");
const bcrypt = require("bcryptjs");
const { db } = require("./db");
const { requireAuth, signSession, COOKIE } = require("./middleware");

const router = express.Router();

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax",
  // secure: true,   // enable when behind HTTPS in production
  path: "/",
  maxAge: 8 * 60 * 60 * 1000 // 8 hours
};

// POST /api/login  { username, password }
router.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "missing_credentials" });

  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(String(username).trim());
  if (!user) return res.status(401).json({ error: "invalid_credentials" });
  if (user.disabled) return res.status(403).json({ error: "account_disabled" });

  const ok = bcrypt.compareSync(String(password), user.password_hash);
  if (!ok) return res.status(401).json({ error: "invalid_credentials" });

  db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(Date.now(), user.id);

  const token = signSession(user);
  res.cookie(COOKIE, token, COOKIE_OPTS);

  res.json({
    id: user.id,
    username: user.username,
    role: user.role,
    full_name: user.full_name,
    email: user.email,
    access_granted: !!user.access_granted,
    plan: user.plan || "plus",
    birth_year: user.birth_year,
    grad_year: user.grad_year,
    school: user.school,
    city: user.city
  });
});

// POST /api/logout
router.post("/logout", (req, res) => {
  res.clearCookie(COOKIE, { path: "/" });
  res.json({ ok: true });
});

// GET /api/me — current user
router.get("/me", requireAuth, (req, res) => {
  res.json({
    id: req.user.id,
    username: req.user.username,
    role: req.user.role,
    full_name: req.user.full_name,
    email: req.user.email,
    access_granted: !!req.user.access_granted,
    plan: req.user.plan || "plus",
    birth_year: req.user.birth_year,
    grad_year: req.user.grad_year,
    school: req.user.school,
    city: req.user.city
  });
});

// POST /api/change-password { current, next }
router.post("/change-password", requireAuth, (req, res) => {
  const { current, next: nextPwd } = req.body || {};
  if (!current || !nextPwd) return res.status(400).json({ error: "missing_fields" });
  if (String(nextPwd).length < 8) return res.status(400).json({ error: "password_too_short" });

  const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(req.user.id);
  if (!bcrypt.compareSync(String(current), row.password_hash)) {
    return res.status(401).json({ error: "invalid_current_password" });
  }

  const hash = bcrypt.hashSync(String(nextPwd), 10);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, req.user.id);
  res.json({ ok: true });
});

module.exports = router;
