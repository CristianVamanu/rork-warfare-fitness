import { getPublicPrograms } from '@/lib/publicPrograms';
import { getPublicBranding } from '@/lib/publicBranding';
import { PublicNav } from '@/components/public/PublicNav';

export const dynamic = 'force-dynamic';

/**
 * The same header every public page has, over the quiz.
 *
 * Onboarding used to render with no site header at all, so a visitor who
 * already had an account (the quiz's own error tells them to "sign in
 * instead") had nowhere on the page to do that — the only way out was the
 * browser's back button. The page itself is a client component and cannot
 * fetch the nav's programs and branding, so the fetch lives here.
 */
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const [programs, brand] = await Promise.all([
    getPublicPrograms().catch(() => []),
    getPublicBranding(),
  ]);
  return (
    <>
      <PublicNav
        programs={programs.map((p) => ({ name: p.name, slug: p.slug }))}
        logoUrl={brand.logoUrl}
        appName={brand.appName}
      />
      {children}
    </>
  );
}
