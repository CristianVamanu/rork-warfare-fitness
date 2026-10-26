/**
 * Repoints a Firebase Auth action link at this app's own handler.
 *
 * `generatePasswordResetLink` / `generateEmailVerificationLink` return a URL on
 * `<project>.firebaseapp.com/__/auth/action` — the only place Firebase's
 * built-in handler lives. Sending a member to a domain they have never seen,
 * to type a new password into an unbranded Google form, is the exact shape of
 * a phishing flow, and the people most careful about security are the least
 * likely to click it.
 *
 * The console's "customise action URL" is meant to fix this and refused to
 * save on this project. It turns out not to matter: the only thing carrying
 * authority is the `oobCode`, which Firebase validates server-side when
 * /auth/action calls verifyPasswordResetCode. Which domain hosted the form is
 * irrelevant to whether that code is accepted. So keep the code and the mode,
 * drop Firebase's URL, and point at our own page.
 *
 * Falls back to the original link on ANY surprise — an unrecognised URL shape,
 * a missing code, a parse failure. An ugly link that works beats a pretty one
 * that doesn't, and this is the flow people use when they are already locked
 * out of their account.
 *
 * NOTE the apiKey parameter is deliberately dropped: our handler uses the
 * app's own initialised client SDK, and there is no reason to carry a second
 * copy of the key through an inbox.
 */
export function toOwnAuthActionLink(firebaseLink: string, appUrl: string): string {
  try {
    const src = new URL(firebaseLink);
    const oobCode = src.searchParams.get('oobCode');
    const mode = src.searchParams.get('mode');
    if (!oobCode || !mode) return firebaseLink;

    const out = new URL('/auth/action', appUrl);
    out.searchParams.set('mode', mode);
    out.searchParams.set('oobCode', oobCode);
    const cont = src.searchParams.get('continueUrl');
    if (cont) out.searchParams.set('continueUrl', cont);
    const lang = src.searchParams.get('lang');
    if (lang) out.searchParams.set('lang', lang);
    return out.toString();
  } catch {
    return firebaseLink;
  }
}
