# Warfare Fitness — code audit

**Date:** 2026-09-07 · **Commit:** `1e94702` · **Method:** read the code, ran the
tests, grepped for the failure shapes. Everything below cites a file and line
you can open. Where I could not verify something, it is in §7 rather than
stated as fact.

---

## 1. Verdict

**You are ready to take 1,000 paying users. You are not ready to go viral —
not because the code would fall over, but because there is nothing in it that
makes one user become two.**

Those are two different problems and they need different work. The engineering
is in good shape: billing is correct, the paywall fails closed, backups run and
can now be restored, deploys no longer take the site down. What does not exist
is any growth mechanism at all — no referrals, no public content, no reason for
a member to bring someone with them.

The honest one-line summary: **the product is sound and the distribution is
zero.**

| Area | State |
|---|---|
| Billing correctness | Strong — webhook ordering guarded, reconciler works, tested |
| Access control | Strong — rules deny by default, privileged fields locked |
| AI cost exposure | Controlled — every OpenAI route is authed and quota'd or admin-only |
| Backup / recovery | Strong — 3 layers, restore UI shipped, documented |
| Deploy safety | Fixed today — was causing an outage on every push |
| Email reliability | **Weak — failures are silent, one path locks users out** |
| Scale to 1k paying | Fine, with two queries to bound first |
| Growth machinery | **Absent** |

---

## 2. What is genuinely solid

Stated because an audit that only lists problems gives you no idea what to
leave alone.

- **No unauthenticated privileged surface.** I checked all 60 API routes. The
  11 that take no token are all correctly public: `health`, `dynamic-favicon`,
  `public/*`, the two lead forms (rate-limited), `client-error` (rate-limited),
  `install` (three server-side guards), and the Stripe webhook (signature
  verified). `ai/nutrition-targets` is public but is pure arithmetic —
  `src/app/api/ai/nutrition-targets/route.ts` makes no OpenAI call at all.
  `ai/build-my-program` is a 410 stub.
- **No AI cost hole.** Every route that actually calls OpenAI is either
  authenticated + quota'd + feature-gated (`chat`, `analyze-food`,
  `meal-ideas`, `scan-and-go`) or admin-only (`generate-program`,
  `extract-document`). I specifically went looking for an open tap and did not
  find one.
- **Privileged fields are locked at the rules layer.** `firestore.rules:290`
  denies self-writes to `role`, `membership`, `coaching`,
  `purchasedProgramIds`, `banned`, `prBan`, `trialUsedAt`, `twoFactorEnabled`,
  `twoFactorEmail`, `stripeCustomerId`. A member cannot grant themselves
  access from the browser console.
- **151 unit tests + 43 rules tests, all passing.** `tsc` clean, build clean.
- **Zero TODO/FIXME/HACK markers and no empty catch blocks** across 51k lines.
  Unusual, and it shows.
- **Trial logic is carefully reasoned** (`src/lib/membership.ts`) — it
  correctly distinguishes app-managed free trials from Stripe-managed paid
  ones, which is the exact place these systems usually rot.

---

## 3. Bugs and risks, by priority

### ~~P1~~ FIXED (`ff3a576`→) — a mail failure locks a member out of their own account, silently

**`src/app/api/auth/2fa/login-check/route.ts:98`**

The route sets the 2FA-pending claim, then calls `sendEmail(...)` and ignores
what it returns. `sendEmail` (`src/lib/email.ts:24`) **never throws** — it
catches everything and returns `false`. So when Resend is rate-limited, down,
or misconfigured, this route still returns `{ required: true }`, the UI says
"we sent you a code", and no code was sent. The account is now stuck in
tfa-pending, where the Firestore rules refuse reads. "Resend code" fails the
same silent way.

The comment directly above it reasons carefully about failing closed on mail
trouble — and the intent is right — but it assumes a throw that cannot happen.

Note this is **not** a security hole: failing closed is the safe direction, and
the code document is written correctly. It is a lockout with a misleading
message, which is a support incident per affected user.

The other two mail paths get this right, which is what makes it a bug rather
than a policy: `verify-email/send/route.ts:61` returns a 502 on failure, and
`send-auth-email/route.ts:117` returns `delivered: sent`. This one route is
the outlier.

**Fixed.** The route now checks the return value and returns a 502 with a
plain message. It still fails closed — the claim stays set, no session is
granted — but the member is told what happened. Both callers already handled a
non-ok response correctly (`LoginClient.tsx:180` signs out with an accurate
toast; `verify-2fa/page.tsx:76` shows a resend error), so the fix composes
without a client change.

### ~~P1~~ FIXED — email delivery failures are invisible to you

**`src/lib/email.ts:13-28`**

Every send is fire-and-forget: on failure it logs to `console.error` and
returns `false`. There is no retry, no dead-letter, and no alert. The daily
error digest reads the `errorReports` collection (client-side errors) — it does
not read server logs, so a total Resend outage produces **no signal anywhere
you would look.**

At 1,000 paying users the traffic through this is: email verification, password
reset, 2FA codes, trial-ending reminders, payment-failed dunning, achievement
mails. Trial-ending and dunning are directly revenue-bearing. Silent failure
means churn you cannot explain.

Worth knowing: **Resend's free tier is 100 emails/day / 3,000 per month.** At
1,000 users you will cross that on transactional mail alone, and the failure
mode is exactly this silent one.

**Fixed.** `sendEmail` now retries once on 429/5xx/network (Resend's limit is
per-second, so a short pause genuinely clears the notification-sweep bursts)
and records failures into `errorReports` — the collection the daily digest
already reads. Rows are fingerprinted on the reason, so an outage reads as one
row with a count of 400 rather than 400 rows burying everything else. Covered
by 9 tests in `src/lib/email.test.ts`, including that the row carries
`lastSeenAt` — the digest orders by it, and Firestore silently omits documents
missing the ordered field, which would have made the whole fix invisible.

**Still yours:** move to a paid Resend plan before launch. The free tier is
100/day and you will cross it on transactional mail alone.

### P2 — three admin queries read an entire collection with no limit

- `src/lib/firestore.ts:1421` `getAllUsers()` — `getDocs(collection(db,'users'))`,
  no limit, no pagination. Every visit to the admin Clients tab reads every
  user document. At 1,000 users that is 1,000 reads a click; at 10,000 the page
  stops being usable.
- `src/lib/firestore.ts:245` `getLandingLeads()` and `:250` `getTrainerLeads()`
  — whole collection, ordered, unbounded.
- `src/lib/firestore.ts:2623` `getCoachingApplications()` — same shape.

The irony is precise: **these are the collections that grow when marketing
works.** The more successful you are, the slower and more expensive your own
admin panel gets. This is not urgent at today's size and it is not a user-facing
bug — but it is the thing that breaks *because* you succeeded.

**Fix:** `limit(100)` plus a "load more" cursor on each. Half a day for all four.

### P2 — a missing index degrades into reading a user's entire history

**`src/lib/firestore.ts:142`.** The `failed-precondition` fallback re-runs the
query with only `where('userId','==',uid)` and filters in JavaScript. That is
the correct instinct (don't break the page over a missing index) but it means a
single un-deployed index quietly turns into a full per-user collection scan on
every call, growing forever with that member's history.

**Fix:** keep the fallback, add `limit()` to it, and make it write an
`errorReports` entry so a missing index shows up in your daily digest instead
of hiding as a slow page.

### P2 — pm2 has no memory ceiling

**`ecosystem.config.js`** sets `instances: 2` and `exec_mode: cluster` but no
`max_memory_restart`. A leak or one oversized request grows until the OOM
killer takes the worker at the OS level. `max_memory_restart: '600M'` makes pm2
recycle it cleanly first. One line.

### P2 — 23 npm advisories (16 moderate, 7 high)

`postcss`, `serialize-javascript` and `uuid` are build-time only — low real
risk. **`undici` (high) is different**: it comes in through `firebase-admin`
and runs in production on every request that touches the Admin SDK. Worth
resolving deliberately rather than with `--force`, which would try to move you
across major versions of `firebase-admin`.

### P3 — XP is still client-writable

`xp` is not in the restricted-fields list (`firestore.rules:290`), so a member
can set their own. **This got much less important when you removed the
leaderboard** — the incentive to forge it largely left with the rankings. It
now only affects that member's own level display, quests and achievements.
Worth fixing eventually; not worth blocking launch.

### P3 — single point of failure, and no staging

One VPS. If the box dies, everything dies — app, database access, backups
trigger. Firestore and R2 survive independently (that is why the R2 backups
matter), but there is no second machine and no way to test a deploy anywhere
except production. Every change you and I have shipped went straight to live.
Provider snapshots plus a scratch Firebase project would cover most of this
cheaply.

---

## 4. Scale: can you take 1,000 paying users?

**Yes.** The work from previous sessions holds up under reading:

- Sharded org counter (10 shards) removes the hot-document write ceiling.
- Cron sweeps page 300 users at a time with concurrency 6 — bounded memory.
- The realtime poll was replaced with a listener.
- Backups stream via NDJSON + gzip rather than buffering the database.
- The paywall fails closed; the reconciler actually reconciles (it did not,
  until it was fixed — every corrective write used dotted-key `set()`).

At 1,000 paying users the two things that will actually bite are **the Resend
free-tier ceiling** (§3, P1) and **the unbounded admin queries** (§3, P2).
Neither is deep architecture; both are an afternoon.

Where 5,000+ would need real work: server-side XP, entitlement consolidation,
a second app server, and a read-replica pattern for the admin panel. None of
that is needed yet, and building it now would be premature.

---

## 5. What is actually needed to go viral

This is the section that matters most, and it is the one where the codebase is
close to empty. I grepped for the machinery. Results:

| Mechanism | Present? | Evidence |
|---|---|---|
| Referral / invite system | **None** | zero files match `referral`; one incidental `invite` |
| Attribution on shared links | **None** | `WorkoutShareCard.tsx:51` shares the bare homepage URL |
| Public indexable content | **None** | `sitemap.ts` lists 8 URLs, all marketing/auth/legal |
| Dedicated share image | **None** | falls back to the logo (`layout.tsx:43`) |
| Workout share card | **Yes** | `WorkoutShareCard.tsx` — image + text via Web Share API |
| Streaks | Yes | 27 files |

### The three gaps, in the order I would close them

**1. The share button has no loop in it.** You already generate a good share
card — image, stats, streak, XP. Then line 51 appends the bare homepage URL.
Someone posts their workout, five friends see it, they land on a generic
homepage as strangers, and nothing connects them back. Add a referral code to
that URL, show the referrer's name on the landing page ("Cristian invited you"),
and give both sides something — a free month is the standard, and you already
have the entitlement plumbing to grant it. **This is the highest-leverage
change available to you**, because the sharing behaviour already exists and is
currently being wasted.

**2. You have nothing for Google to index.** Eight URLs, all login/legal/
marketing. Every program, every exercise in the library, is behind auth. A
fitness app's cheapest durable acquisition channel is exercise and program
content ranking in search. You already have the content in `exerciseLibrary`
and `programs` — publishing a public read-only view of it (with the workout
tracking behind the wall) is mostly routing work, not new material.

**3. Nothing brings a lapsed user back.** The cron sends trial-ending and
payment-failed mail. There is no "you're 2 days from losing your 14-day
streak", no weekly recap, no "your friend just posted a PR". Retention is not
virality, but a user who left never refers anyone.

### What I would not build

Not a leaderboard again — you removed it for exactly the right reason and
re-adding it would reintroduce the forgery problem you correctly walked away
from. Not social feeds beyond the PR wall you have. Virality here comes from
the share card loop, not from more in-app surface.

---

## 6. Priority order

**This week — before you take real money at volume**

1. Fix the 2FA email lockout (§3, P1). Small, and it costs you an account each
   time it fires.
2. Make email failures visible — log to Firestore, surface in the daily digest
   (§3, P1).
3. Move Resend to a paid plan. At 1,000 users the free tier will not hold.
4. Export the Firebase password hash parameters to your password manager. Still
   outstanding, and without it your backups cannot restore logins — the layer
   you would reach for on the worst day.
5. `max_memory_restart: '600M'` in `ecosystem.config.js`.

**This month — before you push for growth**

6. Referral codes on shared links, with a reward both ways. The single highest
   ROI item in this document.
7. Bound the four unbounded admin queries (§3, P2).
8. Public, indexable program and exercise pages.
9. Rehearse a restore into a scratch Firebase project. An untested backup is a
   file you are hoping about. This also gives you the staging environment you
   do not have.
10. Resolve the `undici` advisory deliberately.

**Later — when 5,000 is in sight**

11. Server-side XP.
12. Consolidate the entitlement checks.
13. Second app server; provider snapshots on a schedule.
14. Streak-risk and weekly-recap retention mail.

---

## 7. What I did NOT verify

Stated plainly so you know the edges of this.

- **I did not run the app.** Everything here is from reading code, running the
  test suite, and grepping. The restore UI in particular has server-side tests
  but has not been exercised against real R2 in a browser — that is still on
  you to click through.
- **I did not load-test.** The scale conclusions come from reading the query
  and paging patterns, not from measuring. "Fine at 1k" is an engineering
  judgement, not a benchmark.
- **I did not audit the Stripe dashboard** — webhook endpoint config, retry
  settings, tax, or your actual price objects. Only the code that receives them.
- **I did not verify email deliverability** — SPF/DKIM/DMARC on your sending
  domain. Worth checking independently; it is a common silent cause of exactly
  the failures §3 describes.
- **I did not review the mobile/PWA experience** on a real device.
- **The `deploy.sh` failure from 15:50 yesterday is still undiagnosed.** A step
  after the pm2 reload errored and fired the rollback trap. I narrowed the trap
  in `a05fb32` so it can no longer swap dependencies under a live server, but I
  never saw which step failed. The webhook-listener log will say.
