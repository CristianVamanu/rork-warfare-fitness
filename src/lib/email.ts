import { Resend } from 'resend';
import { getSecret } from './secrets';

/** Resolves a Resend client from the admin-configured API key. Returns null
 * (rather than throwing) when unset, so every email call site can just
 * no-op gracefully instead of every caller needing its own guard. */
async function getResendClient(): Promise<Resend | null> {
  const apiKey = await getSecret('RESEND_API_KEY');
  if (!apiKey) return null;
  return new Resend(apiKey);
}

/**
 * Records a send failure where someone will actually see it.
 *
 * Every failure here used to be a console.error and nothing else. The daily
 * digest reads `errorReports` (client-side errors), never the server's stdout,
 * so a Resend outage or a blown rate limit produced no signal anywhere — while
 * password resets, 2FA codes, trial-ending reminders and dunning mail silently
 * stopped arriving. Writing into the same collection the digest already reads
 * means a mail problem shows up in the morning email instead of in nothing.
 *
 * Deliberately best-effort and never throws: the caller is already handling a
 * failure, and a logging problem must not become a second one. Note it stores
 * the recipient and subject but never the body — those carry reset links and
 * one-time codes.
 */
async function recordFailure(to: string, subject: string, reason: string) {
  try {
    const { getAdminApp, getAdminDb } = await import('./firebase-admin');
    const app = getAdminApp();
    if (!app) return;
    const { FieldValue } = await import('firebase-admin/firestore');
    const crypto = await import('crypto');

    // Same document shape as /api/client-error, because the digest reads this
    // collection with orderBy('lastSeenAt') — and Firestore silently omits
    // documents that lack the ordered field. A row written without
    // lastSeenAt/count would sit in the collection forever and never once
    // appear in the digest, which is the entire point of writing it.
    //
    // Fingerprinted on the reason, not the recipient: a Resend outage during
    // the notification sweep is ONE problem, and it should read as one row
    // with a count of 400 rather than 400 rows that bury everything else.
    const message = `Email send failed: ${reason.slice(0, 200)}`;
    const fingerprint = crypto.createHash('sha256').update(`email|${message}`).digest('hex').slice(0, 32);
    const ref = getAdminDb(app).collection('errorReports').doc(fingerprint);
    const existing = await ref.get();

    await ref.set({
      message,
      kind: 'email',
      // The subject names which mail stopped arriving — "sign-in code" and
      // "achievement unlocked" are very different emergencies. Never the
      // body: these carry reset links and one-time codes.
      lastSubject: subject,
      lastRecipient: to,
      lastSeenAt: FieldValue.serverTimestamp(),
      ...(existing.exists ? {} : { firstSeenAt: FieldValue.serverTimestamp() }),
      count: FieldValue.increment(1),
      ...(existing.data()?.resolved ? { resolved: false, reopenedAt: FieldValue.serverTimestamp() } : { resolved: false }),
    }, { merge: true });
  } catch (err) {
    console.error('[email] Could not record send failure:', err);
  }
}

/** Retry only what retrying can fix: rate limits and transient server errors. */
function isRetryable(err: unknown): boolean {
  const status = (err as { statusCode?: number; status?: number })?.statusCode
    ?? (err as { status?: number })?.status;
  if (status === 429) return true;
  if (typeof status === 'number' && status >= 500) return true;
  // Network-level failures surface with no status at all.
  return status === undefined;
}

export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<boolean> {
  if (!opts.to) return false;
  const client = await getResendClient();
  if (!client) {
    const msg = 'RESEND_API_KEY not configured';
    console.warn(`[email] ${msg} — skipped "${opts.subject}" to ${opts.to}`);
    await recordFailure(opts.to, opts.subject, msg);
    return false;
  }
  const from = (await getSecret('RESEND_FROM_EMAIL')) || 'Warfare Fitness <onboarding@resend.dev>';

  // One retry, after a short pause. Resend's rate limit is per-second, so a
  // brief wait genuinely clears it — most of what fails here is a burst from
  // the notification sweep rather than anything actually broken.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await client.emails.send({ from, to: opts.to, subject: opts.subject, html: opts.html });
      return true;
    } catch (err) {
      lastErr = err;
      if (attempt === 0 && isRetryable(err)) {
        await new Promise((r) => setTimeout(r, 1100));
        continue;
      }
      break;
    }
  }

  const reason = lastErr instanceof Error ? lastErr.message : String(lastErr);
  console.error('[email] Send failed:', lastErr);
  await recordFailure(opts.to, opts.subject, reason);
  return false;
}

/**
 * Who the mail is from, for the header block.
 *
 * Accepts a bare string so the twelve templates and their thirteen call sites
 * did not all have to change at once, and an object where a logo is available.
 * Every call site already reads system/config for `appName`, and `logoUrl`
 * lives in that same document — so passing the logo costs no extra read.
 */
export type EmailBrand = string | { name: string; logoUrl?: string | null };

function brandOf(brand: EmailBrand): { name: string; logoUrl: string | null } {
  return typeof brand === 'string'
    ? { name: brand, logoUrl: null }
    : { name: brand.name, logoUrl: brand.logoUrl || null };
}

/**
 * Shared shell — the login screen's treatment, rebuilt for email.
 *
 * WHY TABLES AND INLINE STYLES. Outlook on Windows renders mail through Word,
 * which has no flexbox, no grid, and unreliable padding on divs. The previous
 * shell was nested divs with padding, which is exactly the shape Word mangles.
 * Everything structural here is a table with explicit widths, every style is
 * inline, and `bgcolor` is set alongside the CSS background so a client that
 * drops one still gets the dark ground rather than white-on-white text.
 *
 * WHY THE BODY IS LIGHT WHEN THE APP IS DARK. The first version of this was
 * dark throughout, to match the login screen. Gmail on Android recoloured it
 * into a light theme anyway — black text on white, and the gold CTA reduced to
 * a muddy brown — because Gmail applies its own colour transform to mail whose
 * palette fights the reader's theme, and the color-scheme meta only asks
 * nicely. A dark email is therefore not a design choice you get to make; it is
 * a bet on each client's transform, and the failure mode is an unreadable
 * password reset.
 *
 * So the brand lives in a dark band at the top — logo, wordmark, gold rule,
 * white text on near-black, which survives being inverted because it is
 * high-contrast either way round — and the content sits on white beneath it.
 * That reads as deliberate in a light client, transforms cleanly in a dark
 * one, and never produces the brown-on-grey button again.
 *
 * WHAT IS DELIBERATELY MISSING. No background image (Outlook needs VML for
 * that), no web font (they do not load), no gradient behind text, no CSS glow.
 * Rounded corners degrade to square in Outlook, which is fine.
 *
 * THE LOGO IS NEVER LOAD-BEARING. Most clients block remote images until the
 * reader allows them, so the wordmark below it is real text, not part of the
 * image, and the img carries alt text. An email with images off still reads
 * correctly and still looks deliberate.
 *
 * `preheader` is the grey line inboxes show next to the subject. Left empty it
 * shows whatever text comes first, which is usually the wrong thing.
 */
function shell(brand: EmailBrand, bodyHtml: string, preheader = ''): string {
  const { name: appName, logoUrl } = brandOf(brand);
  const safeName = escapeHtml(appName);

  const logoBlock = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" width="72" height="72" alt="${safeName}"
           style="display:block;width:72px;height:72px;border-radius:16px;border:1px solid rgba(255,255,255,0.10);">`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${safeName}</title>
</head>
<body style="margin:0;padding:0;background-color:#f2f2f2;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f2f2f2" style="background-color:#f2f2f2;margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:28px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

      <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:520px;">

        <!-- Brand band. The one deliberately dark element: it carries the
             logo and wordmark, and nothing inside it has to stay legible
             against an inverted background because the text on it is white
             on near-black either way round. -->
        <tr>
          <td align="center" bgcolor="#0a0a0a" style="background-color:#0a0a0a;border-radius:16px 16px 0 0;padding:28px 24px 24px;">
            ${logoBlock}
            <div style="margin:${logoUrl ? '16px' : '0'} 0 0;font-size:20px;font-weight:800;letter-spacing:0.06em;color:#ffffff;text-transform:uppercase;">${safeName}</div>
            <div style="margin:12px auto 0;width:40px;height:3px;background-color:#F5A623;border-radius:2px;font-size:0;line-height:0;">&nbsp;</div>
          </td>
        </tr>

        <!-- Body. Light on purpose — see the note above shell(). -->
        <tr>
          <td bgcolor="#ffffff" style="background-color:#ffffff;border-radius:0 0 16px 16px;padding:32px 28px;">
            ${bodyHtml}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td align="center" style="padding:20px 8px 0;">
            <p style="margin:0;font-size:11px;line-height:1.6;color:#8a8a8a;">
              You're receiving this because you have an account with ${safeName}.
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * Bulletproof button. Outlook ignores padding on an anchor, so the shape comes
 * from a table cell and the anchor only carries the text — the difference
 * between a gold button and a bare blue link for every Windows Outlook user.
 */
function button(label: string, url: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;">
      <tr>
        <td bgcolor="#F5A623" align="center" style="background-color:#F5A623;border-radius:10px;">
          <a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 26px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:800;color:#000000;text-decoration:none;border-radius:10px;">${escapeHtml(label)}</a>
        </td>
      </tr>
    </table>`;
}

/** A big, monospaced, selectable code block — for 2FA and email verification. */
function codeBlock(code: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;">
      <tr>
        <td bgcolor="#0a0a0a" align="center" style="background-color:#0a0a0a;border:1px solid #F5A623;border-radius:12px;padding:18px 12px;">
          <span style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:30px;font-weight:700;letter-spacing:0.30em;color:#F5A623;">${escapeHtml(code)}</span>
        </td>
      </tr>
    </table>`;
}

// Only needed for templates interpolating untrusted, unauthenticated
// input (the /trainers demo form) — someone submitting that form could
// otherwise inject arbitrary markup/links into the notification email
// that lands in a real inbox.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function welcomeEmailHtml(name: string, brand: EmailBrand, appUrl: string): string {
  // Sent from inside signUp(), before onboarding (program selection, goals,
  // etc.) has actually run — it used to say "pick a training program",
  // which read as if nothing had been set up yet even for someone who'd
  // already chosen or been assigned one during onboarding. Kept generic
  // instead of assuming any particular setup state.
  // name traces back to displayName, a free-text field the user sets
  // themselves at signup — unescaped, a display name like <img
  // src=x onerror=...> would render raw here (self-XSS, since this only
  // ever mails the account owner's own inbox, but cheap to close).
  name = escapeHtml(name);
  const { name: appName } = brandOf(brand);
  return shell(brand, `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:900;color:#111111;">Welcome, ${name}. 💪</h1>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#444444;">
      Your account is live. Log your first workout, track a meal, and start your streak.
    </p>
    ${button('Open ' + appName, appUrl)}
  `, 'Your account is live — here is where to start.');
}

// Firebase Auth can send its own verification and password-reset mail, but it
// sends it from noreply@<project>.firebaseapp.com — a domain with no SPF or
// DKIM alignment to this app's own sending domain, and no reputation tied to
// it. Spam filters treat that exactly as you'd expect. These two templates let
// the same mail go out through Resend from the configured RESEND_FROM_EMAIL
// instead, using an action link minted server-side by the Admin SDK, so the
// address a member sees is the app's own.
export function verifyEmailHtml(name: string, link: string, brand: EmailBrand): string {
  name = escapeHtml(name);
  const { name: appName } = brandOf(brand);
  return shell(brand, `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:900;color:#111111;">Confirm your email, ${name}.</h1>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#444444;">
      One tap and your account is ready. This link expires in an hour.
    </p>
    ${button('Confirm Email', link)}
    <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#6b6b6b;">
      If the button doesn't work, paste this into your browser:<br>
      <span style="color:#666666;word-break:break-all;">${escapeHtml(link)}</span>
    </p>
    <p style="margin:16px 0 0;font-size:12px;color:#6b6b6b;">
      Didn't sign up? Ignore this email and nothing happens.
    </p>
  `, "One tap and your account is ready.");
}

// The code-based counterpart to verifyEmailHtml. A link drags the member out
// of the PWA into their default browser — a different session, which is where
// every confusing thing about link verification comes from. A code never
// leaves the app.
export function verifyCodeEmailHtml(code: string, brand: EmailBrand): string {
  const { name: appName } = brandOf(brand);
  return shell(brand, `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:900;color:#111111;">Your confirmation code</h1>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#444444;">
      Enter this in ${appName} to confirm your email. It expires in 15 minutes.
    </p>
    ${codeBlock(code)}
    <p style="margin:20px 0 0;font-size:12px;color:#6b6b6b;">
      Didn't sign up? Ignore this email and nothing happens.
    </p>
  `, "Your code expires in 15 minutes.");
}

export function passwordResetEmailHtml(link: string, brand: EmailBrand): string {
  const { name: appName } = brandOf(brand);
  return shell(brand, `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:900;color:#111111;">Reset your password</h1>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#444444;">
      Tap below to choose a new password. This link expires in an hour.
    </p>
    ${button('Reset Password', link)}
    <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#6b6b6b;">
      If the button doesn't work, paste this into your browser:<br>
      <span style="color:#666666;word-break:break-all;">${escapeHtml(link)}</span>
    </p>
    <p style="margin:16px 0 0;font-size:12px;color:#6b6b6b;">
      Didn't ask for this? Ignore this email — your password stays as it is.
    </p>
  `, "Choose a new password — link expires in an hour.");
}

// Sent to a landing-page visitor who left their email via the exit-intent
// popup before finishing the quiz/signup — the popup promises "we'll send
// you a link to jump back in", so this is what actually fulfills that
// promise. Links straight to /onboarding rather than any saved progress,
// since the quiz itself is anonymous (see ONBOARDING_DRAFT_KEY in
// onboarding/page.tsx) and only resumable on the same browser/device via
// its own localStorage draft — there's no server-side draft tied to this
// email to deep-link into.
export function landingLeadFollowupEmailHtml(brand: EmailBrand, appUrl: string): string {
  const { name: appName } = brandOf(brand);
  return shell(brand, `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:900;color:#111111;">Ready when you are.</h1>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#444444;">
      You started building your program on ${appName} — here's your link to pick up right where you left off.
    </p>
    ${button('Continue My Program', `${appUrl}/onboarding`)}
  `);
}

export function trainerLeadEmailHtml(lead: {
  name: string; email: string; businessName?: string; phone?: string; clientCount?: string; message?: string;
  // This one goes to STAFF, not a member, and its call site has no config
  // read to take a brand from — so it keeps the hardcoded name it always had.
}, appUrl: string, brand: EmailBrand = 'Warfare Fitness'): string {
  const rows = [
    ['Name', lead.name],
    ['Email', lead.email],
    ['Business', lead.businessName],
    ['Phone', lead.phone],
    ['Client count', lead.clientCount],
    ['Message', lead.message],
  ].filter(([, v]) => v) as [string, string][];
  const rowsHtml = rows.map(([k, v]) => `<p style="margin:0 0 8px;font-size:14px;color:#444444;"><strong style="color:#111111;">${escapeHtml(k)}:</strong> ${escapeHtml(v)}</p>`).join('');
  return shell(brand, `
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:900;color:#111111;">New Demo Request 🎯</h1>
    ${rowsHtml}
    ${button('View in Admin Panel', `${appUrl}/admin`)}
  `);
}

export function achievementEmailHtml(name: string, titles: string[], brand: EmailBrand, appUrl: string): string {
  name = escapeHtml(name);
  const list = titles.map((t) => `<li style="margin:4px 0;">🏆 ${escapeHtml(t)}</li>`).join('');
  const { name: appName } = brandOf(brand);
  return shell(brand, `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:900;color:#111111;">New achievement${titles.length > 1 ? 's' : ''}, ${name}!</h1>
    <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.7;color:#444444;">${list}</ul>
    ${button('View Achievements', `${appUrl}/achievements`)}
  `);
}

export function coachingApplicationEmailHtml(
  name: string, status: 'approved' | 'rejected', planName: string, reason: string | undefined, brand: EmailBrand, appUrl: string,
): string {
  name = escapeHtml(name);
  planName = escapeHtml(planName);
  reason = reason ? escapeHtml(reason) : reason;
  if (status === 'approved') {
    const { name: appName } = brandOf(brand);
  return shell(brand, `
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:900;color:#111111;">You're approved for 1:1 Coaching!</h1>
      <p style="margin:0;font-size:14px;line-height:1.6;color:#444444;">
        Great news, ${name} — your application for &quot;${planName}&quot; has been approved. Complete your payment to get started.
      </p>
      ${button('Complete Payment', `${appUrl}/profile`)}
    `);
  }
  const { name: appName } = brandOf(brand);
  return shell(brand, `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:900;color:#111111;">1:1 Coaching Application Update</h1>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#444444;">
      Thanks for applying, ${name}. We're not able to take you on for 1:1 coaching right now${reason ? `: ${reason}` : '.'}
      Keep crushing your training — you're welcome to re-apply later.
    </p>
  `);
}

export function trialEndingEmailHtml(name: string, daysLeft: number, brand: EmailBrand, appUrl: string): string {
  name = escapeHtml(name);
  const { name: appName } = brandOf(brand);
  return shell(brand, `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:900;color:#111111;">Your trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}</h1>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#444444;">
      Hey ${name}, just a heads up — your free trial wraps up soon. Keep your progress, streak, and programs going without interruption.
    </p>
    ${button('Manage Membership', `${appUrl}/profile`)}
  `);
}

export function twoFactorCodeEmailHtml(code: string, brand: EmailBrand): string {
  const { name: appName } = brandOf(brand);
  return shell(brand, `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:900;color:#111111;">Your sign-in code</h1>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#444444;">
      Enter this code to finish signing in. It expires in 10 minutes.
    </p>
    ${codeBlock(code)}
    <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#6b6b6b;">
      Didn't try to sign in? You can safely ignore this email — your password wasn't shared.
    </p>
  `, 'Your sign-in code expires in 10 minutes.');
}

// Sent to the account's on-file login email whenever 2FA is turned off or
// its notification address is changed — a hijacked session can make these
// changes without a password, so the real owner needs an out-of-band way
// to notice even if they never touch Settings themselves. Deliberately NOT
// sent to the new twoFactorEmail (that could BE the attacker's address).
export function twoFactorSettingsChangedEmailHtml(
  name: string, change: string, brand: EmailBrand, appUrl: string,
): string {
  name = escapeHtml(name);
  change = escapeHtml(change);
  const { name: appName } = brandOf(brand);
  return shell(brand, `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:900;color:#111111;">Security setting changed</h1>
    <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#444444;">
      Hey ${name}, this is a heads up that ${change} on your account.
    </p>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#444444;">
      If this was you, no action needed. If you didn't make this change, secure your account immediately by resetting your password.
    </p>
    ${button('Review Settings', `${appUrl}/settings`)}
  `);
}

export function paymentFailedEmailHtml(name: string, brand: EmailBrand, appUrl: string): string {
  name = escapeHtml(name);
  const { name: appName } = brandOf(brand);
  return shell(brand, `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:900;color:#111111;">Your last payment didn't go through</h1>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#444444;">
      Hey ${name}, we couldn't process your most recent membership payment. Update your billing details to keep your access uninterrupted.
    </p>
    ${button('Update Billing', `${appUrl}/profile`)}
  `);
}
