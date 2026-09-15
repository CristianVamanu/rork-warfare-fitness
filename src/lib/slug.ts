/**
 * URL-safe slug from a name. Stable, readable, and good for search.
 *
 * Pulled out of publicPrograms.ts (which is marked `server-only`) so a
 * client component — the share button — can build the same slug a program
 * page actually resolves at, without pulling a server-only module (and
 * everything it imports: firebase-admin) into the client bundle.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
