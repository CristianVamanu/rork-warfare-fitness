import Link from 'next/link';

/** Shared footer for the public pages — mirrors the landing page's own. */
export function PublicFooter({ appName = 'Warfare Fitness' }: { appName?: string }) {
  return (
    <footer className="border-t border-white/8 mt-10">
      <div className="max-w-5xl mx-auto px-5 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
        <p className="text-xs text-text-tertiary">
          © {new Date().getFullYear()} {appName}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <Link href="/programs" className="text-xs text-text-tertiary hover:text-white transition-colors">Programs</Link>
          <Link href="/challenges" className="text-xs text-text-tertiary hover:text-white transition-colors">Challenges</Link>
          <Link href="/trainers" className="text-xs text-text-tertiary hover:text-white transition-colors">For Trainers</Link>
          <Link href="/privacy" className="text-xs text-text-tertiary hover:text-white transition-colors">Privacy</Link>
          <Link href="/terms" className="text-xs text-text-tertiary hover:text-white transition-colors">Terms</Link>
        </div>
      </div>
    </footer>
  );
}
