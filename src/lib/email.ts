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

export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<boolean> {
  if (!opts.to) return false;
  const client = await getResendClient();
  if (!client) {
    console.warn(`[email] RESEND_API_KEY not configured — skipped "${opts.subject}" to ${opts.to}`);
    return false;
  }
  const from = (await getSecret('RESEND_FROM_EMAIL')) || 'Warfare Fitness <onboarding@resend.dev>';
  try {
    await client.emails.send({ from, to: opts.to, subject: opts.subject, html: opts.html });
    return true;
  } catch (err) {
    console.error('[email] Send failed:', err);
    return false;
  }
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
