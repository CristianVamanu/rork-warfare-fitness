'use client';

import Link from 'next/link';

/**
 * The animated brand mark at the top of every auth screen.
 *
 * The three auth pages had drifted into three different treatments: login
 * played the hero video, forgot-password showed a static admin-uploaded logo,
 * and register had no mark at all — just a heading. Landing on the reset
 * screen from the login screen therefore looked like arriving at a different,
 * cheaper product, at precisely the moment someone is already mildly anxious
 * about their account.
 *
 * Same asset and size as the landing page hero (logo emerging through smoke
 * into flame). muted + playsInline + autoPlay is the combination iOS Safari
 * requires before it will autoplay anything without a tap.
 *
 * `preload="none"` on the secondary screens: the poster frame is what people
 * mostly see anyway, and a ~1MB video is not worth blocking a password reset
 * on a phone with two bars of signal.
 */
export function AuthBrandMark({
  title,
  subtitle,
  eager = false,
}: {
  title: string;
  subtitle?: string;
  /** Login is the page people wait on, so it loads the video immediately. */
  eager?: boolean;
}) {
  return (
    <Link href="/" className="flex flex-col items-center mb-8">
      <div className="relative w-32 h-32 mb-4">
        <video
          className="relative w-full h-full rounded-2xl object-cover shadow-glow-accent"
          src="/videos/hero-logo.mp4"
          poster="/videos/hero-logo-poster.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload={eager ? 'auto' : 'none'}
          aria-hidden="true"
        />
      </div>
      <h1 className="text-2xl font-black text-white tracking-tight text-center">{title}</h1>
      {subtitle && <p className="text-text-secondary text-sm mt-1 text-center">{subtitle}</p>}
    </Link>
  );
}
