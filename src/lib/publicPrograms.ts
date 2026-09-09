import 'server-only';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { MOCK_PROGRAMS } from '@/lib/programs';
import type { Program } from '@/types';

/**
 * The public, indexable view of the program catalogue.
 *
 * Shared by /api/public/programs (the landing page's fetch) and by the
 * /programs pages, so the two cannot drift into disagreeing about which
 * programs exist — which they already did once, when the app filtered
 * hiddenMocks and the landing page filtered both hidden and deleted.
 *
 * Server-only: it reads with the Admin SDK, which bypasses security rules.
 */

/** URL-safe slug from a program name. Stable, readable, and good for search. */
export function programSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export interface PublicProgram extends Program {
  slug: string;
}

export async function getPublicPrograms(): Promise<PublicProgram[]> {
  const app = getAdminApp();
  let firestorePrograms: Program[] = [];
  let deletedIds = new Set<string>();
  let builtinsImported = false;

  if (app) {
    const db = getAdminDb(app);
    const [progsSnap, deletedSnap, configSnap] = await Promise.all([
      db.collection('programs').where('isPublic', '==', true).get(),
      db.collection('config').doc('deletedMocks').get(),
      db.collection('system').doc('config').get(),
    ]);
    firestorePrograms = progsSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<Program, 'id'>) }))
      .filter((p) => (p as Program & { visibility?: string }).visibility !== 'coaching');
    deletedIds = new Set((deletedSnap.data()?.ids as string[]) ?? []);
    builtinsImported = configSnap.data()?.builtinsImported === true;
  }

  const fpIds = new Set(firestorePrograms.map((p) => p.id));
  const mocks = builtinsImported
    ? []
    : MOCK_PROGRAMS.filter((p) => !fpIds.has(p.id) && !deletedIds.has(p.id));

  return [...firestorePrograms, ...mocks]
    .map((p) => ({ ...p, slug: programSlug(p.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getPublicProgramBySlug(slug: string): Promise<PublicProgram | null> {
  const all = await getPublicPrograms();
  return all.find((p) => p.slug === slug) ?? null;
}
