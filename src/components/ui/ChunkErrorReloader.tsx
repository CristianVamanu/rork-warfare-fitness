'use client';

import { useEffect } from 'react';

// Every deploy replaces .next/static with freshly content-hashed chunk
// files — the old ones are gone from disk. Anyone with the app already
// open in a tab (or navigating with a stale cached HTML shell) can end up
// asking for a chunk hash that no longer exists on the server, which
// throws a ChunkLoadError and leaves a dead/blank screen instead of
// recovering. This catches that specific failure and does a single
// automatic reload to pick up the current build — guarded by a
// sessionStorage flag so a genuinely broken deploy can't reload-loop
// someone forever.
const RELOAD_FLAG = 'wf-chunk-reload';

function isChunkLoadError(reason: unknown): boolean {
  const msg = reason instanceof Error ? `${reason.name} ${reason.message}` : String(reason ?? '');
  return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module/i.test(msg);
}

export function ChunkErrorReloader() {
  useEffect(() => {
    const reloadOnce = () => {
      if (sessionStorage.getItem(RELOAD_FLAG)) return; // already tried once this session — avoid a loop
      sessionStorage.setItem(RELOAD_FLAG, '1');
      window.location.reload();
    };

    const onError = (e: ErrorEvent) => { if (isChunkLoadError(e.error)) reloadOnce(); };
    const onRejection = (e: PromiseRejectionEvent) => { if (isChunkLoadError(e.reason)) reloadOnce(); };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
