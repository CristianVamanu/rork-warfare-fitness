# Warfare Fitness — Android app (Play Store)

The Android app is a **Trusted Web Activity**: a native Android shell, published on Google Play, that opens `https://warfarefitness.com` full screen with no browser bar. The web app is the app. Every deploy of the site is an update of the Android app, with nothing to resubmit.

What this folder holds:

| File | Purpose |
|---|---|
| `twa-manifest.json` | Bubblewrap project definition (package name, colours, icons, shortcuts). |
| `store/icon-512.png` | Play Console app icon (512 × 512). |
| `store/feature-graphic.png` | Play Console feature graphic (1024 × 500). |

The site side is already in the repo:

- `/.well-known/assetlinks.json` is served by `src/app/api/android/assetlinks/route.ts` from two environment variables (see step 3).
- `public/icons/` holds the real logo at every size, including maskable 192 and 512.
- `src/app/manifest.ts` declares them.

## 1. Build the app bundle

Two ways. **PWABuilder needs nothing installed** and is the one to use first.

### Option A — PWABuilder (no Android SDK)

1. Open <https://www.pwabuilder.com>, enter `https://warfarefitness.com`, click **Package for stores → Android**.
2. Fill the form exactly like `twa-manifest.json`:
   - Package ID `com.warfarefitness.app`
   - App name `Warfare Fitness`, launcher name `Warfare`
   - Start URL `/dashboard?source=android`
   - Theme `#F5A623`, background `#0A0A0A`, navigation `#0A0A0A`
   - Display `standalone`, orientation `portrait`
   - Signing key: **Create new** (first time) — download and keep the keystore and passwords. You need the same key for every future upload.
3. Download the zip. It contains `app-release-bundle.aab` (upload this), `app-release-signed.apk` (sideload for testing), `assetlinks.json` and `signing-key-info.txt`.

### Option B — Bubblewrap (local, needs JDK 17 + Android SDK)

```bash
npm i -g @bubblewrap/cli
cd android
bubblewrap init --manifest https://warfarefitness.com/manifest.webmanifest   # first time only; it reads twa-manifest.json
bubblewrap build                                                           # creates app-release-bundle.aab + app-release-signed.apk
bubblewrap fingerprint list                                                # prints the SHA-256 of the upload key
```

Bubblewrap offers to download the JDK and SDK itself on first run. Keep `upload-key.keystore` out of git (it is ignored) and backed up.

## 2. Sideload and test

```bash
adb install app-release-signed.apk
```

Before step 3 is done the app opens with a Chrome URL bar. That is expected. After step 3 the bar disappears within a minute of the first launch.

## 3. Tell the site to trust the app (removes the URL bar)

The site must list the SHA-256 fingerprint of **every key that signs the app**:

- **Upload key** — from `signing-key-info.txt` (PWABuilder) or `bubblewrap fingerprint list`.
- **Play App Signing key** — Google re-signs production builds. In Play Console: *Test and release → Setup → App signing → App signing key certificate → SHA-256*.

Set both on the server (`.env` on the VPS, then restart):

```
ANDROID_PACKAGE_NAME=com.warfarefitness.app
ANDROID_SHA256_FINGERPRINTS=AA:BB:...:99,11:22:...:00
```

Check: `curl https://warfarefitness.com/.well-known/assetlinks.json` must list the package and both fingerprints. Google's checker: <https://developers.google.com/digital-asset-links/tools/generator>.

## 4. Play Console

1. Create the app: name *Warfare Fitness*, app, free, category Health & Fitness.
2. Store listing: short and full description (below), `store/icon-512.png`, `store/feature-graphic.png`, at least 4 phone screenshots (use the mockups in the marketing kit or real device captures, 1080 × 1920).
3. App content: privacy policy `https://warfarefitness.com/privacy`, data safety form (account email, health & fitness data, payments via Stripe, no ads), content rating questionnaire, target audience 18+.
4. Upload `app-release-bundle.aab` to **Internal testing** first. Install from the tester link on a real phone and run through: sign in, onboarding, checkout, training session, nutrition photo, notifications.
5. Promote to **Production**. First review usually takes a few days.

Subscriptions are sold on the website through Stripe, not in the app with Google Play Billing. The app never shows an in-app purchase UI, which keeps it out of Play's billing requirement. Do not add a purchase button that opens Stripe inside the app without checking the current Play payments policy first.

### Store listing copy

**Short description (80 chars max)**

> Real programs, logged meals and military-grade standards. Show up. It does the rest.

**Full description**

> Warfare Fitness hands you a real training program and tells you exactly what to do today.
>
> Answer two minutes of questions and you get a program matched to your goal, experience and equipment. Each session is written out: the exercises, the sets, the weight to beat from last time. Log a meal from a photo. Track fasts, habits, streaks and levels. Measure yourself against published military fitness standards and close the gap.
>
> • Programs that adapt to what you actually lifted
> • Instant food analyser from a photo
> • Barcode health scores
> • Fasting timer with stages
> • Habit breaker with streaks
> • XP, levels and achievements
> • Scan any gym and get a workout from the equipment you see
> • Community channels, PR wall and weekly challenges
>
> Membership is managed at warfarefitness.com.

## 5. Releasing updates

Site changes need nothing. Bump `appVersionCode` and `appVersionName` in `twa-manifest.json` and rebuild only when you change something in the shell itself (icon, name, colours, shortcuts, start URL) or when Play asks for a newer target SDK.
