import type { Metadata } from 'next';
import { FreePlanPage, freePlanMetadata } from './FreePlanPage';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return freePlanMetadata();
}

/** The bare URL: the admin's default offer. See FreePlanPage. */
export default async function Page() {
  return <FreePlanPage />;
}
