import { describe, it, expect } from 'vitest';
import { resolveTheme, themeBootstrapScript } from './theme';

describe('the app is dark only', () => {
  it('is dark everywhere once auth has resolved, whatever was saved', () => {
    for (const preference of ['light', 'dark'] as const)
      for (const signedIn of [true, false])
        for (const inAppShell of [true, false])
          expect(resolveTheme({ preference, signedIn, inAppShell })).toBe('dark');
  });
  it('leaves the document alone until auth has resolved', () => {
    expect(resolveTheme({ preference: 'light', signedIn: false, inAppShell: true, authResolved: false })).toBeNull();
  });
  it('the pre-hydration script only removes the light class', () => {
    const js = themeBootstrapScript();
    expect(js).toContain("classList.remove('light')");
    expect(js).not.toContain("classList.add");
  });
});
