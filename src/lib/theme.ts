/**
 * Where light mode is allowed to show.
 *
 * Light mode is a member's preference for the app they use every day. It
 * was being applied to the whole site: the provider sat in the root layout,
 * read localStorage on every page, and put the `light` class on <html> for
 * anyone — so a member who switched to light and logged out found the
 * landing page, the login screen and every public page in light mode, and
 * it stayed that way until they cleared their browser. The brand is dark;
 * a stranger arriving from an ad, or a member who has just signed out, has
 * no preference to honour and must see the dark site.
 *
 * The rule, in one place: the preference applies only INSIDE the app shell
 * (the member and admin areas), only while signed in. Everywhere else, and
 * the moment someone signs out, the site is dark. The preference itself is
 * kept, so it is back the instant they sign in again.
 */

export type Theme = 'dark' | 'light';

/**
 * Null means "leave the document alone for now".
 *
 * Auth resolves asynchronously after hydration. Until it has, signedIn is
 * false for everyone — including a member whose session is about to be
 * restored — and writing 'dark' at that moment strips the class the
 * pre-hydration script just added, so a light-mode member watched the
 * dashboard go light, dark, light on every load. The class is only written
 * once the answer is known.
 */
export function resolveTheme(input: {
  preference: Theme;
  signedIn: boolean;
  inAppShell: boolean;
  authResolved?: boolean;
}): Theme | null {
  const { preference, signedIn, inAppShell, authResolved = true } = input;
  if (!authResolved) return null;
  if (!signedIn || !inAppShell) return 'dark';
  return preference;
}

/**
 * Routes rendered by the app or admin layouts, for the pre-hydration
 * script only.
 *
 * The real scoping does not use paths at all — AppThemeScope, mounted by
 * those two layouts, tells the provider it is inside the shell. This list
 * exists so a signed-in member with light mode does not see the dashboard
 * paint dark and then flip, which is what happens when the class can only
 * be added after hydration. The inline script in the root layout adds it
 * early on these paths; the provider still has the final say once it runs.
 *
 * A test keeps this list in step with the (app) directory: a new member
 * route must be listed here or explicitly excused below.
 */
export const APP_SHELL_PREFIXES: readonly string[] = [
  '/achievements', '/banned', '/breathing', '/community', '/dashboard', '/goals', '/habits',
  '/messages', '/notifications', '/nutrition', '/profile', '/progress', '/pt-test', '/quests',
  '/settings', '/support', '/training', '/verify-2fa',
  '/admin',
];

/**
 * App routes intentionally missing from APP_SHELL_PREFIXES, with the reason.
 * Empty at the moment: the last entry was /programs, shared with a public
 * route until the retired member stub under it was replaced by a redirect.
 */
export const APP_SHELL_BOOTSTRAP_EXCLUDED: Readonly<Record<string, string>> = {};

/**
 * The inline script for the root layout. Runs before any React; adds the
 * class only when there is a signed-in session marker, a saved light
 * preference, and an app-shell path. Every check is wrapped: storage can
 * throw in a private window, and the site must still load.
 */
export function themeBootstrapScript(): string {
  const prefixes = JSON.stringify(APP_SHELL_PREFIXES);
  return (
    "try{if(localStorage.getItem('theme')==='light'&&localStorage.getItem('wf:session')==='1'){" +
    `var p=location.pathname,a=${prefixes};` +
    "for(var i=0;i<a.length;i++){if(p===a[i]||p.indexOf(a[i]+'/')===0){document.documentElement.classList.add('light');break}}}}catch(e){}"
  );
}
