import Link from 'next/link';

/** Shared footer for the public pages — mirrors the landing page's own. */
export function PublicFooter() {
  return (
    <footer className="border-t border-white/8 mt-10">
      <div className="max-w-5xl mx-auto px-5 py-8 flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs text-text-tertiary">
          © {new Date().getFullYear()} Warfare Fitness
        </p>
        <div className="flex items-center gap-5">
          <Link href="/programs" className="text-xs text-text-tertiary hover:text-white transition-colors">Programs</Link>
          <Link href="/trainers" className="text-xs text-text-tertiary hover:text-white transition-colors">For Trainers</Link>
          <Link href="/privacy" className="text-xs text-text-tertiary hover:text-white transition-colors">Privacy</Link>
          <Link href="/terms" className="text-xs text-text-tertiary hover:text-white transition-colors">Terms</Link>
        </div>
      </div>
    </footer>
  );
}
