# Warfare Fitness — Installation Guide

This guide covers everything a trainer needs to deploy and configure their own Warfare Fitness installation — no coding required.

---

## Overview

Warfare Fitness is a self-hosted SaaS fitness platform. Each Firebase project is one independent installation. The first user who registers automatically becomes the permanent admin (trainer). The setup wizard handles everything.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Firebase project | Free Spark plan is fine to start |
| Vercel account (free) | Recommended for web deployment |
| Node.js 18+ | Only needed if deploying to a VPS |

---

## Step 1 — Create a Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → enter a name (e.g. `my-gym-app`) → Continue
3. Disable Google Analytics (optional) → **Create project**

### Enable Firebase Authentication

1. In the left sidebar: **Authentication → Get started**
2. Under **Sign-in method**, enable **Email/Password**
3. Save

### Enable Firestore

1. In the left sidebar: **Firestore Database → Create database**
2. Choose **Start in production mode**
3. Select a region close to your users → **Enable**

### Deploy Firestore Security Rules

1. In Firestore, click the **Rules** tab
2. Replace the contents with the rules from `firestore.rules` in this repository
3. Click **Publish**

### Get your Firebase config keys

1. Go to **Project settings** (gear icon) → **General**
2. Scroll to **Your apps** → Click **Add app** → choose **Web** (`</>`)
3. Register the app (any nickname) — copy the `firebaseConfig` object

You'll need these values:
```
apiKey
authDomain
projectId
storageBucket
messagingSenderId
appId
```

### Create a Service Account (for the backend)

1. Go to **Project settings → Service accounts**
2. Click **Generate new private key** → **Generate key**
3. A JSON file downloads — keep it safe (never commit it)
4. Convert to base64:
   ```bash
   base64 -i serviceAccountKey.json | tr -d '\n'
   ```
   Copy the output — you'll paste it as `FIREBASE_SERVICE_ACCOUNT_KEY` below.

---

## Step 2 — Deploy to Vercel (Recommended)

### Fork or clone the repository

1. Fork this repository to your own GitHub account, or push it to a new private repo.

### Import to Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your repository
3. Framework preset: **Other** (Vercel auto-detects Expo)
4. Build command: `npx expo export --platform web`
5. Output directory: `dist`
6. Click **Deploy** — it will fail on first deploy (env vars missing) — that's expected

### Add Environment Variables

In your Vercel project → **Settings → Environment Variables**, add:

| Variable | Value | Environment |
|---|---|---|
| `EXPO_PUBLIC_FIREBASE_API_KEY` | from firebaseConfig | Production, Preview |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | from firebaseConfig | Production, Preview |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | from firebaseConfig | Production, Preview |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | from firebaseConfig | Production, Preview |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | from firebaseConfig | Production, Preview |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | from firebaseConfig | Production, Preview |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | base64 JSON from Step 1 | Production, Preview |

> **Important:** Variables prefixed `EXPO_PUBLIC_` are embedded at build time by Metro. They must be set **before** you deploy, not after.

### Redeploy

1. Go to **Deployments → Redeploy** (or push a new commit)
2. Wait for the build to complete
3. Open your Vercel URL

---

## Step 3 — Run the Setup Wizard

When you open the app for the first time (before any user has registered), you will be automatically redirected to `/setup`.

### Wizard Steps

**Step 1 — Branding**
- Enter your **App Name** (displayed throughout the app)
- Enter your **Trainer Name** (displayed to members)
- Enter your **Trainer Email** (contact email for members)

**Step 2 — Firebase Connection Test**
- The wizard automatically tests:
  - Firebase SDK initialisation
  - Firestore connectivity
  - Authentication SDK
- If any test fails, check your environment variables in Vercel and redeploy.

**Step 3 — Create Admin Account**
- Enter the email and password for your admin account
- This becomes the permanent administrator of the installation
- The account is created in Firebase Auth and linked to `system/config.adminUid`

**Done!**
- You are redirected to the login page
- The `/setup` route is permanently locked — it cannot be accessed again
- Log in with the admin account you just created

---

## Step 4 — Verify Installation

After logging in as admin:

1. Go to **Admin → System Health** (`/admin-system`)
2. Confirm all services show green:
   - ✅ Firebase SDK
   - ✅ Firestore
   - ✅ Authentication
   - ✅ Storage

---

## Alternative: Hostinger VPS Deployment

If you prefer to host on your own VPS (Hostinger, DigitalOcean, etc.):

### Requirements
- Node.js 18+
- PM2 (process manager)
- Nginx (reverse proxy)

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/your-org/warfare-fitness.git
cd warfare-fitness

# 2. Install dependencies
npm install

# 3. Create .env file
cp env.example .env
# Edit .env with your Firebase credentials

# 4. Build the web app
npx expo export --platform web

# 5. Serve with a static server (e.g. serve)
npm install -g serve
pm2 start "serve dist -l 3000" --name warfare-fitness

# 6. Configure Nginx
sudo nano /etc/nginx/sites-available/warfare-fitness
```

Nginx config:
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass $http_upgrade;
    }

    location /api {
        proxy_pass http://localhost:3001;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/warfare-fitness /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### Backend (tRPC / Hono)

The backend is a Hono server that handles tRPC procedures:

```bash
# Start backend
pm2 start "npx tsx backend/index.ts" --name warfare-fitness-api
```

---

## Troubleshooting

### "Firebase not configured" on startup

- Check that all `EXPO_PUBLIC_FIREBASE_*` variables are set in Vercel
- Redeploy after adding env vars (Metro embeds them at build time)
- Open `/admin-system` (once logged in) to verify connection status

### Setup wizard appears every time

- This means `system/config` does not exist in Firestore, or `setupCompleted` is not `true`
- Check Firestore rules allow creating `system/config`
- Check the browser console for errors during setup

### Can't log in after setup

- Make sure you used the exact email you entered in the setup wizard
- Check Firebase Auth → users list to confirm the account was created
- If the account is missing, run the setup again (delete `system/config` in Firestore first)

### How to change the admin

The admin is locked to the UID stored in `system/config.adminUid`. To change it:

1. Go to Firebase Console → Firestore → `system/config`
2. Edit `adminUid` to the new user's UID
3. The previous admin will lose admin access immediately

---

## Security Notes

- `FIREBASE_SERVICE_ACCOUNT_KEY` is **server-side only** — never expose it in the frontend or commit it to git
- The `.env` file is gitignored — never commit it
- Firestore rules enforce that only the admin UID can write to protected collections
- The `/setup` route is permanently locked once `setupCompleted: true` is stored in Firestore

---

## Environment Variable Reference

```bash
# ── Frontend (Metro/Expo) — embedded at build time ──
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=

# ── Backend (server-side only) ──
FIREBASE_SERVICE_ACCOUNT_KEY=          # base64-encoded service account JSON
OPENAI_API_KEY=                        # optional — for AI Trainer feature
STRIPE_WEBHOOK_SECRET=                 # optional — for Stripe subscriptions
```

---

*Warfare Fitness — Self-Hosted Edition*
