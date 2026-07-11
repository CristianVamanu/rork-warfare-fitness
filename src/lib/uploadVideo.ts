import { getIdToken, type User } from 'firebase/auth';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
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
    body: JSON.stringify({ filename: file.name, contentType: file.type, folder, ...extraBody }),
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

/** Uploads user-generated content (e.g. PR wall posts) via the user-scoped
 * presign route when R2 is configured, falling back to Firebase Storage. */
export async function uploadUserContent(
  provider: StorageProvider,
  user: User,
  file: File,
  root: 'prPosts',
  onProgress?: (pct: number) => void
): Promise<string> {
  return provider === 'r2'
    ? uploadToR2(user, file, root, onProgress, '/api/uploads/presign', { root })
    : uploadToFirebaseStorage(file, `${root}/${user.uid}`, onProgress);
}
