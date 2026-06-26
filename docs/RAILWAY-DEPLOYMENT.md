# Railway Backend Deployment Guide

Complete step-by-step guide for deploying the `schwab-dackend` API to [Railway](https://railway.app), connecting it to Railway MySQL, and wiring up the Vercel frontends.

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Part 1 — Create a Railway Account and Project](#part-1--create-a-railway-account-and-project)
4. [Part 2 — Configure the Backend Service](#part-2--configure-the-backend-service)
5. [Part 3 — Add MySQL Database](#part-3--add-mysql-database)
6. [Part 4 — Set Environment Variables](#part-4--set-environment-variables)
7. [Part 5 — Deploy and Verify](#part-5--deploy-and-verify)
8. [Part 6 — Connect Frontends (Vercel)](#part-6--connect-frontends-vercel)
9. [Part 7 — Optional CLI Migrations](#part-7--optional-cli-migrations)
10. [Part 8 — Post-Deploy Checklist](#part-8--post-deploy-checklist)
11. [Troubleshooting](#troubleshooting)
12. [Related Files](#related-files)

---

## Overview

This monorepo contains three applications:

| App | Folder | Hosting (production) |
|-----|--------|----------------------|
| User frontend | `charles-schwab/` | Vercel |
| Admin panel | `schwab-admin/` | Vercel (or similar) |
| **Backend API** | `schwab-dackend/` | **Railway** |

The backend:

- Entry point: `src/server.js` (`npm start`)
- Reads `PORT` from the environment (Railway sets this automatically)
- Auto-runs database migrations on startup
- Seeds a default admin account if none exists
- Trusts Railway's reverse proxy for rate limiting (`trust proxy` in `server.js`)

Example production URL (from existing config): `https://schwab-dackend-production.up.railway.app`

---

## Prerequisites

Before you start:

- [x] GitHub account with this repo pushed to GitHub
- [x] [Railway account](https://railway.app) (sign in with GitHub)
- [x] Strong passwords ready for `JWT_SECRET` and `ADMIN_SEED_PASSWORD`
- [x] Production URLs for your Vercel client and admin apps (for CORS)

---

## Part 1 — Create a Railway Account and Project

### Step 1: Sign in to Railway

1. Open **https://railway.app** in your browser.
2. Click **Login** (top-right corner).
3. Choose **Login with GitHub** and authorize Railway if prompted.
4. You land on the **Dashboard** — a list/grid of your projects.

### Step 2: Create a new project from GitHub

1. Click **New Project** (or the **+ New** button).
2. Select **Deploy from GitHub repo**.
3. If this is your first time, Railway asks you to **install the Railway GitHub App** — grant access to the repo that contains this project.
4. Select your repository from the list.
5. Railway creates a **new project** with one service (usually named after the repo).

### What you should see

```
Dashboard
└── Your Project Name
    └── [Service]  ← one service card (your repo name)
        ├── Deployments
        ├── Variables
        ├── Settings
        ├── Metrics
        └── Logs
```

The first deployment may fail or deploy the wrong folder — that is expected until you set the root directory in Part 2.

---

## Part 2 — Configure the Backend Service

Your repo is a monorepo. Railway must deploy **only** the `schwab-dackend` folder.

### Step 1: Open service settings

1. In the left sidebar, click your **backend service** (the one created from GitHub).
2. Click the **Settings** tab at the top.

### Step 2: Set root directory

1. Scroll to **Root Directory** (under Build or Source).
2. Enter:
   ```
   schwab-dackend
   ```
3. Save if prompted. Railway triggers a new deployment.

### Step 3: Confirm build and start commands

Railway auto-detects Node.js. Verify these values in **Settings**:

| Setting | Value |
|---------|-------|
| **Build Command** | `npm install` (auto-detected) |
| **Start Command** | `npm start` → runs `node src/server.js` |

> **Note:** A `Dockerfile` exists in `schwab-dackend/`, but without a `railway.json` Railway typically uses **Nixpacks** (Node buildpack). The default `npm start` flow is sufficient.

### Step 4: Generate a public domain

1. Still in **Settings**, scroll to **Networking** (or **Public Networking**).
2. Click **Generate Domain**.
3. Railway assigns a URL like:
   ```
   https://schwab-dackend-production.up.railway.app
   ```
4. **Copy and save this URL** — you need it for CORS, frontend config, and health checks.

### What you should see

- **Settings → Root Directory:** `schwab-dackend`
- **Settings → Networking:** a public `*.up.railway.app` URL
- **Deployments tab:** a new build running after saving settings

---

## Part 3 — Add MySQL Database

The backend requires MySQL. Add it as a second service in the same Railway project.

### Step 1: Add MySQL service

1. From your **project view** (not inside a single service), click **+ New** or **Add Service**.
2. Select **Database** → **MySQL**.
3. A new **MySQL** service appears in the left sidebar alongside your backend service.

### Step 2: Review MySQL variables

1. Click the **MySQL** service in the sidebar.
2. Open the **Variables** tab.

Railway automatically creates these variables:

| Variable | Description |
|----------|-------------|
| `MYSQLHOST` | Internal hostname (backend uses this inside Railway) |
| `MYSQLPORT` | Port (usually `3306`) |
| `MYSQLDATABASE` | Database name (often `railway`) |
| `MYSQLUSER` | Database user |
| `MYSQLPASSWORD` | Database password |
| `MYSQL_ROOT_PASSWORD` | Root password |

### Step 3: Optional — public TCP proxy

1. Click the MySQL service → **Connect** tab (or **Networking**).
2. Enable **TCP Proxy** if you need to connect from your local machine (for CLI migrations).
3. Note the public host and port (e.g. `turntable.proxy.rlwy.net:47995`).

### What you should see

```
Your Project
├── schwab-dackend (API service)     ← Node.js app
└── MySQL                            ← Database service
    ├── Variables  (MYSQLHOST, etc.)
    ├── Connect    (connection strings)
    └── Metrics
```

---

## Part 4 — Set Environment Variables

Map Railway's MySQL credentials to the variable names your backend expects (`DB_HOST`, `DB_PORT`, etc.).

### Step 1: Open backend variables

1. Click your **backend API service** (not MySQL).
2. Open the **Variables** tab.

### Step 2: Add database variables

**Recommended — use variable references** (Railway injects values from the MySQL service automatically):

Click **New Variable** or **Add Variable Reference**. Replace `MySQL` below with your MySQL service name if different:

```
DB_HOST=${{MySQL.MYSQLHOST}}
DB_PORT=${{MySQL.MYSQLPORT}}
DB_NAME=${{MySQL.MYSQLDATABASE}}
DB_USER=${{MySQL.MYSQLUSER}}
DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
```

**Alternative — copy values manually** from the MySQL service Variables tab into plain text variables on the backend service.

### Step 3: Add application variables

Add the remaining required variables:

```env
NODE_ENV=production
PORT=3002

JWT_SECRET=<generate-a-random-string-at-least-32-characters>
JWT_EXPIRES_IN=7d

CORS_ORIGIN=https://your-client.vercel.app,https://your-admin.vercel.app
FRONTEND_URL=https://your-client.vercel.app

RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=500
AUTH_RATE_LIMIT_MAX=100

EMAIL_ENABLED=false
RESEND_API_KEY=re_your_resend_api_key_here
EMAIL_FROM=onboarding@resend.dev
EMAIL_FROM_NAME=Charles Schwab Trading Platform
ADMIN_EMAIL=your-admin@email.com

ADMIN_SEED_EMAIL=your-admin@email.com
ADMIN_SEED_PASSWORD=<strong-password-16-chars-minimum>
ADMIN_SEED_FIRST_NAME=Admin
ADMIN_SEED_LAST_NAME=Schwab
```

### Important notes

| Variable | Requirement |
|----------|-------------|
| `JWT_SECRET` | Must be a strong, unique random string in production |
| `ADMIN_SEED_PASSWORD` | **Required** in production — server refuses to start if missing or weak |
| `CORS_ORIGIN` | Must include your Vercel client URL and admin URL (comma-separated) |
| `PORT` | Railway also injects `PORT`; setting `3002` matches local dev config |

See `.env.example` in `schwab-dackend/` for the full list of supported variables.

### Step 4: Save and redeploy

Saving variables triggers an automatic redeploy. Watch the **Deployments** tab until status shows **Active**.

---

## Part 5 — Deploy and Verify

### Step 1: Check deployment logs

1. Click backend service → **Deployments** tab.
2. Click the latest deployment.
3. Review **Build Logs** — should end with a successful build.
4. Review **Deploy Logs** — look for these messages:

```
[server] Running on http://localhost:3002 (production)
[DB] Connection pool ready
[migrate] Auto-migration complete.
[seed] Admin account created: your-admin@email.com
  — OR —
[seed] Admin account already exists (id=1). Skipping seed.
```

### Step 2: Live logs

1. Click the **Logs** tab on the backend service.
2. Confirm no repeated crash/restart loops.
3. If the service keeps restarting, check for `[seed] FATAL: ADMIN_SEED_PASSWORD is missing or insecure`.

### Step 3: Health check

Open in your browser or run in terminal:

```
https://YOUR-RAILWAY-DOMAIN.up.railway.app/health
```

Expected response:

```json
{
  "success": true,
  "status": "ok",
  "db": "connected",
  "timestamp": "2026-06-25T21:56:50.511Z"
}
```

If `"db": "connected"` is missing, see [Troubleshooting](#troubleshooting).

### Step 4: Test authentication

```bash
curl -X POST https://YOUR-RAILWAY-DOMAIN.up.railway.app/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your-admin@email.com","password":"YOUR_ADMIN_SEED_PASSWORD"}'
```

Expected: `{ "success": true, "data": { "token": "...", "user": { ... } } }`

---

## Part 6 — Connect Frontends (Vercel)

After the backend is live, point the frontends at your Railway URL.

### Client app (`charles-schwab`)

The client uses a Vercel rewrite so `/api/*` proxies to Railway.

**File:** `charles-schwab/vercel.json`

```json
{
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "https://YOUR-RAILWAY-DOMAIN.up.railway.app/$1"
    },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

**File:** `charles-schwab/.env.production`

```env
VITE_API_URL=/api
API_TARGET=https://YOUR-RAILWAY-DOMAIN.up.railway.app
```

Redeploy the client on Vercel after updating `vercel.json`.

### Admin app (`schwab-admin`)

The admin calls the Railway API directly (no proxy).

**File:** `schwab-admin/.env.production`

```env
VITE_API_URL=https://YOUR-RAILWAY-DOMAIN.up.railway.app
```

Redeploy the admin on Vercel after updating the env var.

### Update Railway CORS

Make sure `CORS_ORIGIN` on Railway includes both frontend URLs:

```
CORS_ORIGIN=https://your-client.vercel.app,https://your-admin.vercel.app
```

---

## Part 7 — Optional CLI Migrations

The server auto-migrates on startup. Use the CLI scripts only if you need extra production migrations or platform account seeding.

### Install Railway CLI

```bash
npm install -g @railway/cli
```

### Link to your project

```bash
cd schwab-dackend
railway login
railway link
```

Select your project and the **backend service** when prompted.

### Run migrations

```bash
./run-railway-migration.sh
```

Or directly (must use the **MySQL** service so the TCP proxy vars are available):

```bash
railway run --service MySQL node migrate-production.js
```

### Seed platform accounts (optional)

Edit `add-production-accounts.js` with real bank/wallet details first, then:

```bash
railway run --service MySQL node add-production-accounts.js
```

### Useful CLI commands

| Command | Purpose |
|---------|---------|
| `railway status` | Show linked project and service |
| `railway ps` | List running services |
| `railway connect mysql` | Open MySQL shell |
| `railway logs` | Stream live logs |

---

## Part 8 — Post-Deploy Checklist

Use alongside [DEPLOYMENT-CHECKLIST.md](./DEPLOYMENT-CHECKLIST.md) for full verification.

### Railway / Backend

- [ ] `/health` returns `"db": "connected"`
- [ ] Admin login works via `/auth/login`
- [ ] Deploy logs show `[migrate] Auto-migration complete.`
- [ ] `JWT_SECRET` is a strong unique value (not the example default)
- [ ] `ADMIN_SEED_PASSWORD` is strong and documented securely
- [ ] `CORS_ORIGIN` lists specific domains (not `*` in production)

### Frontends

- [ ] Client app loads on Vercel
- [ ] Client registration and login work (CORS + `/api` proxy)
- [ ] Admin panel loads and admin login works
- [ ] Browser console shows no CORS errors

### Security

- [ ] `.env` files are not committed to git
- [ ] Railway variables contain no placeholder passwords
- [ ] HTTPS is enabled (Railway provides this automatically)

---

## Troubleshooting

### Deployment fails at build

| Symptom | Fix |
|---------|-----|
| `npm ERR!` / missing dependencies | Confirm **Root Directory** is `schwab-dackend` |
| Wrong folder deployed | Set Root Directory in Settings → redeploy |
| Build timeout | Check `package.json` exists in `schwab-dackend/` |

### Service crashes on startup

| Log message | Fix |
|-------------|-----|
| `[seed] FATAL: ADMIN_SEED_PASSWORD is missing or insecure` | Set a strong `ADMIN_SEED_PASSWORD` in Variables |
| `ECONNREFUSED` / DB connection error | Verify `DB_HOST`, `DB_USER`, `DB_PASSWORD` reference the MySQL service |
| Port binding error | Do not hardcode port in code; use `process.env.PORT` (already handled) |

### Health check returns but `db` is not connected

1. Open backend service → **Variables** — confirm all `DB_*` vars are set.
2. Open MySQL service → confirm it is **Active** (not stopped).
3. Use variable references (`${{MySQL.MYSQLHOST}}`) instead of copying stale values.
4. Check **Logs** for `[DB]` or `[migrate]` error messages.

### CORS errors in browser

1. Add the exact frontend origin to `CORS_ORIGIN` (include `https://`, no trailing slash).
2. Include both client and admin URLs if both call the API.
3. Redeploy backend after changing variables.

### Rate limiting blocks all requests

The server sets `trust proxy` for Railway's load balancer. If rate limits seem wrong, confirm you are not behind an additional proxy without updating `trust proxy`.

### CLI migration fails

| Symptom | Fix |
|---------|-----|
| `Connection lost: The server closed the connection` | You are likely linked to the backend service, which only exposes the internal `mysql.railway.internal` host. Run migrations with `railway run --service MySQL node migrate-production.js` instead. |
| `No public MySQL endpoint found` | Same fix — pass `--service MySQL` so Railway injects `RAILWAY_TCP_PROXY_DOMAIN` / `RAILWAY_TCP_PROXY_PORT`. |

```bash
railway status                              # confirm project is linked
railway ps                                  # confirm MySQL is running
railway run --service MySQL node migrate-production.js
railway connect mysql                       # test direct DB access
```

Ensure you run commands from the `schwab-dackend/` directory after `railway link`.

---

## Related Files

| File | Purpose |
|------|---------|
| `schwab-dackend/.env.example` | All supported environment variables |
| `schwab-dackend/.env.production` | Example Railway production values (do not commit secrets) |
| `schwab-dackend/run-railway-migration.sh` | Shell wrapper for CLI migrations |
| `schwab-dackend/migrate-production.js` | Production ALTER/CREATE migrations |
| `schwab-dackend/add-production-accounts.js` | Seed platform bank accounts |
| `schwab-dackend/Dockerfile` | Optional Docker build (Nixpacks used by default) |
| `schwab-dackend/src/server.js` | Auto-migration, admin seed, trust proxy |
| `charles-schwab/vercel.json` | Vercel `/api` → Railway rewrite |
| `charles-schwab/.env.production` | Client production API config |
| `schwab-admin/.env.production` | Admin production API config |
| [DEPLOYMENT-CHECKLIST.md](./DEPLOYMENT-CHECKLIST.md) | Full pre/post deploy checklist |
| [SETUP.md](./SETUP.md) | Local setup and API reference |

---

**Ready to deploy! 🚀**
