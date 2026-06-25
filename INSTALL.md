# Warfare Fitness — Installation & Deployment Guide

Self-hosted fitness SaaS. One Firebase project = one trainer business.  
The installer runs **after** deployment and configures the application layer only.  
Firebase credentials are **never** entered in the installer — they come from environment variables set at deploy time.

---

## Architecture Overview

```
Firebase project (env vars) → Vercel deployment → /install wizard → system/config created → App live
```

| Layer | Config method |
|---|---|
| Firebase Auth, Firestore, Storage | `EXPO_PUBLIC_FIREBASE_*` env vars (set in Vercel before deploy) |
| Application config (app name, trainer, AI, billing) | `/install` wizard (runs once after deploy) |
| Admin identity | `system/config.adminUid` in Firestore (set by installer) |

---

## Step 1 — Create a Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project**
2. Disable Google Analytics (optional) → **Create project**

### Enable Authentication
- **Authentication → Get started → Email/Password → Enable → Save**

### Enable Firestore
- **Firestore Database → Create database → Production mode → choose region → Enable**

### Deploy Security Rules
1. Firestore → **Rules** tab
2. Replace the content with `firestore.rules` from this repository
3. Click **Publish**

### Get Firebase Config Keys
- **Project settings → General → Your apps → Add app → Web**
- Copy the `firebaseConfig` object. You need:
  `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`

### Create a Service Account (backend only)
1. **Project settings → Service accounts → Generate new private key** → download JSON
2. Convert to base64:
   ```bash
   base64 -i serviceAccountKey.json | tr -d '\n'
   ```
3. Keep the output — it becomes `FIREBASE_SERVICE_ACCOUNT_KEY`

---

## Step 2 — Deploy to Vercel

### Import the repository
1. [vercel.com](https://vercel.com) → **Add New Project** → import your fork
2. Framework preset: **Other**
3. Build command: `npx expo export --platform web`
4. Output directory: `dist`

### Set Environment Variables

Go to **Project → Settings → Environment Variables** and add all of these **before** the first successful deploy:

| Variable | Where to find it | Required |
|---|---|---|
| `EXPO_PUBLIC_FIREBASE_API_KEY` | firebaseConfig | ✅ |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | firebaseConfig | ✅ |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | firebaseConfig | ✅ |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | firebaseConfig | ✅ |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | firebaseConfig | ✅ |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | firebaseConfig | ✅ |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | base64 service account JSON | ✅ (backend) |
| `OPENAI_API_KEY` | platform.openai.com | Optional — can be added via installer |
| `STRIPE_WEBHOOK_SECRET` | Stripe dashboard | Optional — can be added via installer |

> **Important:** `EXPO_PUBLIC_*` variables are embedded at **build time** by Metro.  
> They must exist in Vercel **before** you click Deploy.

### Deploy
- Click **Deploy** (or push a commit). Wait for the build to finish.
- Open your Vercel URL — you will be redirected to `/install` automatically.

---

## Step 3 — Run the Installer (`/install`)

The installer is a one-time, 5-step wizard that runs on first visit.  
It **does not ask for Firebase credentials** — those come from env vars above.

### Step 1 — App Setup
| Field | Description |
|---|---|
| App Name | Displayed throughout the app (e.g. "Iron Den Fitness") |
| Trainer / Gym Name | Your name or gym name |
| Trainer Email | Contact email shown to members |
| Logo URL | Optional — publicly accessible image URL |

### Step 2 — Admin Account
| Field | Description |
|---|---|
| Admin Email | Creates a Firebase Auth account |
| Password | Min 6 characters |

This account's UID is stored as `system/config.adminUid`. It is the **permanent** system administrator.  
⚠ There is no "change admin" feature — to change admin, edit `system/config.adminUid` directly in Firestore.

### Step 3 — AI Setup (optional)
- Enter your OpenAI API key (`sk-...`)
- Click **Test Connection** to verify before saving
- Can be left blank and configured later in Admin → Settings

### Step 4 — Billing Setup (optional)
- Stripe Publishable Key (`pk_live_...`)
- Stripe Secret Key (`sk_live_...`)
- Webhook Secret (`whsec_...`)
- All optional — skip to use free tier only

### Step 5 — Finalize
- Review all settings
- Click **Finalize Installation**
- Creates `system/config` in Firestore with `setupCompleted: true`
- Redirects to `/login`
- **`/install` is permanently locked**

---

## Firestore Schema

### `system/config` (single document)

```jsonc
{
  "adminUid": "uid-of-first-admin",          // single source of truth for admin access
  "appName": "Iron Den Fitness",
  "trainerName": "John Smith",
  "trainerEmail": "john@ironden.com",
  "openAiKey": "sk-...",                      // stored server-side only
  "stripeConfig": {
    "publishableKey": "pk_live_...",
    "secretKey": "sk_live_...",               // stored server-side only
    "webhookSecret": "whsec_..."              // stored server-side only
  },
  "setupCompleted": true,
  "createdAt": "2025-01-01T00:00:00.000Z"
}
```

**Access rules:**
- Read: admin only (or any auth'd user if doc doesn't exist yet, to detect first install)
- Create: any authenticated user — but only if the document doesn't exist
- Update: admin only — `adminUid` field is immutable after creation
- Delete: never

---

## Auth & Admin Flow

```
User opens app
  └─ AuthGuard checks isSetupComplete()
       ├─ system/config missing → redirect /install
       └─ system/config.setupCompleted = true → normal auth flow
            ├─ Not logged in → /login
            └─ Logged in → app
                 └─ onAuthStateChanged
                      ├─ calls checkIsAdmin(uid)
                      │    └─ reads system/config.adminUid
                      └─ sets user.isAdmin = (uid === adminUid)
```

**Admin access check (client):**
```typescript
user.isAdmin === true
// set by: checkIsAdmin(uid) — compares uid to system/config.adminUid
```

**Admin access check (server / tRPC):**
```typescript
// backend/firebase-admin.ts
isAdminUid(uid) → reads system/config via Admin SDK
```

---

## Route Protection

| Route | Access |
|---|---|
| `/install` | Only if `system/config.setupCompleted !== true`. Permanently locked after completion. |
| `/login`, `/register` | Public (unauthenticated) |
| `/(tabs)/admin` | `user.isAdmin === true` only |
| `/admin-*` | `user.isAdmin === true` only |
| All other routes | Any authenticated user |

---

## Security Rules Summary

- `system/config` — admin-only read/write after installation; immutable `adminUid`
- `users/{uid}` — users own their data; can never write `isAdmin`, `trainerApproved`, `trainerRevenueSplit`
- `subscriptions/{uid}` — read-only for user; write only via Admin SDK (Stripe webhook)
- All sensitive keys (OpenAI, Stripe secret) — stored in `system/config`, accessible only by admin

---

## Alternative: Hostinger VPS Deployment

### Requirements
- Node.js 18+, PM2, Nginx

```bash
git clone https://github.com/your-org/warfare-fitness.git
cd warfare-fitness
npm install
cp env.example .env          # fill in EXPO_PUBLIC_FIREBASE_* values
npx expo export --platform web
npm install -g serve
pm2 start "serve dist -l 3000" --name warfare-fitness
```

**Nginx config:**
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
}
```

---

## Deployment Checklist

### Before deploying
- [ ] Firebase project created
- [ ] Email/Password authentication enabled
- [ ] Firestore database created in production mode
- [ ] Firestore security rules published (from `firestore.rules`)
- [ ] `EXPO_PUBLIC_FIREBASE_*` env vars set in Vercel
- [ ] `FIREBASE_SERVICE_ACCOUNT_KEY` env var set in Vercel

### After deploying
- [ ] Open the app URL — you should see the `/install` wizard
- [ ] Complete Step 1: App name, trainer name, email
- [ ] Complete Step 2: Create admin account (remember this email & password!)
- [ ] Complete Step 3: Add OpenAI key (optional)
- [ ] Complete Step 4: Add Stripe keys (optional)
- [ ] Click Finalize — confirm `system/config` is created in Firestore console
- [ ] Log in with your admin account
- [ ] Verify Admin tab is visible
- [ ] Open Admin → System Health — confirm all services show green

### Post-install verification
- [ ] Admin tab visible after login
- [ ] Admin → System Health: all 4 services green
- [ ] `system/config` exists in Firestore with `setupCompleted: true`
- [ ] `/install` route redirects away (permanently locked)

---

## Troubleshooting

### App redirects to `/install` on every load
`system/config` is missing or `setupCompleted !== true`. Re-run the installer, or manually create the document in Firestore.

### Installer fails at Step 2 (account creation)
- "email-already-in-use" → use a different email, or sign in with the existing account and set `adminUid` manually in Firestore
- "Firebase Auth not configured" → check `EXPO_PUBLIC_FIREBASE_*` env vars and redeploy

### Admin tab not visible after login
Check the browser console for `[AdminDebug]` logs:
- `system/config exists: false` → installer wasn't completed, or doc was deleted
- `checkIsAdmin result: false` → your UID doesn't match `system/config.adminUid`
- To fix: update `system/config.adminUid` in Firestore to match your UID (found in Firebase Auth → Users)

### How to change the admin
1. Firebase Console → Firestore → `system/config` → edit document
2. Change `adminUid` to the new user's UID
3. Previous admin loses access immediately on next page load

### Environment variables not working
- `EXPO_PUBLIC_*` vars are embedded at build time — set them **before** deploying
- After changing env vars in Vercel → **Redeploy** (don't just restart)

---

## Environment Variable Reference

```bash
# ── Frontend — embedded at build time by Metro (Expo) ──────────────────────
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=

# ── Backend — server-side only, never exposed to client ────────────────────
FIREBASE_SERVICE_ACCOUNT_KEY=     # base64-encoded service account JSON
OPENAI_API_KEY=                   # optional; can also be set via installer
STRIPE_WEBHOOK_SECRET=            # optional; can also be set via installer
```
