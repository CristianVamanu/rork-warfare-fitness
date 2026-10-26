import type { Metadata } from 'next';
import { FreePlanPage, freePlanMetadata } from '../FreePlanPage';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ programId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { programId } = await params;
  return freePlanMetadata(programId);
}

/** One program's page: the link each ad for that program points at. */
export default async function Page({ params }: Params) {
  const { programId } = await params;
  return <FreePlanPage programId={programId} />;
}
