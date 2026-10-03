'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { RotateCcw, AlertTriangle } from 'lucide-react';
import { reportIssue } from '@/lib/reportIssue';

/**
 * Catches a render error on any page and keeps the shell around it.
 *
 * Before this the only boundary was global-error.tsx, which replaces the
 * ENTIRE document — nav, header, everything — with an unstyled reload
 * prompt. So a bug on one screen looked like the whole app had died, and
 * because that file only console.errors, it never reached the Errors tab:
 * the failures most worth knowing about were the ones never recorded.
 *
 * This one reports, and offers the two things that actually help: try the
 * page again (most render errors are a transient data shape), or go back to
 * the dashboard.
 */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[PageError]', error);
    // The digest is Next's fingerprint for the server-side error, and the
    // only thing that ties a client report to a server log line.
    reportIssue(`Page crashed: ${error.message}`.slice(0, 200), error.digest ? `digest=${error.digest}\n${error.stack ?? ''}` : error);
  }, [error]);

  return (
    <main className="min-h-[60vh] bg-background text-white flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full text-center">
        <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-accent">
          <AlertTriangle className="w-3.5 h-3.5" /> Something broke
        </p>
        <h1 className="text-2xl font-black tracking-tight mt-4">This screen hit an error</h1>
        <p className="text-sm text-text-secondary mt-3 leading-relaxed">
          It&apos;s been reported automatically. Your data is fine — this is a display problem, not a lost workout.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => reset()}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-accent text-black font-bold text-sm hover:brightness-110 transition"
          >
            <RotateCcw className="w-4 h-4" /> Try again
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center px-5 py-3 rounded-xl border border-white/15 text-sm font-semibold text-white hover:bg-white/5 transition"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
