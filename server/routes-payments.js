/* ============================================================
   ONE MORE — payment routes
   POST   /api/checkout/create-session
   GET    /api/checkout/verify-session?session_id=cs_xxx
   POST   /api/webhook/stripe                (mounted separately with raw body)
   GET    /api/pricing                       (public — returns price info)
   ============================================================ */
const express = require("express");
const { db } = require("./db");
const { verifyToken } = require("./middleware");
const payments = require("./payments");

const router = express.Router();

// Public: pricing info for the pricing/landing pages.
// Returns BOTH per-plan prices (new) and the legacy single fields
// (so older clients still work).
router.get("/pricing", (req, res) => {
  const plans = payments.allPlanPrices();
  const def = plans.plus;
  res.json({
    configured: payments.isConfigured(),
    currency: def.currency,
    plans,                         // { basic:{...}, plus:{...}, premium:{...} }
    // Legacy single-tier fields (default to Plus):
    amount_cents: def.amount_cents,
    label: def.label
  });
});

// Create a Stripe Checkout session.
// - Logged-in student? Upgrade their account.
// - Otherwise? Require email; webhook/success will create the account.
router.post("/checkout/create-session", async (req, res) => {
  if (!payments.isConfigured()) {
    return res.status(503).json({ error: "stripe_not_configured", message: "Server is missing STRIPE_SECRET_KEY." });
  }
  const me = verifyToken(req);

  let currentUserId = null;
  let email = (req.body && req.body.email) ? String(req.body.email).trim() : null;

  if (me && me.role === "student") {
    if (me.access_granted) {
      return res.status(409).json({ error: "already_paid" });
    }
    currentUserId = me.id;
    email = email || me.email || null;
  }

  if (!email) return res.status(400).json({ error: "email_required" });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: "invalid_email" });

  const plan = (req.body && req.body.plan) ? String(req.body.plan).toLowerCase() : "plus";

  try {
    const { url, session_id } = await payments.createCheckoutSession({ email, currentUserId, plan });
    res.json({ url, session_id });
  } catch (e) {
    console.error("create-session failed:", e.message);
    res.status(500).json({ error: "checkout_failed", message: e.message });
  }
});

// Called by purchase-success.html with the session_id Stripe redirected with.
// Verifies the session is paid (server-side), grants access, returns user info
// (including a one-time cleartext password for brand-new accounts).
router.get("/checkout/verify-session", async (req, res) => {
  if (!payments.isConfigured()) return res.status(503).json({ error: "stripe_not_configured" });
  const sessionId = String(req.query.session_id || "");
  if (!sessionId) return res.status(400).json({ error: "missing_session_id" });

  try {
    const session = await payments.getStripe().checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      return res.status(402).json({ error: "not_paid", status: session.payment_status });
    }
    const { user, password } = payments.grantAccessForSession(session, { allowPasswordIssue: true });
    res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        email: user.email,
        access_granted: !!user.access_granted
      },
      password: password || null  // null if it was already shown to someone
    });
  } catch (e) {
    console.error("verify-session failed:", e.message);
    res.status(500).json({ error: "verify_failed", message: e.message });
  }
});

module.exports = router;

/* ------------------------------------------------------------
   Webhook handler — exported separately so server.js can mount
   it with express.raw() (Stripe needs the unparsed body).
   ------------------------------------------------------------ */
module.exports.webhookHandler = function webhookHandler(req, res) {
  if (!payments.isConfigured()) return res.status(503).send("Stripe not configured");
  const sig = req.headers["stripe-signature"];
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!whSecret || whSecret === "whsec_replace_me") {
    return res.status(503).send("Webhook secret not configured");
  }

  let event;
  try {
    event = payments.getStripe().webhooks.constructEvent(req.body, sig, whSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object;
      if (session.payment_status === "paid" || event.type === "checkout.session.async_payment_succeeded") {
        payments.grantAccessForSession(session, { allowPasswordIssue: false });
      }
    } else if (event.type === "charge.refunded") {
      const charge = event.data.object;
      // Find the payment by payment_intent and mark refunded, remove access
      const pi = charge.payment_intent;
      const row = db.prepare("SELECT * FROM payments WHERE stripe_payment_intent = ?").get(pi);
      if (row && row.user_id) {
        db.prepare("UPDATE payments SET status = 'refunded' WHERE id = ?").run(row.id);
        db.prepare("UPDATE users SET access_granted = 0 WHERE id = ? AND access_source = 'stripe'").run(row.user_id);
      }
    }
  } catch (e) {
    console.error("Webhook handler error:", e.message);
    // Still 200 so Stripe doesn't keep retrying — error is on our side
  }

  res.json({ received: true });
};
