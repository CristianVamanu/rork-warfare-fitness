# Warfare Fitness — native apps (Capacitor)

The iOS and Android apps are Capacitor shells (`capacitor.config.ts`, `android/`,
`ios/`). They load `https://warfarefitness.com` with the native bridge injected, so
every deploy of the site is an update of both apps with nothing to resubmit. The
shells add what the web cannot reach: **Apple HealthKit** and **Google Health
Connect** (steps, sleep, heart rate, weight, workouts) through
`@capgo/capacitor-health`, read by `src/lib/native/health.ts` and shown by
`src/components/dashboard/HealthCard.tsx`.

This folder holds the Play Console assets: `icon-512.png`, `feature-graphic.png`
and the 8 store screenshots.

## Android

Built by GitHub Actions (`.github/workflows/android.yml`):

- Any push to `main` that touches the shell → unsigned debug APK (sideload to test).
- **Actions → Android app → Run workflow** with a version code and name → signed
  `app-release.aab` for Play plus a signed APK. Needs these repository secrets:
  `ANDROID_KEYSTORE_BASE64` (`base64 -w0 signing.keystore`),
  `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

The version code must go up by one for every upload to Play.

Locally (needs Android Studio): `npx cap sync android && npx cap open android`.

Health Connect needs Android 8+ (`minSdkVersion 26`), the history permission in
`AndroidManifest.xml` and the privacy policy URL in `res/values/strings.xml` —
all already set. Play's **Health apps** declaration must be filled in for the
listing, and the Health Connect data types must be declared when Play asks.

## iOS

Needs a Mac with Xcode (or a macOS CI runner) and an Apple Developer account:

```bash
npx cap sync ios && npx cap open ios
```

In Xcode: Signing & Capabilities → select the team. The HealthKit capability is
already in `ios/App/App/App.entitlements` and the usage strings in `Info.plist`.
Archive → Distribute → App Store Connect.

## Store listing (Play Console)

- Category **Health & Fitness**, free, 18+, no ads.
- Privacy policy `https://warfarefitness.com/privacy`.
- App access: the app needs an account — give the reviewers a test login.
- Data safety: account email and name, health and fitness data (read from
  Health Connect with consent), photos for meal analysis, purchases via Stripe on
  the website. Encrypted in transit, deletable on request, not sold.
- Subscriptions are sold on the website through Stripe; the app has no in-app
  purchase UI.

### Short description (80 chars max)

> Real programs, logged meals and military-grade standards. Show up. It does the rest.

### Full description

> Warfare Fitness hands you a real training program and tells you exactly what to do today.
>
> Answer two minutes of questions and you get a program matched to your goal, experience and equipment. Each session is written out: the exercises, the sets, the weight to beat from last time. Log a meal from a photo. Track fasts, habits, streaks and levels. Connect your watch and see your steps, sleep and heart rate next to your training.
>
> • Programs that adapt to what you actually lifted
> • Instant food analyser from a photo
> • Barcode health scores
> • Steps, sleep and heart rate from Health Connect
> • Fasting timer with stages
> • Habit breaker with streaks
> • XP, levels and achievements
> • Scan any gym and get a workout from the equipment you see
> • Community channels, PR wall and weekly challenges
>
> Membership is managed at warfarefitness.com.

## Releasing updates

Site changes need nothing. Rebuild and upload only when the shell itself changes
(icon, name, plugins, permissions) or when a store asks for a newer target SDK.
