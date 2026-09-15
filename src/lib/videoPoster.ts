import { execFile } from 'child_process';
import { getSecret } from '@/lib/secrets';

/**
 * Server-side poster frames, via ffmpeg.
 *
 * The browser used to be the only thing that produced a still frame for an
 * uploaded clip: the uploader's own device decoded it onto a canvas. That
 * works on most phones and silently does nothing on the rest — a codec the
 * browser cannot decode, a tab backgrounded mid-grab, a slow device that hit
 * the timeout — and the member who uploaded the clip is the last person who
 * would notice, because they already know what is in it. Everyone else sees
 * a black rectangle.
 *
 * ffmpeg decodes what browsers will not, takes about a second, and produces
 * the same result every time regardless of whose phone did the uploading.
 *
 * Two things make this safe to expose to signed-in members:
 *
 *  - The URL is checked against the bucket's own public base before ffmpeg is
 *    told about it. Without that, this endpoint fetches any URL a caller
 *    names, which on a cloud host includes the metadata service and anything
 *    else reachable from inside the network.
 *  - ffmpeg is run through execFile with an argument array, never a shell
 *    string, so a filename can never become part of a command.
 */

/** Clip frame taken from here, in seconds. Past any fade-in from black. */
const SEEK_SECONDS = 1;
/** Longest a single frame grab may take before it is killed. */
const TIMEOUT_MS = 20_000;
/** Widest the poster may be. Taller/narrower clips keep their own shape. */
const MAX_WIDTH = 720;
/** A 720px JPEG is tens of kilobytes; this is a sanity ceiling, not a target. */
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

/**
 * How many frame grabs may run at once.
 *
 * ffmpeg is CPU-bound and the box has two cores. Unbounded, a handful of
 * simultaneous uploads would take the cores away from serving requests, which
 * trades a missing thumbnail for a slow site — a bad deal in any direction.
 * At capacity this refuses rather than queues, and the caller falls back to
 * the browser's own attempt.
 */
const MAX_CONCURRENT = 2;
let inFlight = 0;

/**
 * True only for a URL that points at our own public bucket.
 *
 * Compared as a parsed origin plus a path prefix, not with startsWith on the
 * raw strings: `https://cdn.example.com.evil.test/x` has the real base as a
 * string prefix while pointing somewhere else entirely.
 */
export function isOwnBucketUrl(url: string, publicBase: string): boolean {
  if (!url || !publicBase) return false;
  let target: URL;
  let base: URL;
  try {
    target = new URL(url);
    base = new URL(publicBase);
  } catch {
    return false;
  }
  if (target.protocol !== 'https:') return false;
  if (target.origin !== base.origin) return false;
  const basePath = base.pathname.replace(/\/$/, '');
  return target.pathname.startsWith(`${basePath}/`);
}

function runFfmpeg(args: string[]): Promise<Buffer | null> {
  return new Promise((resolve) => {
    execFile(
      'ffmpeg',
      args,
      { timeout: TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES, encoding: 'buffer', windowsHide: true },
      (err, stdout) => {
        // A non-zero exit, a timeout, or no ffmpeg on the box at all. None of
        // them are worth failing an upload over — the caller treats a null as
        // "no poster", which is the state the post would have been in anyway.
        if (err) { resolve(null); return; }
        const out = stdout as unknown as Buffer;
        resolve(out && out.length > 0 ? out : null);
      },
    );
  });
}

function ffmpegArgs(url: string, seekSeconds: number): string[] {
  return [
    '-nostdin',
    '-loglevel', 'error',
    // -ss BEFORE -i is input seeking: ffmpeg jumps straight to the timestamp
    // using HTTP range requests instead of decoding the file from the start,
    // so a 100MB clip costs a few hundred kilobytes of transfer. After -i it
    // would download and decode the whole thing to reach the same frame.
    '-ss', String(seekSeconds),
    '-i', url,
    '-frames:v', '1',
    // Cap the width, keep the clip's own aspect ratio, and keep the height
    // even (-2) because JPEG chroma subsampling needs even dimensions. The
    // comma inside min() is escaped: an unescaped one would end the filter.
    '-vf', `scale=min(${MAX_WIDTH}\\,iw):-2`,
    '-q:v', '4',
    '-f', 'mjpeg',
    'pipe:1',
  ];
}

export type PosterResult =
  | { ok: true; jpeg: Buffer }
  | { ok: false; reason: 'busy' | 'not-our-bucket' | 'no-frame' };

/**
 * Grabs a single JPEG frame from a clip already sitting in our own bucket.
 *
 * Never throws. Every failure path returns a reason the caller can act on,
 * because "no poster" is a normal outcome here, not an error.
 */
export async function generatePoster(videoUrl: string): Promise<PosterResult> {
  const publicBase = await getSecret('R2_PUBLIC_URL');
  if (!isOwnBucketUrl(videoUrl, publicBase)) return { ok: false, reason: 'not-our-bucket' };

  if (inFlight >= MAX_CONCURRENT) return { ok: false, reason: 'busy' };
  inFlight++;
  try {
    let jpeg = await runFfmpeg(ffmpegArgs(videoUrl, SEEK_SECONDS));
    // A clip shorter than the seek point has no frame there. Retry from the
    // very start rather than giving up on what is usually a two-second clip.
    if (!jpeg) jpeg = await runFfmpeg(ffmpegArgs(videoUrl, 0));
    return jpeg ? { ok: true, jpeg } : { ok: false, reason: 'no-frame' };
  } finally {
    inFlight--;
  }
}
