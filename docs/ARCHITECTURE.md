# Warfare Fitness — Architecture & Migration Roadmap

## 1. Migration Architecture Overview

### Current State
- **Runtime:** Expo Router (React Native + Web via react-native-web)
- **Auth:** AsyncStorage + hardcoded password comparison (no real auth)
- **Database:** AsyncStorage (client-only), Firestore for admin settings + subscriptions
- **Backend:** Hono + tRPC on Vercel Edge/Node
- **Auth middleware:** Spoofable `x-user-data` JSON header

### Target State
- **Frontend:** Expo Router web (kept) → Next.js App Router (future migration, Phase 8+)
- **Auth:** Firebase Authentication (email/password, custom claims for admin)
- **Database:** Firestore (user profiles, workouts, subscriptions, community)
- **Backend:** Next.js API Routes (future) → current Hono+tRPC kept for Phase 1–5
- **Auth middleware:** Firebase ID token verification on every protected API call

### Migration Principles
1. Do not break working business logic
2. Migrate auth first (unblocks everything else)
3. Migrate data layer second (one collection at a time)
4. SaaS multi-tenancy third (trainers → orgs → clients)
5. Subscriptions and billing fourth
6. AI services last (currently working, just needs securing)

---

## 2. Database Schema

### Firestore Collections

```
warfare_admin/settings          ← Admin UI config (existing)
  adminEmails: string[]         ← NEW: controls who gets isAdmin
  stripePaymentLink: string
  stripePortalLink: string
  monthlyPrice: string
  aiApiKey: string              ← REMOVE in Phase 2 (move to env)
  ...

users/{uid}                     ← NEW in Phase 1
  uid: string
  email: string
  name: string
  username: string
  isAdmin: boolean
  isTrainer: boolean
  trainerApproved: boolean
  weightUnit: 'lbs' | 'kg'
  avatar: string
  referralCode: string
  referredBy?: string
  totalReferrals: number
  registrationDate: string
  height?: string
  weight?: string
  age?: string
  goal?: string
  createdAt: Timestamp
  updatedAt: Timestamp

users/{uid}/workouts/{id}       ← Phase 2
  programId: string
  dayIndex: number
  completedAt: Timestamp
  exercises: ExerciseLog[]
  totalVolume: number
  flagged: boolean

users/{uid}/meals/{id}          ← Phase 2
  name: string
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber?: number
  mealType: string
  loggedAt: Timestamp

users/{uid}/progress/{date}     ← Phase 2
  weight?: number
  bodyFat?: number
  measurements: Record<string, number>

subscriptions/{uid}             ← Existing (Stripe webhook writes)
  status: string
  isPremium: boolean
  currentPeriodEnd: string
  ...

organizations/{orgId}           ← Phase 3
  name: string
  ownerId: string               ← trainer who created org
  logoUrl: string
  stripeAccountId?: string
  plan: 'free' | 'pro' | 'enterprise'
  memberCount: number

organizations/{orgId}/members/{uid}    ← Phase 3
  role: 'trainer' | 'client' | 'admin'
  joinedAt: Timestamp
  assignedPrograms: string[]

trainer_programs/{programId}    ← Phase 3 (move from AsyncStorage)
  trainerId: string
  orgId?: string
  title: string
  ...

community/channels/{channelId}/messages/{msgId}  ← Phase 2
  authorId: string
  content: string
  createdAt: Timestamp
```

### Security Rule Groups (Phase 1)
```
users/{uid}        → read/write: request.auth.uid == uid
subscriptions/{uid} → read: request.auth.uid == uid | write: false (admin SDK only)
warfare_admin/**   → read: request.auth != null | write: false (admin SDK only)
```

---

## 3. Authentication Design

### Firebase Auth (Phase 1)
- **Provider:** Email + Password
- **Admin detection:** `adminEmails[]` array in `warfare_admin/settings` Firestore doc
- **Admin enforcement (server-side):** `ADMIN_EMAILS` env var checked after token verification
- **Session persistence:** Firebase Auth handles token refresh automatically

### Token Flow
```
Client login → signInWithEmailAndPassword(email, password)
            → Firebase Auth returns User + ID token (JWT, 1h expiry)
            → Token auto-refreshes via onIdTokenChanged
            → All tRPC calls send: Authorization: Bearer <idToken>
            → Server: admin.auth().verifyIdToken(token) → decodedToken
            → Server: isAdmin = ADMIN_EMAILS.includes(decodedToken.email)
```

### Admin Role Setup
1. Set `ADMIN_EMAILS=admin@warfarefitness.com,superadmin@warfarefitness.com` in Vercel env vars
2. Create those users in Firebase Auth console (or via registration flow)
3. Server middleware grants admin access automatically based on email match

### Password Reset
- Firebase Auth's built-in `sendPasswordResetEmail()` replaces the PIN-based reset

### Future Auth Providers (Phase 3+)
- Google OAuth for trainer/client onboarding
- Apple Sign-In for iOS

---

## 4. Multi-Tenant Design

### Tenant Model
```
Organization (Tenant)
├── Owner (Trainer with billing)
├── Trainers (can create programs, manage clients)
└── Clients (consume programs, track progress)
```

### Data Isolation
- All user data scoped under `users/{uid}/...`
- Organization data scoped under `organizations/{orgId}/...`
- Firestore rules enforce: clients can only read their own org's data
- Trainers can read all clients in their org
- Platform admin can read all

### URL Structure (Future Next.js)
```
/                       → Landing page
/login, /register       → Auth
/dashboard              → Client dashboard
/trainer/               → Trainer portal
/trainer/clients        → Client list
/trainer/programs       → Program builder
/admin/                 → Platform admin
/[orgSlug]/             → Org-specific branding (Phase 4+)
```

### Revenue Split
- Platform takes configurable % (stored in `warfare_admin/settings.platformRevenueSplit`)
- Trainer receives remainder via Stripe Connect (Phase 4)

---

## 5. Billing Design

### Current (Phase 1–3)
- **Native:** RevenueCat (iOS/Android in-app purchases)
- **Web:** Stripe Payment Links + webhook → Firestore

### Target (Phase 4)
```
Subscription Tiers:
  Free:     Day 1–7 of any program, basic community
  Premium:  All programs, challenges, AI features
  Trainer:  Create/sell programs, manage clients, analytics
  Pro:      White-label, custom domain, Stripe Connect

Stripe Products:
  price_premium_monthly   → $9.99/mo
  price_premium_annual    → $79.99/yr
  price_trainer_monthly   → $29.99/mo
  price_trainer_annual    → $299.99/yr

Webhook events:
  customer.subscription.created   → set isPremium=true
  customer.subscription.updated   → update status
  customer.subscription.deleted   → set isPremium=false
  checkout.session.completed      → link client_reference_id to userId
```

### Access Control Gates
- `canAccessContent(day)` → `isPremium || day <= freeTrialDays`
- `canCreateProgram()` → `isTrainer && (isPremium || orgOwner)`
- `canManageOrg()` → `isAdmin || orgOwner`

---

## 6. AI Services Design

### Food Analyzer (tRPC: food.scan)
- Input: base64 image OR barcodeId
- Backend: OpenAI GPT-4o-mini Vision
- Barcode fallback: Open Food Facts API text lookup
- Rate limit: 10 req/min per user (Phase 1: no limit, Phase 7: add limit)
- Auth: requires valid Firebase ID token (Phase 1)

### Barcode Scanner (Web Fix — Phase 5)
- Current: expo-camera (native only, broken on web)
- Fix: ZXing-js for browser OR BarcodeDetector Web API with ZXing fallback
- Implementation: `components/BarcodeScanner.web.tsx` (platform-specific file)

### AI Trainer Chat (tRPC: aiTrainer.chat)
- OpenAI GPT-4o-mini with system prompt
- No conversation history persistence (Phase 5: add Firestore history)

### AI Program Generator (tRPC: programs.generateWithAi)
- OpenAI function calling to generate structured program JSON
- Rate limit: 3 req/day per user (Phase 7)

---

## 7. Deployment Design

### Vercel (Primary — current)
```
vercel.json:
  /api/*   → backend/hono.ts (Node.js runtime)
  /**      → dist/ (Expo web export)

Env vars required:
  EXPO_PUBLIC_FIREBASE_*     (client-side Firebase config)
  FIREBASE_SERVICE_ACCOUNT_KEY  (base64 JSON)
  OPENAI_API_KEY
  STRIPE_WEBHOOK_SECRET
  ADMIN_EMAILS               (comma-separated admin emails)
  EXPO_PUBLIC_RC_IOS_KEY
  EXPO_PUBLIC_RC_ANDROID_KEY
```

### VPS / DigitalOcean / Hostinger (Self-hosted)
```
Requirements:
  Node.js 20+
  PM2 or Docker
  Nginx reverse proxy
  SSL (Let's Encrypt)

Run:
  npm run build:web          → generates dist/
  node backend/hono.ts       → API server on :3000
  nginx: /api → :3000, / → dist/

Docker (Phase 7):
  Dockerfile: multi-stage build
  docker-compose.yml: app + nginx
```

### PostgreSQL Migration Path (Phase 8+)
```
Current: Firestore (NoSQL)
Target:  PostgreSQL via Prisma ORM

Migration strategy:
  1. Add Prisma schema mirroring Firestore collections
  2. Write dual-write adapter (writes to both Firestore + PG)
  3. Backfill PG from Firestore export
  4. Switch reads to PG
  5. Remove Firestore writes
  6. Self-hosted: use Supabase or Railway for managed PG
```

---

## 8. Phased Implementation Backlog

---

### PHASE 1 — Security (Current Sprint)

**Goal:** Remove all hardcoded credentials, implement real authentication, secure the API.

#### Files to Create
| File | Purpose |
|------|---------|
| `lib/firebase-client.ts` | Firebase app + Auth singleton initialized from env vars |
| `docs/ARCHITECTURE.md` | This document |

#### Files to Modify
| File | Change | Why |
|------|--------|-----|
| `contexts/AppContext.tsx` | Replace hardcoded auth with Firebase Auth | CRITICAL security fix |
| `lib/trpc.ts` | Add `Authorization: Bearer <idToken>` header | Enables secure API calls |
| `backend/firebase-admin.ts` | Add `verifyIdToken()` helper | Needed by API middleware |
| `backend/trpc/create-context.ts` | Verify Firebase ID token; check ADMIN_EMAILS env var | Replace spoofable header |
| `firestore.rules` | Require `request.auth.uid` for user data | Tighten security |
| `env.example` | Add `ADMIN_EMAILS` | Document new required var |

#### Effort: 1–2 days

#### Risks
- Existing users lose session (must re-login after Firebase Auth migration) — acceptable for pre-launch
- Firebase Auth initialization may conflict with dynamic config loading in FirebaseContext — mitigated by using env-var-based singleton

#### Phase 1 Complete When
- [ ] Build passes (`npm run build:web`)
- [ ] TypeScript passes (`tsc --noEmit`)
- [ ] Lint passes (`npm run lint`)
- [ ] No `ADMIN_CREDENTIALS` or `ADMIN_EMAILS` hardcoded in source
- [ ] Login via Firebase Auth works (email/password)
- [ ] Admin access works (email in `ADMIN_EMAILS` env var)
- [ ] API protected routes verify ID token
- [ ] Firestore rules use `request.auth`

---

### PHASE 2 — Persistence

**Goal:** Migrate all critical user data from AsyncStorage to Firestore.

#### Files to Create
- `lib/firestore-sync.ts` — bidirectional sync helpers
- `backend/trpc/routes/users/profile/route.ts` — get/update user profile
- `backend/trpc/routes/users/workouts/route.ts` — log + list workouts
- `backend/trpc/routes/users/meals/route.ts` — log + list meals

#### Files to Modify
- `contexts/AppContext.tsx` — write profile to Firestore on update
- `contexts/TrainingContext.tsx` — write workouts to Firestore
- `contexts/CommunityContext.tsx` — read/write messages from Firestore
- `firestore.rules` — add `users/{uid}/workouts`, `users/{uid}/meals` rules
- `app/logout.tsx` (new) — clear AsyncStorage on logout

#### Effort: 3–5 days

#### Risks
- Large contexts need careful refactoring to avoid breaking UI
- Community real-time sync requires Firestore `onSnapshot` listeners

---

### PHASE 3 — SaaS Core

**Goal:** Multi-tenant architecture with trainer/client/org relationships.

#### Files to Create
- `backend/trpc/routes/orgs/create/route.ts`
- `backend/trpc/routes/orgs/members/route.ts`
- `contexts/OrgContext.tsx`
- `app/(tabs)/trainer/` — trainer portal screens
- `app/(tabs)/clients/` — client management screens

#### Files to Modify
- `contexts/TrainerContext.tsx` — persist trainer programs to Firestore
- `firestore.rules` — add org-scoped rules
- `contexts/SubscriptionContext.tsx` — add `isTrainer` tier check

#### Effort: 5–8 days

---

### PHASE 4 — Subscriptions

**Goal:** Production-grade Stripe billing with multiple tiers and Stripe Connect.

#### Files to Create
- `backend/trpc/routes/billing/create-checkout/route.ts`
- `backend/trpc/routes/billing/portal/route.ts`
- `backend/trpc/routes/billing/trainer-connect/route.ts`

#### Files to Modify
- `backend/hono.ts` — add checkout.session.completed webhook event
- `contexts/SubscriptionContext.tsx` — add trainer tier
- `app/paywall.tsx` — add annual pricing option
- `firestore.rules` — ensure subscription data is uid-scoped

#### Effort: 3–5 days

---

### PHASE 5 — AI Services

**Goal:** Fix broken barcode scanner on web; add conversation history to AI trainer.

#### Files to Create
- `components/BarcodeScanner.web.tsx` — ZXing-js implementation
- `backend/trpc/routes/ai-trainer/history/route.ts`

#### Files to Modify
- `app/barcode-scanner.tsx` — use platform-specific scanner component
- `app/food.tsx` — fix "pattern match" error on web
- `backend/trpc/routes/food/scan/route.ts` — improve error messages

#### Effort: 2–3 days

---

### PHASE 6 — PWA

**Goal:** Installable PWA with offline support and push notifications.

#### Files to Create
- `public/manifest.json` — PWA manifest
- `public/sw.js` — service worker
- `app/pwa-install-prompt.tsx` — install banner component

#### Files to Modify
- `vercel.json` — add PWA headers
- `app/_layout.tsx` — register service worker

#### Effort: 2–3 days

---

### PHASE 7 — Production Hardening

**Goal:** Rate limiting, error monitoring, GDPR, Docker deployment.

#### Files to Create
- `backend/middleware/rate-limit.ts`
- `app/privacy-policy.tsx`
- `app/terms.tsx`
- `Dockerfile`
- `docker-compose.yml`
- `backend/trpc/routes/users/delete/route.ts` — GDPR deletion

#### Files to Modify
- `backend/hono.ts` — add rate limiting middleware
- `backend/trpc/create-context.ts` — structured logging
- All console.log calls → gated by `process.env.NODE_ENV`

#### Effort: 3–4 days

---

## 9. Current Issues to Fix (Pre-Phase 1)

These are carried over from the previous audit:

1. **AI Food Analyzer "pattern match" error on web** — Phase 5
2. **Barcode scanner broken on web** — Phase 5  
3. **`isTrialExpired()` always returns false** — Phase 2
4. **AsyncStorage not cleared on logout** — Phase 1 (fix logout)
5. **No rate limiting on AI endpoints** — Phase 7
