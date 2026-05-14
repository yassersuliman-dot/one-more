/* ============================================================
   ONE MORE — SQLite database layer
   Creates the data directory + DB on first run, runs migrations,
   and seeds a single admin account with a random password
   (printed to console once).
   ============================================================ */
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");

const DATA_DIR = path.join(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "data.db");
const SECRET_PATH = path.join(DATA_DIR, ".secret");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

/* -------- Schema -------- */
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash   TEXT    NOT NULL,
    role            TEXT    NOT NULL DEFAULT 'student',   -- 'student' | 'admin'
    disabled        INTEGER NOT NULL DEFAULT 0,
    access_granted  INTEGER NOT NULL DEFAULT 0,           -- 1 once paid / manually granted
    access_source   TEXT,                                 -- 'stripe' | 'admin' | 'seed'
    access_granted_at INTEGER,
    email           TEXT,
    full_name       TEXT,
    birth_year      INTEGER,
    grad_year       INTEGER,
    school          TEXT,
    city            TEXT,
    created_at      INTEGER NOT NULL,
    last_login_at   INTEGER
  );

  CREATE TABLE IF NOT EXISTS attempts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL,
    started_at   INTEGER NOT NULL,
    submitted_at INTEGER,
    ip           TEXT,
    user_agent   TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS payments (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id                  INTEGER,                       -- nullable until user is created
    email                    TEXT,
    stripe_session_id        TEXT UNIQUE,
    stripe_payment_intent    TEXT,
    amount_cents             INTEGER,
    currency                 TEXT,
    status                   TEXT NOT NULL DEFAULT 'created', -- created|paid|refunded|canceled|manual
    metadata                 TEXT,                            -- JSON
    created_at               INTEGER NOT NULL,
    completed_at             INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id);
  CREATE INDEX IF NOT EXISTS idx_attempts_started ON attempts(started_at);
  CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
  CREATE INDEX IF NOT EXISTS idx_payments_session ON payments(stripe_session_id);
`);

/* -------- Migration: add new columns to existing installs -------- */
function ensureColumn(table, col, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some(c => c.name === col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`);
    return true;
  }
  return false;
}
const addedAccessGranted   = ensureColumn("users", "access_granted",    "INTEGER NOT NULL DEFAULT 0");
ensureColumn("users", "access_source",     "TEXT");
ensureColumn("users", "access_granted_at", "INTEGER");
ensureColumn("users", "email",             "TEXT");

// Plan tiers: 'basic' | 'plus' | 'premium'
const addedPlan = ensureColumn("users", "plan", "TEXT NOT NULL DEFAULT 'plus'");

// Grandfather in existing users so they don't lose access after the migration.
// Only runs the one time we add the column.
if (addedAccessGranted) {
  db.prepare("UPDATE users SET access_granted = 1, access_source = 'seed', access_granted_at = ? WHERE access_granted = 0")
    .run(Date.now());
}
if (addedPlan) {
  // Default existing users to 'plus' — the canonical single tier from before this migration.
  db.prepare("UPDATE users SET plan = 'plus' WHERE plan IS NULL OR plan = ''").run();
}

/* -------- Plan policy (single source of truth) --------
   Pricing in agorot (₪ × 100). Premium grants 2 simulations + 2 strategic
   feedback sessions — positioned as a complete improvement journey, not
   a bulk simulation pack. */
const PLAN_RULES = {
  basic:   { max_attempts: 1, show_feedback: false, depth: "none",     amount_agorot: 6990,  currency: "ils", label_key: "plan_basic" },
  plus:    { max_attempts: 1, show_feedback: true,  depth: "standard", amount_agorot: 16990, currency: "ils", label_key: "plan_plus"  },
  premium: { max_attempts: 2, show_feedback: true,  depth: "deep",     amount_agorot: 31990, currency: "ils", label_key: "plan_premium" }
};
function planRules(plan) {
  const key = String(plan || "plus").toLowerCase();
  return PLAN_RULES[key] || PLAN_RULES.plus;
}
function normalizePlan(plan) {
  const key = String(plan || "").toLowerCase();
  return PLAN_RULES[key] ? key : "plus";
}

/* -------- JWT secret (random, persisted) -------- */
let secret;
if (fs.existsSync(SECRET_PATH)) {
  secret = fs.readFileSync(SECRET_PATH, "utf8").trim();
} else {
  secret = crypto.randomBytes(64).toString("hex");
  fs.writeFileSync(SECRET_PATH, secret, { mode: 0o600 });
}

/* -------- Seed admin if none -------- */
function seedAdminIfMissing() {
  const row = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get();
  if (row.n > 0) return null;

  const username = "admin";
  const password = crypto.randomBytes(9).toString("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 12);
  const hash = bcrypt.hashSync(password, 10);

  const now = Date.now();
  db.prepare(`
    INSERT INTO users (username, password_hash, role, full_name, access_granted, access_source, access_granted_at, created_at)
    VALUES (?, ?, 'admin', ?, 1, 'seed', ?, ?)
  `).run(username, hash, "System Administrator", now, now);

  console.log("\n========================================");
  console.log("  ONE MORE — initial admin account");
  console.log("  username:", username);
  console.log("  password:", password);
  console.log("  ➜ change it after first login.");
  console.log("========================================\n");
  return { username, password };
}

module.exports = { db, secret, seedAdminIfMissing, planRules, normalizePlan, PLAN_RULES };
