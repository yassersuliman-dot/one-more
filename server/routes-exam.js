/* ============================================================
   ONE MORE — Exam attempt tracking + plan-aware limits
   Answers themselves stay in the user's browser (localStorage).
   ============================================================ */
const express = require("express");
const { db, planRules, normalizePlan } = require("./db");
const { requireAuth } = require("./middleware");

const router = express.Router();

// Count finalised (submitted) attempts for a user. An unsubmitted in-flight
// attempt is reusable and doesn't consume a slot until it's submitted.
function countSubmitted(userId) {
  return db.prepare("SELECT COUNT(*) AS n FROM attempts WHERE user_id = ? AND submitted_at IS NOT NULL").get(userId).n;
}
function findActive(userId) {
  return db.prepare(`
    SELECT id, started_at FROM attempts
    WHERE user_id = ? AND submitted_at IS NULL
      AND started_at > ?
    ORDER BY started_at DESC LIMIT 1
  `).get(userId, Date.now() - 4 * 60 * 60 * 1000);
}

// GET /api/exam/status  — plan + remaining attempts + feedback rule
router.get("/status", requireAuth, (req, res) => {
  const plan = normalizePlan(req.user.plan);
  const rules = planRules(plan);
  const used = countSubmitted(req.user.id);
  const active = findActive(req.user.id);
  res.json({
    plan,
    max_attempts: rules.max_attempts,
    used_attempts: used,
    remaining_attempts: Math.max(rules.max_attempts - used, 0),
    show_feedback: rules.show_feedback,
    has_active_attempt: !!active,
    active_attempt_id: active ? active.id : null
  });
});

// POST /api/exam/attempt/start
router.post("/attempt/start", requireAuth, (req, res) => {
  const plan = normalizePlan(req.user.plan);
  const rules = planRules(plan);

  // Reuse a recent unsubmitted attempt (< 4 hours).
  const recent = findActive(req.user.id);
  if (recent) {
    return res.json({
      attempt_id: recent.id,
      reused: true,
      plan,
      remaining_attempts: Math.max(rules.max_attempts - countSubmitted(req.user.id), 0)
    });
  }

  // No active attempt? Enforce plan limit.
  const used = countSubmitted(req.user.id);
  if (used >= rules.max_attempts) {
    return res.status(403).json({
      error: "attempt_limit_reached",
      plan,
      max_attempts: rules.max_attempts,
      used_attempts: used,
      message: "Plan limit reached. Upgrade to start another simulation."
    });
  }

  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").toString().split(",")[0].trim();
  const ua = (req.headers["user-agent"] || "").toString().slice(0, 300);

  const info = db.prepare(`
    INSERT INTO attempts (user_id, started_at, ip, user_agent)
    VALUES (?, ?, ?, ?)
  `).run(req.user.id, Date.now(), ip, ua);

  res.json({
    attempt_id: info.lastInsertRowid,
    reused: false,
    plan,
    remaining_attempts: Math.max(rules.max_attempts - used - 1, 0) // counted after submit
  });
});

// POST /api/exam/attempt/submit  { attempt_id? }
router.post("/attempt/submit", requireAuth, (req, res) => {
  let id = req.body && req.body.attempt_id;
  if (!id) {
    const last = db.prepare(`
      SELECT id FROM attempts WHERE user_id = ? AND submitted_at IS NULL
      ORDER BY started_at DESC LIMIT 1
    `).get(req.user.id);
    if (!last) return res.status(404).json({ error: "no_active_attempt" });
    id = last.id;
  }
  db.prepare("UPDATE attempts SET submitted_at = ? WHERE id = ? AND user_id = ?")
    .run(Date.now(), id, req.user.id);

  const plan = normalizePlan(req.user.plan);
  const rules = planRules(plan);
  const used = countSubmitted(req.user.id);
  res.json({
    ok: true,
    plan,
    show_feedback: rules.show_feedback,
    remaining_attempts: Math.max(rules.max_attempts - used, 0)
  });
});

module.exports = router;
