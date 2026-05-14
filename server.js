/* ============================================================
   ONE MORE — Express server entry point
   Run:  npm install && npm start
   Then open: http://localhost:3000
   ============================================================ */

// Load .env if present (Stripe keys, port, etc.)
try { require("dotenv").config(); } catch (e) { /* ok if missing */ }

const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");

const { seedAdminIfMissing } = require("./server/db");
const authRoutes = require("./server/routes-auth");
const adminRoutes = require("./server/routes-admin");
const examRoutes = require("./server/routes-exam");
const paymentRoutes = require("./server/routes-payments");
const { verifyToken } = require("./server/middleware");

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");

/* ----------------------------------------------------------------
   STRIPE WEBHOOK — MUST come BEFORE express.json()
   so Stripe's signature can be verified against the raw body.
---------------------------------------------------------------- */
app.post(
  "/api/webhook/stripe",
  express.raw({ type: "application/json" }),
  paymentRoutes.webhookHandler
);

/* ----------------------------------------------------------------
   Standard body parsers (apply to all other routes)
---------------------------------------------------------------- */
app.use(express.json({ limit: "256kb" }));
app.use(cookieParser());

/* ----------------------------------------------------------------
   API
---------------------------------------------------------------- */
app.use("/api", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/exam", examRoutes);
app.use("/api", paymentRoutes);

/* ----------------------------------------------------------------
   Page-level gate
   - Public: /, /index.html, /login.html, /pricing.html, /purchase-success.html, /purchase-canceled.html
   - Student: /exam.html, /results.html  — needs login + paid
   - Admin only: /admin.html
   Anything else hits the static handler unchanged.
---------------------------------------------------------------- */
const PUBLIC_PAGES = new Set([
  "/", "/index.html", "/login.html",
  "/pricing.html", "/purchase-success.html", "/purchase-canceled.html"
]);
const PAID_PAGES = new Set(["/exam.html", "/results.html"]);
const ADMIN_PAGES = new Set(["/admin.html"]);

app.use((req, res, next) => {
  const url = req.path;
  if (!url.endsWith(".html") && url !== "/") return next();

  if (PUBLIC_PAGES.has(url)) return next();

  const user = verifyToken(req);

  if (PAID_PAGES.has(url)) {
    if (!user) return res.redirect("/login.html");
    if (user.role === "admin") return next();           // admins can preview
    if (!user.access_granted) return res.redirect("/pricing.html");
    return next();
  }
  if (ADMIN_PAGES.has(url)) {
    if (!user) return res.redirect("/login.html");
    if (user.role !== "admin") {
      if (!user.access_granted) return res.redirect("/pricing.html");
      return res.redirect("/exam.html");
    }
    return next();
  }
  next();
});

/* ----------------------------------------------------------------
   Static files
---------------------------------------------------------------- */
app.use(express.static(__dirname, { index: "index.html", extensions: ["html"] }));

/* ----------------------------------------------------------------
   Health check
---------------------------------------------------------------- */
app.get("/api/health", (req, res) => res.json({ ok: true, time: Date.now() }));

/* ----------------------------------------------------------------
   404
---------------------------------------------------------------- */
app.use((req, res) => res.status(404).send("Not found"));

/* ----------------------------------------------------------------
   Boot
---------------------------------------------------------------- */
seedAdminIfMissing();
app.listen(PORT, () => {
  console.log(`ONE MORE running at http://localhost:${PORT}`);
  if (!process.env.STRIPE_SECRET_KEY) {
    console.log("  ⚠ Stripe is not configured. Payment routes will return 503.");
    console.log("  ⚠ Copy .env.example to .env and fill in your Stripe keys.");
  }
});
