import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Military PT Test: Check Your Fitness Against Real Selection Standards',
  description: 'Log your push-ups, pull-ups, sit-ups, plank and run time and see how you compare with Royal Marines, SAS, Navy SEAL, USMC and Army fitness standards.',
  alternates: { canonical: '/pt-test' },
};

export default function PtTestLayout({ children }: { children: React.ReactNode }) {
  return children;
}
