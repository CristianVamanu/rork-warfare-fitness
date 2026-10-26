import { getIdToken, type User } from 'firebase/auth';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { storageHostOf } from '@/lib/storageHost';

export type StorageProvider = 'firebase' | 'r2';

/**
 * Where an upload goes when the admin setting is missing or unreadable.
 *
 * This was 'firebase', duplicated as a literal at eight call sites, which
 * meant one failed config read silently sent a file to the wrong bucket — and
 * Firebase Storage is the bucket that bills per GB of egress and goes dark
 * the moment that project's billing account lapses. R2 is the bucket every
 * upload has gone to since July 2026 and has no egress charge, so it is the
 * correct thing to fall back to.
 */
export const DEFAULT_STORAGE_PROVIDER: StorageProvider = 'r2';

/** Reads the admin's storage-provider setting, defaulting safely. Accepts the
 *  raw config value so every caller resolves it the same way. */
export function resolveStorageProvider(value: unknown): StorageProvider {
  return value === 'firebase' || value === 'r2' ? value : DEFAULT_STORAGE_PROVIDER;
}

/** Uploads a file to R2 via a presigned PUT URL. `presignEndpoint` defaults to
 * the admin-only route (exercise library / branding); pass the user-scoped
 * `/api/uploads/presign` route (with a `root`) for content any signed-in
 * user posts themselves, e.g. the PR wall. */
async function uploadToR2(
  user: User,
  file: File,
  folder: string,
  onProgress?: (pct: number) => void,
  presignEndpoint: string = '/api/admin/r2-presign',
  extraBody: Record<string, string> = {}
): Promise<string> {
  const token = await getIdToken(user);
  const presignRes = await fetch(presignEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ filename: file.name, contentType: file.type, sizeBytes: file.size, folder, ...extraBody }),
  });
  if (!presignRes.ok) {
    const data = await presignRes.json().catch(() => ({}));
    throw new Error(data.error || `Presign failed (${presignRes.status})`);
  }
  const { uploadUrl, publicUrl } = await presignRes.json();

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`R2 upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('R2 upload network error'));
    xhr.send(file);
  });

  // The PUT above only proves the write succeeded — R2 treats write access
  // (via this presigned URL) and public READ access (the bucket's Public
  // Development URL / custom domain) as two separate permission layers.
  // A successful upload here used to always report "success" even when the
  // bucket's public access was off/misconfigured, silently saving a URL
  // that 403s for every actual visitor — reported live as a logo that
  // "used to work" going blank with no error anywhere pointing at why.
  // Confirming the file is actually publicly fetchable right after upload
  // turns that into a real, immediate error instead of a stored dead link.
  // Only a response we can actually READ is proof of anything. A thrown
  // fetch (network error, or CORS refusing to expose the response) is
  // ambiguous — the file may well be perfectly readable to a normal <img>
  // load, which isn't subject to CORS the way this fetch is. Treating that
  // ambiguous case as failure would block legitimate uploads outright in
  // any setup where the bucket doesn't send CORS headers on its public
  // URL, which is a worse bug than the dead-link one this guards against.
  // So: a real, readable non-OK status is a hard failure; anything we
  // can't actually observe only warns and lets the upload stand.
  let verifyStatus: number | null = null;
  try {
    const verifyRes = await fetch(publicUrl, { method: 'HEAD', cache: 'no-store' });
    verifyStatus = verifyRes.status;
  } catch {
    console.warn(
      '[uploadVideo] Could not verify public readability of', publicUrl,
      '— the check itself was blocked (likely CORS). Upload is being kept; ' +
      'if the file turns out not to be publicly reachable, check the R2 ' +
      "bucket's Public Development URL / custom domain is enabled."
    );
  }
  if (verifyStatus !== null && (verifyStatus < 200 || verifyStatus >= 300)) {
    throw new Error(
      `File uploaded, but isn't publicly readable (HTTP ${verifyStatus}). ` +
      `Check the R2 bucket's Public Development URL / custom domain is enabled.`
    );
  }

  return publicUrl;
}

/** Uploads a file directly to Firebase Storage with progress. */
async function uploadToFirebaseStorage(
  file: File,
  folder: string,
  onProgress?: (pct: number) => void
): Promise<string> {
  const path = `${folder}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
  const storageRef = ref(storage, path);
  return new Promise<string>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file);
    task.on('state_changed',
      (snap) => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      async () => resolve(await getDownloadURL(task.snapshot.ref))
    );
  });
}

/** Uploads a video file using whichever storage provider is currently configured. */
export async function uploadVideo(
  provider: StorageProvider,
  user: User,
  file: File,
  folder: string,
  onProgress?: (pct: number) => void
): Promise<string> {
  return provider === 'r2'
    ? uploadToR2(user, file, folder, onProgress)
    : uploadToFirebaseStorage(file, folder, onProgress);
}

/** Best-effort delete of a previously-uploaded file (video or thumbnail) by
 * its public URL — so replacing/removing an exercise video doesn't leave the
 * old file orphaned in storage forever. Never throws: a failed cleanup
 * shouldn't block the save/delete the admin actually asked for.
 *
 * The backend is chosen from the URL, NOT from the `provider` setting. The
 * setting says where the next upload goes; a file uploaded before the switch
 * to R2 still lives in Firebase Storage. Routing deletes by the setting meant
 * deleting an old Firebase clip while set to R2 sent a Firebase URL to the R2
 * delete endpoint, which cannot match it — the call failed quietly and the
 * file stayed in the bucket forever. `provider` is now only a fallback for a
 * URL we can't attribute to either host. */
export async function deleteVideo(provider: StorageProvider, user: User, url: string | undefined): Promise<void> {
  if (!url) return;
  const host = storageHostOf(url);
  const target: StorageProvider = host === 'r2' ? 'r2' : host === 'firebase' ? 'firebase' : provider;
  try {
    if (target === 'r2') {
      const token = await getIdToken(user);
      await fetch('/api/admin/r2-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url }),
      });
    } else {
      await deleteObject(ref(storage, url));
    }
  } catch (err) {
    console.error('[uploadVideo] Failed to delete old file', url, err);
  }
}

/** Uploads user-generated content (e.g. PR wall posts) via the user-scoped
 * presign route when R2 is configured, falling back to Firebase Storage.
 *
 * `support` is the exception: it TRIES R2 regardless of the configured
 * provider, and only falls back if R2 genuinely isn't set up. Support
 * attachments are now up to 100MB and are deleted once the ticket is resolved,
 * which is the worst possible shape for Firebase Storage — you pay egress
 * every time staff opens the file, on data you are about to throw away. R2 has
 * no egress fee, which is the whole reason the presign path exists. Leaving
 * this to a global toggle meant one unset config value silently sent every
 * large attachment to the expensive bucket.
 */
export async function uploadUserContent(
  provider: StorageProvider,
  user: User,
  file: File,
  root: 'prPosts' | 'progressPhotos' | 'community' | 'support' | 'avatars',
  onProgress?: (pct: number) => void
): Promise<string> {
  if (provider === 'r2') {
    return uploadToR2(user, file, root, onProgress, '/api/uploads/presign', { root });
  }
  if (root === 'support') {
    try {
      return await uploadToR2(user, file, root, onProgress, '/api/uploads/presign', { root });
    } catch (err) {
      // The presign route answers 500 "R2 not configured" when the bucket
      // credentials are absent. Any failure here is worth falling back on
      // rather than losing the user's bug report — but it must be visible,
      // because the silent version of this is what sent everything to
      // Firebase in the first place.
      console.warn('[uploadVideo] R2 unavailable for support attachment, falling back to Firebase Storage:', err);
      onProgress?.(0);
    }
  }
  return uploadToFirebaseStorage(file, `${root}/${user.uid}`, onProgress);
}
