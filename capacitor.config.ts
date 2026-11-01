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
    // Stripe Checkout and Google sign-in open inside the app's web view.
    allowNavigation: ['warfarefitness.com', '*.warfarefitness.com', 'checkout.stripe.com', 'accounts.google.com', '*.firebaseapp.com'],
  },
  backgroundColor: '#0A0A0A',
  // The site's CSP only allows nonce'd scripts, which would block the bridge
  // script Capacitor injects. src/middleware.ts recognises this UA marker and
  // relaxes script-src for the app's own web view only.
  android: {
    allowMixedContent: false,
    appendUserAgent: 'WarfareFitnessNative',
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#0A0A0A',
    appendUserAgent: 'WarfareFitnessNative',
  },
  plugins: {
    SplashScreen: { launchShowDuration: 0 },
  },
};

export default config;
