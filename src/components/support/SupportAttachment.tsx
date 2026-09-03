'use client';

import { useState } from 'react';
import { Paperclip, X, FileUp } from 'lucide-react';
import toast from 'react-hot-toast';
import type { User } from 'firebase/auth';
import { getSystemConfig, type SupportAttachment } from '@/lib/firestore';
import { uploadUserContent, type StorageProvider } from '@/lib/uploadVideo';
import type { Message } from '@/types';

// Mirrors ROOT_MAX_SIZE_BYTES.support in /api/uploads/presign. Checked here
// too so an oversized file fails instantly against a clear message rather
// than after a pointless round trip — the server check is still the one that
// actually enforces it.
export const SUPPORT_MAX_BYTES = 20 * 1024 * 1024;

// The presign route allows image/* and video/* and explicitly rejects SVG
// (it can carry script, and the bucket serves its contents as active
// content). Matching that here keeps the file picker honest about what will
// actually be accepted.
const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,image/heic,video/mp4,video/quicktime,video/webm';

function isRejectedType(file: File): boolean {
  if (/^image\/svg\+xml$/i.test(file.type)) return true;
  return !/^(image|video)\//.test(file.type);
}

/**
 * Uploads a support attachment and hands back the stored URL.
 *
 * Reuses the same presign → direct-PUT path the PR wall and community posts
 * use (uploadUserContent), only under a `support/` root — so this adds no new
 * storage mechanism, just a new folder with its own smaller size ceiling.
 */
export function useSupportUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  async function upload(user: User, file: File): Promise<SupportAttachment | null> {
    if (isRejectedType(file)) {
      toast.error('Only images and videos can be attached.');
      return null;
    }
    if (file.size > SUPPORT_MAX_BYTES) {
      toast.error(`That file is ${(file.size / 1024 / 1024).toFixed(1)}MB — the limit is 20MB.`);
      return null;
    }
    setUploading(true);
    setProgress(0);
    try {
      const cfg = await getSystemConfig().catch(() => null);
      const provider = ((cfg?.storageProvider as StorageProvider) || 'firebase');
      const url = await uploadUserContent(provider, user, file, 'support', setProgress);
      return { url, name: file.name, type: file.type };
    } catch (err) {
      console.error('[support] attachment upload failed:', err);
      toast.error('Upload failed. Please try again.');
      return null;
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  return { upload, uploading, progress };
}

/** The chip shown next to the composer once a file is staged but not yet sent. */
export function PendingAttachment({
  file,
  uploading,
  progress,
  onClear,
}: {
  file: File;
  uploading: boolean;
  progress: number;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-surface-elevated border border-border px-3 py-2 text-xs">
      <FileUp className="w-3.5 h-3.5 text-accent flex-shrink-0" aria-hidden="true" />
      <span className="flex-1 min-w-0 truncate text-white">{file.name}</span>
      <span className="text-text-tertiary tabular-nums flex-shrink-0">
        {uploading ? `${progress}%` : `${(file.size / 1024 / 1024).toFixed(1)}MB`}
      </span>
      {!uploading && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Remove attachment"
          className="p-0.5 rounded text-text-tertiary hover:text-danger transition-colors flex-shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

/** The paperclip button that opens the file picker. */
export function AttachButton({
  onPick,
  disabled,
}: {
  onPick: (file: File) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`p-2.5 rounded-xl border border-white/10 bg-surface transition-colors flex-shrink-0 ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer text-text-secondary hover:text-white hover:border-accent/50'
      }`}
      title="Attach a screenshot or video (max 20MB)"
    >
      <Paperclip className="w-4 h-4" aria-hidden="true" />
      <span className="sr-only">Attach a file</span>
      <input
        type="file"
        accept={ACCEPT}
        disabled={disabled}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          // Cleared so picking the same file twice in a row still fires
          // onChange — otherwise a failed upload can't be retried.
          e.target.value = '';
          if (f) onPick(f);
        }}
      />
    </label>
  );
}

/** Renders whatever a sent message carries, inside the message bubble. */
export function MessageAttachment({ message }: { message: Message }) {
  if (!message.attachmentUrl) return null;
  const isImage = (message.attachmentType ?? '').startsWith('image/');
  const isVideo = (message.attachmentType ?? '').startsWith('video/');

  if (isImage) {
    return (
      <a href={message.attachmentUrl} target="_blank" rel="noopener noreferrer" className="block mt-2">
        {/* Deliberately a plain <img>, not next/image: these are user uploads
            on a runtime-configurable host (R2 or Firebase Storage depending
            on the install), which next/image would need whitelisted in
            next.config.js at build time. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={message.attachmentUrl}
          alt={message.attachmentName || 'Attachment'}
          className="rounded-lg max-h-64 w-auto border border-white/10"
          loading="lazy"
        />
      </a>
    );
  }

  if (isVideo) {
    return (
      <video src={message.attachmentUrl} controls preload="metadata" className="mt-2 rounded-lg max-h-64 w-full border border-white/10">
        <a href={message.attachmentUrl} target="_blank" rel="noopener noreferrer">
          {message.attachmentName || 'Download video'}
        </a>
      </video>
    );
  }

  return (
    <a
      href={message.attachmentUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 flex items-center gap-2 rounded-lg bg-black/20 px-3 py-2 text-xs underline"
    >
      <Paperclip className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
      <span className="truncate">{message.attachmentName || 'Attachment'}</span>
    </a>
  );
}
