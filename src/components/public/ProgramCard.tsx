import Link from 'next/link';
import { Anchor, Mountain, Compass, Shield, Swords, Footprints, Waves, LifeBuoy, Dumbbell } from 'lucide-react';

/**
 * A program card, matching the landing page's treatment exactly.
 *
 * The image handling is the part that matters and the part I got wrong first
 * time: these covers are badge and emblem artwork, not photographs. The
 * landing page renders them `aspect-square object-contain` with padding for
 * that reason. Cropping them into a 16:9 `object-cover` strip — which is what
 * a photographic cover would want — slices the top and bottom off every badge
 * and looks broken, because it is.
 */

const PROGRAM_BADGE: Record<string, { icon: React.ElementType; color: string }> = {
  p5: { icon: Anchor, color: 'text-blue-400' },
  p6: { icon: Mountain, color: 'text-green-400' },
  p7: { icon: Compass, color: 'text-orange-400' },
  p8: { icon: Shield, color: 'text-red-400' },
  p9: { icon: Swords, color: 'text-gray-300' },
  p10: { icon: Footprints, color: 'text-yellow-400' },
  p11: { icon: Shield, color: 'text-purple-400' },
  p12: { icon: Waves, color: 'text-sky-400' },
  p13: { icon: Mountain, color: 'text-accent' },
  p14: { icon: LifeBuoy, color: 'text-orange-400' },
};

const GOAL_LABEL: Record<string, string> = {
  strength: 'Strength', hypertrophy: 'Muscle Building', endurance: 'Endurance',
  'weight-loss': 'Fat Loss', general: 'General Fitness',
};

export interface ProgramCardData {
  id: string;
  slug: string;
  name: string;
  description: string;
  level: string;
  goal: string;
  weeks: number;
  daysPerWeek: number;
  imageUrl?: string | null;
}

export function ProgramCard({ p }: { p: ProgramCardData }) {
  const badge = PROGRAM_BADGE[p.id];

  return (
    <Link
      href={`/programs/${p.slug}`}
      className="group relative flex flex-col h-full rounded-2xl border border-white/8 bg-surface overflow-hidden transition-all duration-300 hover:border-accent/40 hover:-translate-y-1 hover:shadow-[0_18px_50px_-12px_rgba(245,166,35,0.28)]"
    >
      <div className="relative w-full aspect-square bg-surface-elevated shrink-0 overflow-hidden">
        {/* A faint radial behind the artwork so a transparent PNG has depth
            instead of floating on flat grey. */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(245,166,35,0.13),transparent_65%)]" />
        {p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.imageUrl}
            alt={p.name}
            loading="lazy"
            className="relative w-full h-full object-contain p-3 transition-transform duration-500 group-hover:scale-[1.06]"
          />
        ) : (
          <div className="relative w-full h-full flex items-center justify-center">
            <Dumbbell className="w-12 h-12 text-accent/30" />
          </div>
        )}

        <span className="absolute top-2.5 left-2.5 px-2 py-1 rounded-lg bg-black/65 backdrop-blur-sm text-[10px] font-bold text-white uppercase tracking-wide">
          {p.level}
        </span>
        {badge && (
          <div className="absolute top-2.5 right-2.5 w-8 h-8 rounded-lg bg-black/65 backdrop-blur-sm flex items-center justify-center">
            <badge.icon className={`w-4 h-4 ${badge.color}`} />
          </div>
        )}
      </div>

      <div className="flex flex-col flex-1 p-5">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent">
          {GOAL_LABEL[p.goal] ?? p.goal}
        </span>
        <h3 className="text-base font-black text-white mt-1.5 leading-snug group-hover:text-accent transition-colors">
          {p.name}
        </h3>
        <p className="text-xs text-text-secondary mt-2 line-clamp-3 leading-relaxed flex-1">
          {p.description}
        </p>
        <div className="flex items-center gap-3 mt-4 pt-3.5 border-t border-white/8 text-[11px] text-text-tertiary">
          <span>{p.weeks}wk</span>
          <span className="w-px h-3 bg-white/10" />
          <span>{p.daysPerWeek}d/wk</span>
          <span className="w-px h-3 bg-white/10" />
          <span className="text-accent font-bold">{p.weeks * p.daysPerWeek} sessions</span>
        </div>
      </div>
    </Link>
  );
}
