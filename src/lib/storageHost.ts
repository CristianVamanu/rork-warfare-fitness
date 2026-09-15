/**
 * Which bucket a stored file actually lives in, read from its URL.
 *
 * The app has uploaded to two backends over its life: Firebase Storage
 * (everything before R2 support landed in late July 2026) and Cloudflare R2
 * (everything since). The admin's storage-provider setting says where the
 * NEXT upload goes — it says nothing about where an existing file is, and the
 * two answers disagree for every clip uploaded before the switch.
 *
 * The URL is the only honest source for that, so anything deciding "where is
 * this file" — a delete, a badge, a migration — should ask here rather than
 * consult the setting.
 *
 * Why it matters beyond labelling: Firebase Storage egress is billed per GB
 * and the files are hostage to that project's billing account staying
 * current, which is exactly how the demo clips went dark. R2 has no egress
 * charge. Anything still reading `firebase` here is a file to re-upload.
 */
export type StorageHost = 'firebase' | 'r2' | 'other' | 'none';

export function storageHostOf(url: string | undefined | null): StorageHost {
  if (!url || typeof url !== 'string' || !url.trim()) return 'none';
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    // Not a URL at all — a relative path or corrupt value. Not something we
    // can attribute to a bucket, and not something to report as Firebase.
    return 'other';
  }
  if (host === 'firebasestorage.googleapis.com' || host.endsWith('.firebasestorage.app')) return 'firebase';
  if (host === 'storage.googleapis.com') return 'firebase';
  if (host.endsWith('.r2.dev') || host.endsWith('.r2.cloudflarestorage.com')) return 'r2';
  return 'other';
}

/** True for files that should be re-uploaded to R2. */
export function needsReupload(url: string | undefined | null): boolean {
  return storageHostOf(url) === 'firebase';
}

/** Short label for the admin UI. */
export function storageHostLabel(host: StorageHost): string {
  switch (host) {
    case 'firebase': return 'Firebase';
    case 'r2': return 'R2';
    case 'other': return 'External';
    case 'none': return 'No file';
  }
}
