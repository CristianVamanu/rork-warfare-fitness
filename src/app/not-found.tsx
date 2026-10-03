import Link from 'next/link';
import { ArrowLeft, Crosshair } from 'lucide-react';

/**
 * The 404.
 *
 * Without this file Next renders its own: a white page, black Helvetica,
 * "404 | This page could not be found." On a site that is otherwise dark
 * from the first pixel it looks like the server fell over, and it is the
 * page a mistyped share link or a dead ad URL lands on — the moment a
 * stranger is least invested and most ready to leave.
 *
 * Server component, no data, no auth. It must render for someone who has
 * never signed in, and it must render when the rest of the app is broken.
 */
export default function NotFound() {
  return (
    <main className="min-h-screen bg-background text-white flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full text-center">
        <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-accent">
          <Crosshair className="w-3.5 h-3.5" /> Off target
        </p>
        <h1 className="text-5xl font-black tracking-tight mt-4 leading-none">404</h1>
        <p className="text-base text-text-secondary mt-4 leading-relaxed">
          That page doesn&apos;t exist. If a link brought you here, it&apos;s the link that&apos;s wrong, not you.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-accent text-black font-bold text-sm hover:brightness-110 transition"
          >
            <ArrowLeft className="w-4 h-4" /> Home
          </Link>
          <Link
            href="/standards"
            className="inline-flex items-center justify-center px-5 py-3 rounded-xl border border-white/15 text-sm font-semibold text-white hover:bg-white/5 transition"
          >
            Test yourself against a selection standard
          </Link>
        </div>
      </div>
    </main>
  );
}
