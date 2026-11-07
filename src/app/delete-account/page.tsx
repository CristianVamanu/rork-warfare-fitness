import { LegalPage } from '@/components/ui/LegalPage';

export const metadata = { title: 'Delete your account · Warfare Fitness' };

// Public page for the Google Play "account deletion" link: it must work
// without the app installed and say how to delete and what is removed.
const TEXT = `## Delete your Warfare Fitness account

You can delete your account and all of its data at any time.

## In the app or on the website

1. Sign in at warfarefitness.com or open the Warfare Fitness app.
2. Tap the settings cog at the top of the Home screen (or go to warfarefitness.com/settings).
3. Tap "Delete account", type DELETE to confirm, and tap Delete.

Your account is deleted straight away.

## Can't sign in?

Reset your password from the sign-in page ("Forgot password") and then delete the account as above. If that doesn't work, use the in-app support chat or reply to any email from us from the address on your account, and ask us to delete it. We delete it within 30 days and confirm by email.

## What is deleted

This includes your profile, workouts, nutrition and water logs, body weight, health summaries (Apple Health / Health Connect), PT test results, programs progress, achievements, community posts and replies, and any uploaded photos and videos.

## What we keep

Payment records that the law requires us to keep (invoices and tax records) are kept by our payment providers for up to 7 years. An active subscription bought through Google Play or the App Store must be cancelled in that store; deleting your account does not cancel a store subscription.`;

export default function DeleteAccountPage() {
  return <LegalPage eyebrow="Account" title="Delete your account" text={TEXT} backHref="/" backLabel="Home" />;
}
