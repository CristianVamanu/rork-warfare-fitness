/**
 * Grabs a still frame from a video file entirely in the browser (canvas),
 * so exercise library thumbnails don't need a server-side transcoder like
 * ffmpeg — this runs at upload time, once, client-side.
 */
export async function extractVideoThumbnail(file: File, seekSeconds = 0.5): Promise<Blob | null> {
  return extractFromVideoEl(URL.createObjectURL(file), true, seekSeconds);
}

/** Same idea, but for a video already sitting in storage (backfill flow) —
 * reads the frame directly off the hosted URL instead of a local File.
 * Requires the host to serve permissive CORS headers; if it doesn't, the
 * browser marks the canvas "tainted" and this resolves null instead of
 * throwing, so a backfill run can skip and report failures per file. */
export async function extractVideoThumbnailFromUrl(url: string, seekSeconds = 0.5): Promise<Blob | null> {
  return extractFromVideoEl(url, false, seekSeconds);
}

function extractFromVideoEl(src: string, isObjectUrl: boolean, seekSeconds: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.src = src;

    const cleanup = () => { if (isObjectUrl) URL.revokeObjectURL(src); };
    const fail = () => { cleanup(); resolve(null); };

    video.onloadedmetadata = () => {
      video.currentTime = Math.min(seekSeconds, Math.max(video.duration - 0.1, 0));
    };
    video.onseeked = () => {
      try {
        // Cap thumbnail width — these are small list-row previews, not full
        // frames, so there's no reason to ship a 1920px JPEG per exercise.
        const maxW = 320;
        const scale = Math.min(1, maxW / video.videoWidth);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return fail();
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => { cleanup(); resolve(blob); }, 'image/jpeg', 0.72);
      } catch {
        fail();
      }
    };
    video.onerror = fail;
  });
}
