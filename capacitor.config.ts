import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native shells for iOS and Android.
 *
 * The apps load the live site, not a bundled copy: every deploy of
 * warfarefitness.com is an update of both apps with nothing to resubmit. What
 * the shells add is the native bridge — Apple HealthKit and Google Health
 * Connect (steps, sleep, heart rate, weight, workouts) through
 * @capgo/capacitor-health — which no browser or web wrapper can reach.
 *
 * `webDir` is a one-line redirect that only shows if the site is unreachable
 * on first launch; with `server.url` set it is never the app.
 */
const config: CapacitorConfig = {
  appId: 'com.warfarefitness.app',
  appName: 'Warfare Fitness',
  webDir: 'cap-web',
  server: {
    url: 'https://warfarefitness.com/dashboard?source=native',
    androidScheme: 'https',
    // Shown instead of the web view's raw error page when the site cannot be
    // reached (first launch offline, captive portal). Reloads when back online.
    errorPath: 'offline.html',
    // Google sign-in opens inside the app's web view. No Stripe: the apps do
    // not sell (src/lib/native/billing.ts).
    allowNavigation: ['warfarefitness.com', '*.warfarefitness.com', 'accounts.google.com', '*.firebaseapp.com'],
  },
  backgroundColor: '#0A0A0A',
  // The site's CSP only allows nonce'd scripts, which would block the bridge
  // script Capacitor injects. src/middleware.ts recognises this UA marker and
  // relaxes script-src for the app's own web view only.
  // No web-view debugging or bridge logging in the shipped builds.
  loggingBehavior: 'production',
  android: {
    allowMixedContent: false,
    appendUserAgent: 'WarfareFitnessNative',
    webContentsDebuggingEnabled: false,
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#0A0A0A',
    appendUserAgent: 'WarfareFitnessNative',
  },
  plugins: {
    SplashScreen: { launchShowDuration: 0 },
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
};

export default config;
