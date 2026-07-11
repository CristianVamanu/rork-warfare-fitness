/**
 * Grabs a still frame from a video file entirely in the browser (canvas),
 * so exercise library thumbnails don't need a server-side transcoder like
 * ffmpeg — this runs at upload time, once, client-side.
 */
export async function extractVideoThumbnail(file: File, seekSeconds = 0.5): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = URL.createObjectURL(file);

    const cleanup = () => URL.revokeObjectURL(video.src);
    const fail = () => { cleanup(); resolve(null); };

    video.onloadedmetadata = () => {
      video.currentTime = Math.min(seekSeconds, Math.max(video.duration - 0.1, 0));
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return fail();
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => { cleanup(); resolve(blob); }, 'image/jpeg', 0.8);
      } catch {
        fail();
      }
    };
    video.onerror = fail;
  });
}
