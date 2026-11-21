import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { resolveTheme, APP_SHELL_PREFIXES, APP_SHELL_BOOTSTRAP_EXCLUDED, themeBootstrapScript } from './theme';

describe('where light mode may show', () => {
  it('is dark everywhere for someone signed out — the bug this fixes', () => {
    // A member switched to light, logged out, and the landing page and
    // login screen were light. Nobody signed out has a preference to honour.
    expect(resolveTheme({ preference: 'light', signedIn: false, inAppShell: true })).toBe('dark');
    expect(resolveTheme({ preference: 'light', signedIn: false, inAppShell: false })).toBe('dark');
  });

  it('is dark on public pages even for a signed-in member who prefers light', () => {
    expect(resolveTheme({ preference: 'light', signedIn: true, inAppShell: false })).toBe('dark');
  });

  it('leaves the document alone until auth has resolved — the flash fix', () => {
    // Before auth resolves, signedIn is false for everyone. Writing 'dark'
    // then stripped the class the pre-hydration script had added, giving
    // a light-mode member light → dark → light on every app-shell load.
    expect(resolveTheme({ preference: 'light', signedIn: false, inAppShell: false, authResolved: false })).toBeNull();
    expect(resolveTheme({ preference: 'light', signedIn: false, inAppShell: true, authResolved: false })).toBeNull();
    // ...and decides normally once it has.
    expect(resolveTheme({ preference: 'light', signedIn: true, inAppShell: true, authResolved: true })).toBe('light');
    expect(resolveTheme({ preference: 'light', signedIn: false, inAppShell: true, authResolved: true })).toBe('dark');
  });

  it('honours the preference inside the app shell while signed in', () => {
    expect(resolveTheme({ preference: 'light', signedIn: true, inAppShell: true })).toBe('light');
    expect(resolveTheme({ preference: 'dark', signedIn: true, inAppShell: true })).toBe('dark');
  });
});

describe('the pre-hydration path list', () => {
  it('covers every route the (app) layout renders, or says why not', () => {
    // The list only prevents a flash; the layouts do the real scoping. But
    // a route missing from it flashes dark-to-light for every light-mode
    // member on every load, so a new (app) route must be added here or
    // explicitly excused.
    const appDir = join(process.cwd(), 'src', 'app', '(app)');
    const routes = readdirSync(appDir)
      .filter((name) => statSync(join(appDir, name)).isDirectory())
      .map((name) => `/${name}`);
    const missing = routes.filter((r) => !APP_SHELL_PREFIXES.includes(r) && !(r in APP_SHELL_BOOTSTRAP_EXCLUDED));
    expect(missing).toEqual([]);
  });

  it('includes the admin area and never a public route', () => {
    expect(APP_SHELL_PREFIXES).toContain('/admin');
    for (const pub of ['/', '/login', '/onboarding', '/standards', '/programs', '/checkout', '/privacy', '/terms']) {
      expect(APP_SHELL_PREFIXES).not.toContain(pub);
    }
  });

  it('produces a script that only ever ADDS the class, guarded on both flags', () => {
    const s = themeBootstrapScript();
    expect(s).toContain("localStorage.getItem('theme')==='light'");
    expect(s).toContain("localStorage.getItem('wf:session')==='1'");
    expect(s).toContain("classList.add('light')");
    expect(s).not.toContain('classList.remove');
    expect(s.startsWith('try{')).toBe(true);
    expect(s.endsWith('catch(e){}')).toBe(true);
  });

  it('matches a prefix exactly or as a directory, never as a substring', () => {
    // '/dashboard' must match '/dashboard' and '/dashboard/x' but not
    // '/dashboards' — the script uses `p===a[i]||p.indexOf(a[i]+'/')===0`.
    const s = themeBootstrapScript();
    expect(s).toContain("p===a[i]||p.indexOf(a[i]+'/')===0");
  });
});
