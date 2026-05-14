/* ============================================================
   ONE MORE — auth middleware
   ============================================================ */
const jwt = require("jsonwebtoken");
const { db, secret } = require("./db");

const COOKIE = "epsos_session";

function verifyToken(req) {
  const token = req.cookies && req.cookies[COOKIE];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, secret);
    const user = db.prepare(
      "SELECT id, username, role, disabled, access_granted, access_source, full_name, email, birth_year, grad_year, school, city FROM users WHERE id = ?"
    ).get(payload.uid);
    if (!user || user.disabled) return null;
    return user;
  } catch (e) {
    return null;
  }
}

function requireAuth(req, res, next) {
  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: "not_authenticated" });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: "not_authenticated" });
  if (user.role !== "admin") return res.status(403).json({ error: "forbidden" });
  req.user = user;
  next();
}

// Like requireAuth, but also blocks students who haven't paid / been granted access.
// Admins are always allowed.
function requirePaid(req, res, next) {
  const user = verifyToken(req);
  if (!user) return res.status(401).json({ error: "not_authenticated" });
  if (user.role !== "admin" && !user.access_granted) {
    return res.status(402).json({ error: "payment_required" });
  }
  req.user = user;
  next();
}

function signSession(user) {
  return jwt.sign({ uid: user.id, role: user.role }, secret, { expiresIn: "8h" });
}

module.exports = { requireAuth, requireAdmin, requirePaid, verifyToken, signSession, COOKIE };
