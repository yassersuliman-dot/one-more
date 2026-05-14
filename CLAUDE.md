# ONE MORE — MOR Biographical Exam Simulator

A trilingual (Hebrew / Arabic / English) web platform simulating the Israeli medical school MOR biographical entrance exam. Express + SQLite backend with cookie-session auth and Stripe-based paywall; the frontend stays vanilla HTML/CSS/JS.

## Identity & brand

- Product name: **ONE MORE** (subtitle "More of MOR!"). Older drafts said "EPSOS MORE" — that name is retired.
- Logo: `assets/logo.png`. Stethoscope motif. Burgundy/red + black.
- Brand primary color: `#a8123e` (deep burgundy). Defined in CSS as `--brand-primary`.
- Brand accent (used sparingly): `#1e3a8a` medical blue.
- Tone: serious, elite, hospital-system feel. Not playful. Slightly stress-inducing.

## Tech stack

- Frontend: vanilla HTML + CSS + JS. No build step.
- Backend: Node.js + Express. SQLite via `better-sqlite3`.
- Auth: bcrypt password hashing + JWT in httpOnly cookie.
- Payments: Stripe Checkout (hosted page) + webhook. Keys via `.env` (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, optional `STRIPE_PRICE_ID`). `.env.example` is in the repo.
- Run with `npm install && npm start`, then open `http://localhost:3000`.
  Opening HTML files directly with `file://` no longer works — pages call `/api/*` for auth and payments.
- Persistent state: SQLite at `data/data.db` (users + attempts + payments). Answers still live in the user's browser localStorage.

## File map

```
ِEpsosMor/
├── server.js              Express entry. Boots SQLite, mounts API, serves static, page-level auth gate.
├── package.json           Deps + npm scripts.
├── server/
│   ├── db.js              SQLite setup, schema, migrations, JWT secret, admin seeder.
│   ├── middleware.js      verifyToken, requireAuth, requireAdmin, requirePaid, signSession.
│   ├── routes-auth.js     /api/login /api/logout /api/me /api/change-password
│   ├── routes-admin.js    /api/admin/users (CRUD + reset-password + grant/revoke-access), /payments, /attempts
│   ├── routes-exam.js     /api/exam/attempt/start, /api/exam/attempt/submit
│   ├── routes-payments.js /api/pricing, /api/checkout/create-session, /api/checkout/verify-session, /api/webhook/stripe
│   └── payments.js        Stripe SDK wrapper + idempotent `grantAccessForSession` helper.
├── data/
│   ├── data.db            Created on first run (gitignored)
│   └── .secret            JWT signing key, random per install (gitignored)
├── .env.example           Template; copy to `.env` and fill in Stripe keys.
├── index.html             Landing page. CTA goes to /pricing.html.
├── pricing.html           Pricing + email + Buy → Stripe Checkout.
├── purchase-success.html  Stripe redirect target; verifies session, shows credentials once.
├── purchase-canceled.html Stripe canceled-return target.
├── login.html             Username + password form → POST /api/login.
├── admin.html             Admin dashboard (users + payments + attempts; create/disable/delete/reset-password/grant/revoke).
├── exam.html              Exam shell. Calls /api/me on load; redirects to /login.html if 401, /pricing.html if unpaid.
├── results.html           Feedback page. Same auth gate as exam.
├── assets/logo.png        ONE MORE logo.
├── css/styles.css         All styling.
├── js/
│   ├── i18n.js            HE/AR/EN dictionary + runtime.
│   ├── questions.js       13 questions (5 roles + 8 cases).
│   ├── app.js             Exam runtime (timer, autosave, nav, submit).
│   └── auth-client.js     Tiny helper: epsosAuth.api / requireUser / logout.
├── smoke-test.js          End-to-end API test (uses node:sqlite to avoid native compile in sandboxes).
├── Mor.md                 Original product brief (read-only).
└── PROJECT_REFERENCE.txt  Human-readable reference doc.
```

## Conventions that must NOT be changed without asking

1. **Timer total** is `170 * 60` seconds (2h 50min). Constant `TOTAL_SECONDS` in `js/app.js`.
2. **Default exam display value** in `exam.html` is `02:50:00` — keep in sync with the constant.
3. **Question count** is 13: 5 role questions + 8 case questions. Driven by `js/questions.js`. The sidebar grid and progress math both read from `window.QUESTIONS.length`.
4. **localStorage keys** (frontend only — server is authoritative for identity):
   - `epsos_lang` — selected language ("he" / "ar" / "en")
   - `epsos_user` — cached copy of `/api/me` response (display only)
   - `epsos_exam_state` — answers, viewed, flagged, current, timeLeft, startedAt, submitted
   - `epsos_submitted` — sentinel "1" when submitted
5. **i18n contract** — every user-facing string lives in `js/i18n.js` under all three languages (`he`, `ar`, `en`). HTML uses `data-i18n="key"` for text and `data-i18n-ph="key"` for placeholders. Never hard-code user-facing strings in HTML or JS.
6. **Brand color** lives in CSS variables (`--brand-primary` and friends). Don't introduce raw hex codes outside `:root`.
7. **Logo size** in topbar is `38px` height (rule: `.brand img`). Don't enlarge globally; add a scoped class if needed.
8. **Auth boundary** — anything sensitive flows through Express. Never authenticate in frontend code. Passwords are bcrypt-hashed (10 rounds). Sessions are JWT in an httpOnly cookie (`epsos_session`, 8h expiry).
9. **Admin seed** — on first boot, if no admin exists, the server creates `admin` with a randomly generated password and prints it to the console once. Do not hardcode credentials.

## Database schema (SQLite)

```
users
  id, username (UNIQUE, case-insensitive), password_hash,
  role ('student'|'admin'), disabled,
  access_granted (0|1), access_source ('stripe'|'admin'|'seed'), access_granted_at,
  email, full_name, birth_year, grad_year, school, city,
  created_at, last_login_at

attempts
  id, user_id (FK), started_at, submitted_at, ip, user_agent

payments
  id, user_id (FK, nullable), email,
  stripe_session_id (UNIQUE), stripe_payment_intent,
  amount_cents, currency,
  status ('created'|'paid'|'refunded'|'canceled'|'manual'),
  metadata (JSON), created_at, completed_at
```

Migrations run on every boot: missing columns are added with `ALTER TABLE`, and existing users are grandfathered into `access_granted = 1` the first time the column is added.

## API surface

```
POST /api/login              { username, password }  → user + sets httpOnly cookie
POST /api/logout                                     → clears cookie
GET  /api/me                                         → current user (incl. access_granted)
POST /api/change-password    { current, next }       (requireAuth)

GET  /api/pricing                                    → { amount_cents, currency, label, configured }
POST /api/checkout/create-session  { email }         → { url, session_id }
GET  /api/checkout/verify-session?session_id=cs_xxx  → { user, password? }
POST /api/webhook/stripe                             (raw body, Stripe-Signature verified)

GET    /api/admin/users                              (requireAdmin)
POST   /api/admin/users      { username?, password?, role?, full_name?, email?, ... }
                              → returns user + cleartext password (shown ONCE)
                              → admin-created users default to access_granted=1 (source='admin')
PATCH  /api/admin/users/:id  { disabled?, role?, full_name?, ... }
DELETE /api/admin/users/:id
POST   /api/admin/users/:id/reset-password           → returns new cleartext password
POST   /api/admin/users/:id/grant-access             → marks paid (source='admin'), records 'manual' payment row
POST   /api/admin/users/:id/revoke-access            → access_granted = 0
GET    /api/admin/payments                           → list (join with users)
GET    /api/admin/attempts                           → list (join with users)

POST /api/exam/attempt/start                          (requireAuth) → { attempt_id }
POST /api/exam/attempt/submit { attempt_id? }         (requireAuth) → { ok }
```

## Question data shape

Each question in `window.QUESTIONS`:

```js
{
  id: "role_1" | "case_xxx",
  type: "role" | "case",
  section: "roles" | "cases",
  index: 1..N,
  title: { he, ar, en },
  instructions?: { he, ar, en },
  intro?: { he, ar, en },
  identification: true | undefined,
  subs: [{ id?, he, ar, en, lines, words, optional? }]
}
```

To add a question: append to `QUESTIONS` in `js/questions.js`. Grid/nav/progress/scoring auto-pick it up.

## How to extend (common asks)

- **Change the timer**: edit `TOTAL_SECONDS` in `js/app.js` AND the default in `exam.html` AND `f2_t` / `auth_terms` / landing-stat in `js/i18n.js` and `index.html`.
- **Add a language**: add a key under `window.I18N` in `js/i18n.js`, add a button to every `.lang-switch` nav, set `dir`.
- **Add a sub-question**: append to the relevant `subs[]` array. Provide all three languages, `lines`, `words`.
- **Add a section**: touch `renderGrid()` and `renderCurrent()` in `js/app.js`.
- **Change the brand color**: edit `--brand-primary` and friends in `css/styles.css` `:root`.
- **Add an admin-only feature**: create the API route under `server/routes-admin.js` (already gated by `requireAdmin`) and a UI in `admin.html`.
- **Add another role**: extend the `role` CHECK in `server/db.js` and the `role` allow-list in `server/routes-admin.js`.
- **Change the price / currency**: set `STRIPE_PRICE_ID` in `.env` (recommended) OR `EXAM_PRICE_CENTS` + `EXAM_PRICE_CURRENCY` + `EXAM_PRICE_LABEL` for an ad-hoc product. Restart the server.
- **Add a second pricing tier**: extend `payments.getPriceInfo()` to return multiple plans, branch in `createCheckoutSession`, and expand `pricing.html`.
- **Test the webhook locally**: `stripe listen --forward-to http://localhost:3000/api/webhook/stripe` — paste the printed `whsec_…` into `.env`.

## Things to leave alone unless asked

- The textarea ruled-line background gradient (writing-line look).
- The question grid color logic (viewed = grey, answered = burgundy, current = ring, flagged = yellow dot).
- The submit / timeout modal flow.
- The score formula in `results.html`.
- The "above-average organization and clarity" feedback sentence in all three languages — required by the brief.
- The JWT cookie name (`epsos_session`) — clients hard-code it via the middleware.
- The bcrypt cost factor (10) — well-balanced for Mac CPUs.
- The `grantAccessForSession` flow — webhook and success page both call it; it's deliberately idempotent. Don't add side effects that aren't safe to repeat.
- The webhook route's raw-body mount in `server.js` (before `express.json()`). Stripe signature verification depends on this.

## Dev helpers

- Smoke test: `node --experimental-sqlite smoke-test.js` runs the full API loop against an in-memory SQLite. Use this when iterating on backend code.
- Reset exam state in the browser console on `exam.html`: `epsosResetExam()`.
- Forgot admin password: delete `data/data.db` and restart the server — a new admin is seeded with a fresh random password.
