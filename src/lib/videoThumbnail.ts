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

// A frame grabbed before the decoder actually has data buffered — or from
// right at t=0 on a video whose first keyframe is further in — comes back
// solid (or near-solid) black instead of throwing, so it silently passes as
// a "successful" thumbnail. Sampling pixel brightness catches that case so
// the caller can retry at a different timestamp instead of shipping a black
// square as the thumbnail.
function isNearlyBlack(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const { data } = ctx.getImageData(0, 0, w, h);
  let total = 0;
  const sampleEvery = 4 * 37; // every 37th pixel — plenty for a brightness estimate, avoids scanning every byte
  let samples = 0;
  for (let i = 0; i < data.length; i += sampleEvery) {
    total += data[i] + data[i + 1] + data[i + 2];
    samples++;
  }
  return samples > 0 && total / samples < 12; // ~4/255 average per channel
}

function grabFrame(video: HTMLVideoElement): Blob | null | Promise<Blob | null> {
  const maxW = 320;
  const scale = Math.min(1, maxW / video.videoWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx || canvas.width === 0 || canvas.height === 0) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  if (isNearlyBlack(ctx, canvas.width, canvas.height)) return null;
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.72));
}

function extractFromVideoEl(src: string, isObjectUrl: boolean, seekSeconds: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.src = src;

    const cleanup = () => { if (isObjectUrl) URL.revokeObjectURL(src); };
    const fail = () => { cleanup(); resolve(null); };

    // Retry at a later timestamp if the first grab comes back black — covers
    // videos whose first keyframe/decode buffer isn't ready yet at the
    // initial seek point. Two attempts total: the requested time, then ~40%
    // into the clip (or +2s, whichever is smaller — stays inside short clips).
    const attempts = [seekSeconds, Math.min(seekSeconds + 2, Math.max(0, (video.duration || 4) * 0.4))];
    let attemptIndex = 0;

    const trySeek = () => {
      const t = attempts[attemptIndex];
      video.currentTime = Math.min(t, Math.max(video.duration - 0.1, 0));
    };

    video.onloadedmetadata = () => {
      attempts[1] = Math.min(seekSeconds + 2, Math.max(0, video.duration * 0.4));
      trySeek();
    };
    video.onseeked = async () => {
      try {
        const blob = await grabFrame(video);
        if (blob) { cleanup(); resolve(blob); return; }
        attemptIndex++;
        if (attemptIndex < attempts.length) { trySeek(); return; }
        fail();
      } catch {
        fail();
      }
    };
    video.onerror = fail;
  });
}
