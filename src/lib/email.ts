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

// ── Shared shell — same dark/gold treatment as the app, kept deliberately
// simple (table-based-ish single column) since email clients strip most CSS. ──
function shell(appName: string, bodyHtml: string): string {
  return `
    <div style="background:#0a0a0a;padding:32px 16px;font-family:-apple-system,Segoe UI,sans-serif;">
      <div style="max-width:480px;margin:0 auto;background:#111111;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:32px;">
        <p style="margin:0 0 24px;font-size:13px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#F5A623;">${appName}</p>
        ${bodyHtml}
        <p style="margin:32px 0 0;font-size:11px;color:#666;">You're receiving this because you have an account with ${appName}.</p>
      </div>
    </div>
  `;
}

function button(label: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;margin-top:20px;background:#F5A623;color:#000;font-weight:800;font-size:14px;padding:12px 24px;border-radius:10px;text-decoration:none;">${label}</a>`;
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

export function welcomeEmailHtml(name: string, appName: string, appUrl: string): string {
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
  return shell(appName, `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:900;color:#fff;">Welcome, ${name}. 💪</h1>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#bbb;">
      Your account is live. Log your first workout, track a meal, and start your streak.
    </p>
    ${button('Open ' + appName, appUrl)}
  `);
}

// Firebase Auth can send its own verification and password-reset mail, but it
// sends it from noreply@<project>.firebaseapp.com — a domain with no SPF or
// DKIM alignment to this app's own sending domain, and no reputation tied to
// it. Spam filters treat that exactly as you'd expect. These two templates let
// the same mail go out through Resend from the configured RESEND_FROM_EMAIL
// instead, using an action link minted server-side by the Admin SDK, so the
// address a member sees is the app's own.
export function verifyEmailHtml(name: string, link: string, appName: string): string {
  name = escapeHtml(name);
  return shell(appName, `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:900;color:#fff;">Confirm your email, ${name}.</h1>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#bbb;">
      One tap and your account is ready. This link expires in an hour.
    </p>
    ${button('Confirm Email', link)}
    <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#777;">
      If the button doesn't work, paste this into your browser:<br>
      <span style="color:#999;word-break:break-all;">${escapeHtml(link)}</span>
    </p>
    <p style="margin:16px 0 0;font-size:12px;color:#777;">
      Didn't sign up? Ignore this email and nothing happens.
    </p>
  `);
}

// The code-based counterpart to verifyEmailHtml. A link drags the member out
// of the PWA into their default browser — a different session, which is where
// every confusing thing about link verification comes from. A code never
// leaves the app.
export function verifyCodeEmailHtml(code: string, appName: string): string {
  return shell(appName, `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:900;color:#fff;">Your confirmation code</h1>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#bbb;">
      Enter this in ${appName} to confirm your email. It expires in 15 minutes.
    </p>
    <p style="margin:0;font-size:34px;font-weight:900;letter-spacing:0.18em;color:#F5A623;font-family:monospace;">${escapeHtml(code)}</p>
    <p style="margin:20px 0 0;font-size:12px;color:#777;">
      Didn't sign up? Ignore this email and nothing happens.
    </p>
  `);
}

export function passwordResetEmailHtml(link: string, appName: string): string {
  return shell(appName, `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:900;color:#fff;">Reset your password</h1>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#bbb;">
      Tap below to choose a new password. This link expires in an hour.
    </p>
    ${button('Reset Password', link)}
    <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#777;">
      If the button doesn't work, paste this into your browser:<br>
      <span style="color:#999;word-break:break-all;">${escapeHtml(link)}</span>
    </p>
    <p style="margin:16px 0 0;font-size:12px;color:#777;">
      Didn't ask for this? Ignore this email — your password stays as it is.
    </p>
  `);
}

// Sent to a landing-page visitor who left their email via the exit-intent
// popup before finishing the quiz/signup — the popup promises "we'll send
// you a link to jump back in", so this is what actually fulfills that
// promise. Links straight to /onboarding rather than any saved progress,
// since the quiz itself is anonymous (see ONBOARDING_DRAFT_KEY in
// onboarding/page.tsx) and only resumable on the same browser/device via
// its own localStorage draft — there's no server-side draft tied to this
// email to deep-link into.
export function landingLeadFollowupEmailHtml(appName: string, appUrl: string): string {
  return shell(appName, `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:900;color:#fff;">Ready when you are.</h1>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#bbb;">
      You started building your program on ${appName} — here's your link to pick up right where you left off.
    </p>
    ${button('Continue My Program', `${appUrl}/onboarding`)}
  `);
}

export function trainerLeadEmailHtml(lead: {
  name: string; email: string; businessName?: string; phone?: string; clientCount?: string; message?: string;
}, appUrl: string): string {
  const rows = [
    ['Name', lead.name],
    ['Email', lead.email],
    ['Business', lead.businessName],
    ['Phone', lead.phone],
    ['Client count', lead.clientCount],
    ['Message', lead.message],
  ].filter(([, v]) => v) as [string, string][];
  const rowsHtml = rows.map(([k, v]) => `<p style="margin:0 0 8px;font-size:14px;color:#bbb;"><strong style="color:#fff;">${escapeHtml(k)}:</strong> ${escapeHtml(v)}</p>`).join('');
  return shell('Warfare Fitness', `
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:900;color:#fff;">New Demo Request 🎯</h1>
    ${rowsHtml}
    ${button('View in Admin Panel', `${appUrl}/admin`)}
  `);
}

export function achievementEmailHtml(name: string, titles: string[], appName: string, appUrl: string): string {
  name = escapeHtml(name);
  const list = titles.map((t) => `<li style="margin:4px 0;">🏆 ${escapeHtml(t)}</li>`).join('');
  return shell(appName, `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:900;color:#fff;">New achievement${titles.length > 1 ? 's' : ''}, ${name}!</h1>
    <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.7;color:#bbb;">${list}</ul>
    ${button('View Achievements', `${appUrl}/achievements`)}
  `);
}

export function coachingApplicationEmailHtml(
  name: string, status: 'approved' | 'rejected', planName: string, reason: string | undefined, appName: string, appUrl: string,
): string {
  name = escapeHtml(name);
  planName = escapeHtml(planName);
  reason = reason ? escapeHtml(reason) : reason;
  if (status === 'approved') {
    return shell(appName, `
      <h1 style="margin:0 0 12px;font-size:22px;font-weight:900;color:#fff;">You're approved for 1:1 Coaching!</h1>
      <p style="margin:0;font-size:14px;line-height:1.6;color:#bbb;">
        Great news, ${name} — your application for &quot;${planName}&quot; has been approved. Complete your payment to get started.
      </p>
      ${button('Complete Payment', `${appUrl}/profile`)}
    `);
  }
  return shell(appName, `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:900;color:#fff;">1:1 Coaching Application Update</h1>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#bbb;">
      Thanks for applying, ${name}. We're not able to take you on for 1:1 coaching right now${reason ? `: ${reason}` : '.'}
      Keep crushing your training — you're welcome to re-apply later.
    </p>
  `);
}

export function trialEndingEmailHtml(name: string, daysLeft: number, appName: string, appUrl: string): string {
  name = escapeHtml(name);
  return shell(appName, `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:900;color:#fff;">Your trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}</h1>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#bbb;">
      Hey ${name}, just a heads up — your free trial wraps up soon. Keep your progress, streak, and programs going without interruption.
    </p>
    ${button('Manage Membership', `${appUrl}/profile`)}
  `);
}

export function twoFactorCodeEmailHtml(code: string, appName: string): string {
  return shell(appName, `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:900;color:#fff;">Your sign-in code</h1>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#bbb;">
      Enter this code to finish signing in. It expires in 10 minutes.
    </p>
    <p style="margin:0;font-size:36px;font-weight:900;letter-spacing:0.15em;color:#F5A623;text-align:center;">${code}</p>
    <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#888;">
      Didn't try to sign in? You can safely ignore this email — your password wasn't shared.
    </p>
  `);
}

// Sent to the account's on-file login email whenever 2FA is turned off or
// its notification address is changed — a hijacked session can make these
// changes without a password, so the real owner needs an out-of-band way
// to notice even if they never touch Settings themselves. Deliberately NOT
// sent to the new twoFactorEmail (that could BE the attacker's address).
export function twoFactorSettingsChangedEmailHtml(
  name: string, change: string, appName: string, appUrl: string,
): string {
  name = escapeHtml(name);
  change = escapeHtml(change);
  return shell(appName, `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:900;color:#fff;">Security setting changed</h1>
    <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#bbb;">
      Hey ${name}, this is a heads up that ${change} on your account.
    </p>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#bbb;">
      If this was you, no action needed. If you didn't make this change, secure your account immediately by resetting your password.
    </p>
    ${button('Review Settings', `${appUrl}/settings`)}
  `);
}

export function paymentFailedEmailHtml(name: string, appName: string, appUrl: string): string {
  name = escapeHtml(name);
  return shell(appName, `
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:900;color:#fff;">Your last payment didn't go through</h1>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#bbb;">
      Hey ${name}, we couldn't process your most recent membership payment. Update your billing details to keep your access uninterrupted.
    </p>
    ${button('Update Billing', `${appUrl}/profile`)}
  `);
}
