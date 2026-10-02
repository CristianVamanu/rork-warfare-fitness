'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Music, Upload, Trash2, Play, Pause, Loader2, Edit2, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { getSystemConfig } from '@/lib/firestore';
import { uploadVideo, resolveStorageProvider } from '@/lib/uploadVideo';
import { getBreathTracks, addBreathTrack, removeBreathTrack, renameBreathTrack, readAudioDuration, playableUrl, BUILT_IN_TRACK } from '@/lib/breathTracks';
import type { BreathTrack } from '@/types';

const MAX_BYTES = 40 * 1024 * 1024;
const fmt = (s?: number) => s == null ? '' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * Admin · Breathing soundtracks.
 *
 * Upload a song, give it a name, and it appears in the picker on the
 * breathing setup screen for every member. The built-in track cannot be
 * removed; it is the one that plays when nothing else is chosen.
 */
export default function AdminBreathingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [tracks, setTracks] = useState<BreathTrack[] | null>(null);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const load = () => getBreathTracks().then(setTracks).catch(() => { setTracks([BUILT_IN_TRACK]); toast.error('Could not load the tracks'); });
  useEffect(() => { void load(); }, []);
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  async function upload() {
    if (!user || !file) return;
    if (!file.type.startsWith('audio/')) { toast.error('Pick an audio file (MP3, M4A, WAV)'); return; }
    if (file.size > MAX_BYTES) { toast.error('Keep it under 40 MB'); return; }
    const name = title.trim() || file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
    setPct(0);
    try {
      const cfg = await getSystemConfig().catch(() => null);
      const provider = resolveStorageProvider(cfg?.storageProvider);
      const [url, durationSeconds] = await Promise.all([
        uploadVideo(provider, user, file, 'breathTracks', setPct),
        readAudioDuration(file),
      ]);
      const order = (tracks?.length ?? 1);
      await addBreathTrack({ title: name, url, durationSeconds, order });
      toast.success(`${name} added`);
      setTitle(''); setFile(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally { setPct(null); }
  }

  async function remove(t: BreathTrack) {
    if (!confirm(`Remove "${t.title}" from the breathing screen?`)) return;
    try { await removeBreathTrack(t.id); toast.success('Removed'); await load(); } catch { toast.error('Could not remove it'); }
  }

  async function saveTitle() {
    if (!editing) return;
    const t = editing.title.trim(); if (!t) return;
    try { await renameBreathTrack(editing.id, t); setEditing(null); await load(); } catch { toast.error('Could not rename it'); }
  }

  function togglePreview(t: BreathTrack) {
    const a = audioRef.current ?? (audioRef.current = new Audio());
    if (previewId === t.id) { a.pause(); setPreviewId(null); return; }
    a.src = playableUrl(t); a.currentTime = 0;
    a.play().then(() => setPreviewId(t.id)).catch(() => toast.error('Could not play this file'));
    a.onended = () => setPreviewId(null);
  }

  return (
    <div className="px-4 py-4 max-w-2xl mx-auto space-y-4">
      <button onClick={() => router.push('/admin')} className="flex items-center gap-1 text-xs text-text-secondary"><ChevronLeft className="w-4 h-4" /> Admin</button>
      <div>
        <p className="text-[10px] font-semibold tracking-[0.28em] uppercase text-accent/90">Breathing</p>
        <h1 className="text-xl font-black text-white mt-1">Soundtracks</h1>
        <p className="text-sm text-text-secondary mt-1">Songs members can choose on the breathing screen. Upload your own; they loop for the length of the session and fade in and out.</p>
      </div>

      <Card className="p-4 space-y-3">
        <p className="text-xs font-bold text-white flex items-center gap-2"><Upload className="w-4 h-4 text-accent" /> Add a track</p>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional, taken from the file name if empty)" className="w-full rounded-xl bg-black/25 border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-text-tertiary" />
        <label className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-white/15 px-3 py-3 cursor-pointer hover:border-accent/40">
          <span className="text-sm text-text-secondary truncate">{file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB` : 'Choose an audio file (MP3, M4A, WAV · under 40 MB)'}</span>
          <input type="file" accept="audio/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <Music className="w-4 h-4 text-accent flex-shrink-0" />
        </label>
        {pct !== null && <div className="h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} /></div>}
        <Button fullWidth onClick={upload} disabled={!file || pct !== null}>{pct !== null ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading {pct}%</> : 'Upload'}</Button>
      </Card>

      {!tracks ? <Skeleton className="h-40 rounded-2xl" /> : (
        <Card className="divide-y divide-white/6 overflow-hidden">
          {tracks.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3">
              <button type="button" onClick={() => togglePreview(t)} className="w-9 h-9 rounded-lg border border-accent/40 bg-accent/10 text-accent flex items-center justify-center flex-shrink-0" aria-label={previewId === t.id ? 'Pause' : 'Preview'}>
                {previewId === t.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>
              <div className="flex-1 min-w-0">
                {editing?.id === t.id ? (
                  <div className="flex items-center gap-2">
                    <input autoFocus value={editing.title} onChange={(e) => setEditing({ id: t.id, title: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') void saveTitle(); if (e.key === 'Escape') setEditing(null); }} className="flex-1 rounded-lg bg-black/25 border border-white/10 px-2 py-1.5 text-sm text-white" />
                    <button type="button" onClick={saveTitle} className="p-1.5 text-accent" aria-label="Save"><Check className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-white truncate">{t.title}</p>
                    <p className="text-[11px] text-text-tertiary">{t.id === 'built-in' ? 'Built in · the default' : 'Uploaded'}{t.durationSeconds ? ` · ${fmt(t.durationSeconds)}` : ''}</p>
                  </>
                )}
              </div>
              {t.id !== 'built-in' && editing?.id !== t.id && (
                <>
                  <button type="button" onClick={() => setEditing({ id: t.id, title: t.title })} className="p-2 text-text-secondary hover:text-white" aria-label="Rename"><Edit2 className="w-4 h-4" /></button>
                  <button type="button" onClick={() => remove(t)} className="p-2 text-text-secondary hover:text-red-400" aria-label="Remove"><Trash2 className="w-4 h-4" /></button>
                </>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
