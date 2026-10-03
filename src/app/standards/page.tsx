import type { Metadata } from 'next';
import { StandardsTest } from './StandardsTest';
import { UNIT_STANDARDS } from '@/lib/ptStandards';

export const metadata: Metadata = {
  title: 'Military Selection Fitness Standards — Test Yourself',
  description:
    'The real published fitness standards for Marine Recon, Navy SEAL, Ranger, Royal Marines, UKSF, the Foreign Legion and more. Enter your numbers and see which ones you would pass. Free, no account.',
  alternates: { canonical: '/standards' },
  openGraph: {
    title: 'Could you pass selection?',
    description: 'Real published fitness standards from eleven selection courses. Enter your numbers and find out where you stand.',
    type: 'website',
  },
};

export default function StandardsIndexPage() {
  return (
    <>
      <div className="mb-10">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">
          {UNIT_STANDARDS.length} selection courses · real published numbers
        </p>
        <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight mt-3 leading-[1.05]">
          Could you pass selection?
        </h1>
        <p className="text-base text-text-secondary mt-4 max-w-xl leading-relaxed">
          These are the actual fitness standards. Enter your numbers and find out which
          ones you would clear today. No account, nothing saved.
        </p>
      </div>

      <StandardsTest />
    </>
  );
}
