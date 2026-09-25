'use client';

import { useRef, useState } from 'react';
import { Image as ImageIcon, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { getIdToken } from 'firebase/auth';
import { useAuth } from '@/contexts/AuthContext';
import { compressImage } from '@/lib/imageCompress';
import { uploadUserContent, resolveStorageProvider } from '@/lib/uploadVideo';
import { extractVideoThumbnail } from '@/lib/videoThumbnail';
import { getSystemConfig } from '@/lib/firestore';
import type { PostMedia } from '@/types';

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

/**
 * Picks, uploads and previews up to `max` photos or clips, in the order
 * chosen. The same flow the channel composer runs, lifted out so the
 * challenge submit form, the challenge feed and the admin challenge editor
 * do not each carry their own copy of the upload + poster-grab dance.
 *
 * Controlled: `value` is the list of uploaded items, `onChange` gets the
 * new list after every upload or removal. Uploading is sequential so the
 * ring means one file and the order matches the pick.
 */
export function MediaPicker({ value, onChange, max = 1, allowVideo = true, folder = 'community', label, compact = false }: {
  value: PostMedia[];
  onChange: (next: PostMedia[]) => void;
  max?: number;
  allowVideo?: boolean;
  folder?: 'community' | 'prPosts';
  label?: string;
  /** Just the button and thumbnails, for a compose bar. */
  compact?: boolean;
}) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  // Live mirror for the poster grab, which lands after the upload and must
  // not attach a frame to a clip that has since been removed.
  const valueRef = useRef(value);
  valueRef.current = value;

  const full = value.length >= max;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0 || !user) return;
    const room = max - valueRef.current.length;
    if (room <= 0) { toast.error(max === 1 ? 'One attachment here' : `Up to ${max} here`); return; }
    if (picked.length > room) toast.error(`Only ${room} more fit — first ${room} taken`);
    const files = picked.slice(0, room);
    for (const f of files) {
      const isVideo = f.type.startsWith('video/');
      if (isVideo && !allowVideo) { toast.error('Clips are not allowed here'); return; }
      if (f.size > (isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES)) {
        toast.error(isVideo ? 'Clip must be under 100 MB' : 'Image must be under 20 MB');
        return;
      }
    }
    setBusy(true);
    try {
      const cfg = await getSystemConfig().catch(() => null);
      const provider = resolveStorageProvider(cfg?.storageProvider);
      for (const file of files) {
        const isVideo = file.type.startsWith('video/');
        const toUpload = isVideo ? file : await compressImage(file);
        setPct(0);
        const url = await uploadUserContent(provider, user, toUpload, folder, (p) => setPct(Math.round(p)));
        const item: PostMedia = { url, type: isVideo ? 'video' : 'image' };
        const next = [...valueRef.current, item];
        valueRef.current = next;
        onChange(next);
        if (isVideo) void grabPoster(file, url, provider);
      }
    } catch {
      toast.error('Upload failed — try again');
    } finally {
      setBusy(false);
      setPct(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  // Server frame first (ffmpeg), browser frame as the fallback; neither may
  // hold up the upload. Attached only if the clip is still in the list.
  async function grabPoster(file: File, url: string, provider: ReturnType<typeof resolveStorageProvider>) {
    if (!user) return;
    try {
      let posterUrl: string | null = null;
      try {
        const token = await getIdToken(user);
        const res = await fetch('/api/media/poster', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ videoUrl: url }),
        });
        if (res.ok) posterUrl = ((await res.json()) as { posterUrl?: string | null }).posterUrl ?? null;
      } catch { /* fall through */ }
      if (!posterUrl) {
        const frame = await extractVideoThumbnail(file);
        if (frame) posterUrl = await uploadUserContent(provider, user, new File([frame], 'poster.jpg', { type: 'image/jpeg' }), folder);
      }
      if (posterUrl && valueRef.current.some((m) => m.url === url)) {
        const next = valueRef.current.map((m) => (m.url === url ? { ...m, posterURL: posterUrl! } : m));
        valueRef.current = next;
        onChange(next);
      }
    } catch { /* posterless is fine */ }
  }

  const remove = (url: string) => {
    const next = valueRef.current.filter((m) => m.url !== url);
    valueRef.current = next;
    onChange(next);
  };

  const thumbs = value.length > 0 && (
    <div className="flex gap-2 overflow-x-auto py-1 pr-1" style={{ scrollbarWidth: 'none' }}>
      {value.map((m, i) => (
        <div key={m.url} className="relative flex-shrink-0 mt-1.5">
          {m.type === 'video' ? (
            <video src={m.url} poster={m.posterURL} muted playsInline preload="metadata" className="h-16 w-16 rounded-lg object-cover bg-black" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.url} alt={`attachment ${i + 1}`} className="h-16 w-16 rounded-lg object-cover" />
          )}
          {max > 1 && <span className="absolute bottom-1 left-1 px-1 rounded bg-black/60 text-[10px] font-semibold text-white tabular-nums">{i + 1}</span>}
          <button type="button" onClick={() => remove(m.url)} aria-label={`Remove attachment ${i + 1}`} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-danger rounded-full flex items-center justify-center">
            <X className="w-3 h-3 text-white" />
          </button>
        </div>
      ))}
      {max > 1 && <span className="self-center text-[11px] text-text-tertiary tabular-nums flex-shrink-0">{value.length}/{max}</span>}
    </div>
  );

  const input = (
    <input ref={inputRef} type="file" accept={allowVideo ? 'image/*,video/*' : 'image/*'} multiple={max > 1} className="hidden" onChange={onPick} />
  );

  if (compact) {
    return (
      <>
        {thumbs}
        {input}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy || full}
          aria-label={busy && pct !== null ? `Uploading, ${pct} percent` : 'Attach'}
          className="relative p-2 rounded-xl bg-surface border border-white/10 text-text-secondary hover:text-white hover:border-white/20 transition-colors flex-shrink-0 disabled:opacity-100 overflow-hidden"
          style={busy && pct !== null ? { background: `conic-gradient(rgb(var(--accent-rgb)) ${pct * 3.6}deg, rgba(255,255,255,0.06) 0deg)` } : undefined}
        >
          {busy ? (
            <span className="relative flex items-center justify-center w-4 h-4 rounded-md bg-surface text-[9px] font-bold text-white tabular-nums leading-none">
              {pct !== null ? pct : <Loader2 className="w-3 h-3 animate-spin" />}
            </span>
          ) : <ImageIcon className="w-4 h-4" />}
        </button>
      </>
    );
  }

  return (
    <div className="space-y-1">
      {thumbs}
      {input}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy || full}
        className="w-full flex items-center justify-center gap-2 border border-dashed border-white/15 rounded-xl py-3 text-xs text-text-secondary disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
        {busy && pct !== null ? `Uploading ${pct}%` : full ? `${max === 1 ? 'Attached' : `${max} of ${max} attached`}` : (label ?? (max > 1 ? `Add up to ${max} photos${allowVideo ? ' or clips' : ''}` : `Add a photo${allowVideo ? ' or clip' : ''}`))}
      </button>
    </div>
  );
}
