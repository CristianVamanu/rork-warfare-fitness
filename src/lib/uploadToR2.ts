import { getIdToken, type User } from 'firebase/auth';

/**
 * Uploads a file directly to Cloudflare R2 using a presigned PUT URL.
 * Requires an admin Firebase user (server issues the presigned URL).
 */
export async function uploadToR2(
  user: User,
  file: File,
  folder: string,
  onProgress?: (pct: number) => void
): Promise<string> {
  const token = await getIdToken(user);
  const presignRes = await fetch('/api/admin/r2-presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ filename: file.name, contentType: file.type, folder }),
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
