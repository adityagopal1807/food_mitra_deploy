# FoodMitra — Node.js / Express / MongoDB

A food-donation and surplus-food-rescue platform. Server-rendered with EJS,
backed by MongoDB (Mongoose). Users log in passwordlessly (email OTP or
Google) and can list, donate, order, and manage food — no admin role needed.

## Features
- Home, About, Contact, Leaderboard pages
- **Passwordless login**: email OTP (via Gmail SMTP/Nodemailer) or "Continue with Google"
- Donate Food / List Surplus Food (login required) — mark each listing **Free** or **Paid** with a per-unit price
- Browse Listings (public) → place an order → the listing owner **Confirms or Rejects** it from their Dashboard; stock only moves on confirmation
- Fully dynamic, points-based **Leaderboard** — points are awarded live for signing up, listing food, introducing a brand-new pincode, and having an order confirmed
- Claim a discounted item → confirm claim → receipt
- Site-wide chat assistant (floating widget on every page) — answers questions about listings, orders, login, pricing, pincodes, the leaderboard, and (for logged-in users) their own points/orders/listings

## Tech stack
- **Backend:** Node.js, Express
- **Views:** EJS (server-rendered)
- **Database:** MongoDB via Mongoose
- **Auth:** express-session + connect-mongo, Nodemailer (Gmail SMTP OTP), Passport (Google OAuth)
- **File uploads:** Multer (images saved to `public/images`)
- **Security:** Helmet, rate limiting on OTP endpoints, hashed sessions in MongoDB, OTPs stored only as SHA-256 hashes with a 5-minute TTL

## Project structure
```
foodmitra/
├── server.js              # App entry point
├── config/
│   ├── db.js               # MongoDB connection
│   ├── upload.js           # Multer image upload config
│   └── passport.js         # Google OAuth strategy
├── middleware/
│   └── auth.js              # requireUser / redirectIfUser session guards
├── data/
│   └── faq.js               # Chatbot fallback FAQ replies
├── utils/
│   ├── otp.js                # OTP generation + hashing
│   ├── mailer.js             # Gmail SMTP sender for OTP emails
│   └── points.js             # Leaderboard scoring rules
├── models/                 # Mongoose schemas
│   ├── User.js               # Logged-in users (OTP/Google, no passwords)
│   ├── Otp.js                 # Short-lived OTP codes (auto-expiring)
│   ├── Pincode.js             # Tracks distinct pincodes for scoring
│   ├── Order.js                # pending / confirmed / rejected orders
│   ├── Donation.js
│   ├── FoodItem.js
│   ├── ClaimedItem.js
│   └── ContactMessage.js
├── routes/
│   ├── index.js             # Public routes (listings, donate, upload, chat, leaderboard)
│   ├── auth.js               # OTP request/verify, Google login/callback, logout
│   └── account.js            # Dashboard, listing CRUD, order Confirm/Reject
├── views/                  # EJS templates
│   ├── auth/                  # Login + OTP verification pages
│   └── account/                # Dashboard + listing form
├── public/
│   ├── css/style.css
│   ├── images/              # Uploaded food photos land here
│   └── sounds/sound.mp3
├── .env.example             # Template for required environment variables
├── Dockerfile
├── docker-compose.yml
└── package.json
```

---

## ⚠️ Before you do anything else

Two things were exposed in plain text while this project was being put
together, and both should be rotated before you consider this production-safe:

1. **A MongoDB Atlas password** was committed directly in `.env` in the
   original upload. I removed it and replaced it with a placeholder.
2. **A Gmail App Password** for OTP emails was shared in this chat. Even
   though it's stored only in `.env` (never in code), anything pasted into a
   chat should be treated as exposed.

**Rotate both before going live:**
- MongoDB: [Atlas](https://cloud.mongodb.com) → **Database Access** → edit the user → generate a new password → update `MONGODB_URI` everywhere.
- Gmail: [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) → revoke the old app password → generate a new one → update `EMAIL_PASS` everywhere.

This takes about five minutes total and is the most important thing to do
before deploying.

---

## Local setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   Then edit `.env`:
   - `MONGODB_URI` — your MongoDB Atlas (or local) connection string, including a database name (e.g. `/foodmitra`)
   - `SESSION_SECRET` — generate one with:
     ```bash
     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
     ```
   - `PORT` — defaults to 8000
   - `NODE_ENV` — `development` locally, `production` when deployed
   - `EMAIL_USER` / `EMAIL_PASS` — Gmail address + [App Password](https://myaccount.google.com/apppasswords) used to send OTP login codes (requires 2-Step Verification enabled on that Gmail account)
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` — from [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials). Create an **OAuth 2.0 Client ID** (type: Web application), and add an **Authorized redirect URI** that exactly matches `GOOGLE_CALLBACK_URL` (e.g. `http://localhost:8000/auth/google/callback` locally, or `https://yourapp.onrender.com/auth/google/callback` in production). If you skip this, email OTP login still works fine — the app detects missing Google credentials and shows a friendly message instead of crashing.

3. **Run the app**
   ```bash
   npm start          # production mode
   npm run dev        # auto-restarts on file changes (uses nodemon)
   ```

4. Open **http://localhost:8000**

5. Go to **http://localhost:8000/auth/login** and log in with your email (you'll get an OTP) or Google. There's no separate admin account anymore — any logged-in user can list food and manage their own listings/orders from **My Account**.

---

## Routes

| Method   | Path                       | Description                                  |
|----------|----------------------------|-----------------------------------------------|
| GET      | `/`, `/index`              | Home page                                    |
| GET      | `/about`                   | About page                                   |
| GET      | `/contact`                 | Contact page                                 |
| POST     | `/contact`                 | Save contact message (JSON)                  |
| GET      | `/leaderboard`             | Points-based leaderboard + regional stats    |
| GET/POST | `/donate`                  | Donate food form (**login required**)        |
| GET      | `/thank_you`               | Thank you page                               |
| GET      | `/all_donations`           | Table of all donations                       |
| GET      | `/claim`                   | Claim a discounted item                      |
| POST     | `/confirm`                 | Confirm claim (saves + shows receipt)        |
| GET/POST | `/upload`                  | List surplus food, Free or Paid (**login required**) |
| GET      | `/listings`                | Browse listings (public)                     |
| GET/POST | `/reserve/:id`             | Place an order on a listing (**login required**) — creates a **pending** order |
| GET      | `/chat`                    | Chat assistant UI                            |
| POST     | `/get`                     | Chat assistant reply (JSON)                  |
| GET      | `/health`                  | Health check (used by hosting platforms)     |
| GET      | `/auth/login`               | Login page (email OTP + Google)              |
| POST     | `/auth/otp/request`         | Send a 6-digit login code by email           |
| POST     | `/auth/otp/verify`          | Verify the code and log in                   |
| GET      | `/auth/google`               | Start Google OAuth login                     |
| GET      | `/auth/google/callback`      | Google OAuth callback                        |
| POST     | `/auth/logout`               | Log out                                      |
| GET      | `/account/dashboard`         | Your listings, orders received, orders placed, points (protected) |
| GET/POST | `/account/items/new`         | Add a listing, Free or Paid (protected)      |
| GET/POST | `/account/items/:id/edit`    | Edit your listing (protected)                |
| POST     | `/account/items/:id/delete`  | Delete your listing (protected)              |
| POST     | `/account/orders/:id/confirm`| Confirm an order on your listing — decrements stock, awards points (protected) |
| POST     | `/account/orders/:id/reject` | Reject an order on your listing (protected)  |

---

## How the leaderboard and order workflow actually work

**Points** (`utils/points.js`) are awarded the instant the triggering action happens — no batch job, no cron:
- **+5** — creating an account (first OTP verification or first Google login)
- **+10** — listing food (via Donate or List Surplus Food)
- **+20** — being the *first ever* listing from a given pincode (tracked in the `Pincode` collection; the unique index guarantees this fires exactly once per pincode, even under concurrent requests)
- **+15** — having an order on your listing confirmed

**Orders**: placing an order (`/reserve/:id`) does **not** touch stock — it just creates a `pending` `Order` linked to both the buyer and the listing owner. Stock is only decremented when the owner clicks **Confirm** on their Dashboard, and that decrement is atomic (it re-checks available quantity at confirm time), so if two orders would over-allocate the same stock, whichever is confirmed second is automatically rejected with a clear notice instead of silently overselling.

---

## ⚠️ One thing to know about uploaded images in production

Uploaded photos are saved to disk (`public/images`) via Multer. That works
great on a normal server or VPS. But most "serverless"-style PaaS platforms
(Render's free tier, Railway without a volume, Vercel, etc.) use an
**ephemeral filesystem** — anything written to disk gets wiped on every
redeploy or restart.

- **Deploying to a VPS or with Docker?** No problem — see below, just mount
  a persistent volume/directory for `public/images` (the included
  `docker-compose.yml` already does this).
- **Deploying to Render/Railway?** Attach a persistent disk/volume and mount
  it at `public/images`, or (for a more robust long-term setup) swap the
  Multer disk storage in `config/upload.js` for a cloud storage provider
  (e.g. Cloudinary, AWS S3, Backblaze B2).

---

## Deploying to production

You have three easy options. Pick whichever fits your budget/comfort level.

### Option A — Render.com (easiest, free tier available)

A `render.yaml` blueprint is included so Render can configure most of this
automatically — see the step-by-step guide below.

> **Free tier limitation:** Render's free web services do not support
> persistent disks (those require a paid plan). This means uploaded food
> photos in `public/images` will be wiped whenever the service restarts or
> redeploys — including automatic spin-down after inactivity. The app will
> work fine otherwise; this only affects previously uploaded images. If you
> outgrow this, either upgrade to a paid Render plan with a persistent disk,
> or switch `config/upload.js` to a cloud storage provider (e.g. Cloudinary's
> free tier) so images live outside the container entirely.

### Option B — Railway.app

1. Push to GitHub, then go to [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**.
2. Railway auto-detects Node.js and runs `npm install` + `npm start`.
3. Add the same environment variables as above under **Variables**.
4. Add a **Volume** mounted at `/app/public/images` for persistent uploads.
5. Railway gives you a live HTTPS URL automatically.

### Option C — Your own VPS (DigitalOcean, Hetzner, AWS EC2, etc.) with Docker

This is the most "production-grade" option and matches what's included in this repo.

1. SSH into your server and install [Docker](https://docs.docker.com/engine/install/) and Docker Compose.
2. Clone your repo onto the server:
   ```bash
   git clone <your-repo-url>
   cd foodmitra
   ```
3. Create your production `.env`:
   ```bash
   cp .env.example .env
   nano .env   # fill in MONGODB_URI, SESSION_SECRET, set NODE_ENV=production
   ```
4. Build and start:
   ```bash
   docker compose up -d --build
   ```
   The app is now running on port 8000, with uploaded images persisted in a
   Docker volume across restarts and redeploys.
5. Put a reverse proxy in front of it for HTTPS. The quickest way is
   [Caddy](https://caddyserver.com/) — install it and use a one-line Caddyfile:
   ```
   yourdomain.com {
       reverse_proxy localhost:8000
   }
   ```
   Caddy automatically gets and renews a free SSL certificate. (Nginx +
   Certbot works too if you prefer it.)
6. Point your domain's DNS A record at your server's IP address.

To update after pushing new code:
```bash
git pull
docker compose up -d --build
```

### Option D — VPS without Docker (PM2 + Nginx)

If you'd rather not use Docker:
```bash
git clone <your-repo-url>
cd foodmitra
npm install --omit=dev
cp .env.example .env && nano .env
npm install -g pm2
pm2 start server.js --name foodmitra
pm2 save
pm2 startup   # follow the printed instructions to auto-start on reboot
```
Then put Nginx or Caddy in front of port 8000 the same way as Option C, step 5.

---

## Production checklist

- [ ] Rotated the MongoDB password (see warning above) if it was ever exposed
- [ ] Rotated the Gmail App Password (see warning above) since it was shared in this chat
- [ ] `.env` is **not** committed to git (already handled by `.gitignore`)
- [ ] `SESSION_SECRET` is a long random string, different from any example value
- [ ] `NODE_ENV=production` is set on your deployment
- [ ] MongoDB Atlas → Network Access allows connections from your server's IP (or `0.0.0.0/0` if using a PaaS with dynamic IPs)
- [ ] `EMAIL_USER` / `EMAIL_PASS` are set so OTP login emails actually send
- [ ] `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` are set (or you're intentionally launching with email OTP only)
- [ ] The Google Cloud Console OAuth Client's **Authorized redirect URI** matches your production `GOOGLE_CALLBACK_URL` exactly (including `https://`)
- [ ] A persistent disk/volume is mounted for `public/images` (or you've switched to cloud storage)
- [ ] HTTPS is enabled (Render/Railway do this automatically; on a VPS, use Caddy or Nginx+Certbot)
