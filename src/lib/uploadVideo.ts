import { getIdToken, type User } from 'firebase/auth';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '@/lib/firebase';

export type StorageProvider = 'firebase' | 'r2';

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
  try {
    const verifyRes = await fetch(publicUrl, { method: 'HEAD', cache: 'no-store' });
    if (!verifyRes.ok) {
      throw new Error(
        `File uploaded, but isn't publicly readable (HTTP ${verifyRes.status}). ` +
        `Check the R2 bucket's Public Development URL / custom domain is enabled.`
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('File uploaded')) throw err;
    throw new Error(
      `File uploaded, but couldn't verify it's publicly reachable. ` +
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
 * shouldn't block the save/delete the admin actually asked for. */
export async function deleteVideo(provider: StorageProvider, user: User, url: string | undefined): Promise<void> {
  if (!url) return;
  try {
    if (provider === 'r2') {
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
 * presign route when R2 is configured, falling back to Firebase Storage. */
export async function uploadUserContent(
  provider: StorageProvider,
  user: User,
  file: File,
  root: 'prPosts' | 'progressPhotos' | 'community',
  onProgress?: (pct: number) => void
): Promise<string> {
  return provider === 'r2'
    ? uploadToR2(user, file, root, onProgress, '/api/uploads/presign', { root })
    : uploadToFirebaseStorage(file, `${root}/${user.uid}`, onProgress);
}
