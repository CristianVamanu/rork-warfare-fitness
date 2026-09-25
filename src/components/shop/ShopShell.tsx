import { getPublicPrograms } from '@/lib/publicPrograms';
import { getPublicBranding } from '@/lib/publicBranding';
import { PublicNav } from '@/components/public/PublicNav';
import { PublicFooter } from '@/components/public/PublicFooter';
import { TacticalBackdrop } from '@/components/public/TacticalBackdrop';
import { CartButton } from './CartButton';

/**
 * The frame every store page sits in: the public nav (the store is open
 * to everyone, signed in or not), the tactical grid behind, and the cart
 * pinned bottom-right on phones. Server component so the nav's program
 * list and branding come from the same cached reads the marketing pages use.
 */
export async function ShopShell({ children }: { children: React.ReactNode }) {
  const [programs, brand] = await Promise.all([getPublicPrograms().catch(() => []), getPublicBranding()]);
  return (
    <div className="min-h-screen bg-background text-white">
      <div className="relative">
        <TacticalBackdrop className="h-[640px]" />
        <div className="relative z-10">
          <PublicNav programs={programs} logoUrl={brand.logoUrl} appName={brand.appName} />
          <main className="max-w-6xl mx-auto px-4 pt-6 pb-24">{children}</main>
        </div>
      </div>
      <PublicFooter appName={brand.appName} />
      <CartButton />
    </div>
  );
}
