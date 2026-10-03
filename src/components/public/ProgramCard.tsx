import Link from 'next/link';
import { Anchor, Mountain, Compass, Shield, Swords, Footprints, Waves, LifeBuoy, Dumbbell } from 'lucide-react';

/**
 * A program card, matching the landing page and the free-plan page exactly.
 *
 * The artwork is square badge work, and it is shown as a square thumbnail
 * in the corner rather than a full-width banner: a thumbnail the same size
 * on every card is what keeps a row of cards the same height whatever the
 * image, and it leaves the room for the three stat boxes underneath.
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

/**
 * `wide` lays the same card out horizontally — artwork on the left, copy on
 * the right — for goal groups holding only one or two programs.
 *
 * Those groups were the layout bug on /programs: every section rendered into
 * the same three-column grid, so a group of one put a narrow portrait card in
 * the left third with two thirds of the row empty beside it, and read as a
 * loading failure rather than a section with one program in it. A wide card
 * fills the row it is given, which is what makes a short group look
 * deliberate instead of broken.
 */
export function ProgramCard({ p, wide = false }: { p: ProgramCardData; wide?: boolean }) {
  const badge = PROGRAM_BADGE[p.id];
  const level = p.level.charAt(0).toUpperCase() + p.level.slice(1);
  const stats: [string, string][] = [
    ['Duration', `${p.weeks} weeks, ${p.weeks >= 8 ? 'phased' : 'one block'}`],
    ['Sessions', `${p.daysPerWeek} a week, rest days kept`],
    ['Total', `${p.weeks * p.daysPerWeek} workouts, ${level.toLowerCase()}`],
  ];

  // One surface for both layouts — the free-plan card: ember wash, dot
  // grid, goal eyebrow, square thumbnail in the corner, three equal stat
  // boxes. `wide` only changes how much room the description gets.
  return (
    <Link
      href={`/programs/${p.slug}`}
      className="group relative overflow-hidden flex flex-col h-full rounded-2xl border border-white/10 bg-surface p-5 transition-all duration-300 hover:border-accent/40 hover:-translate-y-1 hover:shadow-[0_18px_50px_-12px_rgba(245,166,35,0.28)]"
    >
      <div aria-hidden className="wf-ember pointer-events-none absolute inset-0" />
      <div aria-hidden className="wf-dots pointer-events-none absolute inset-0" />
      <div className="relative flex flex-col flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="wf-readout text-[10px] font-bold text-accent">{GOAL_LABEL[p.goal] ?? p.goal}</span>
          {badge && (
            <span className="w-7 h-7 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center flex-shrink-0">
              <badge.icon className={`w-3.5 h-3.5 ${badge.color}`} />
            </span>
          )}
        </div>
        <div className="flex items-start gap-4 mt-2">
          <div className={`${wide ? 'w-20 h-20' : 'w-16 h-16'} rounded-xl border border-white/10 bg-surface-elevated overflow-hidden flex-shrink-0 flex items-center justify-center`}>
            {p.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.imageUrl} alt="" loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" />
            ) : (
              <Dumbbell className="w-6 h-6 text-accent/40" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className={`${wide ? 'text-xl' : 'text-lg'} font-black text-white leading-tight group-hover:text-accent transition-colors`}>{p.name}</h3>
            <p className="text-[12px] text-text-tertiary mt-1">{p.weeks} weeks · {p.daysPerWeek} days a week · {level}</p>
          </div>
        </div>
        <p className={`text-[13px] text-text-secondary leading-relaxed mt-3 flex-1 ${wide ? 'line-clamp-6' : 'line-clamp-4'}`}>{p.description}</p>
        <div className="grid grid-cols-3 gap-2 mt-4">
          {stats.map(([t, sub]) => (
            <div key={t} className="rounded-xl border border-white/10 bg-black/25 p-3">
              <p className="text-[12px] font-bold text-white leading-tight">{t}</p>
              <p className="text-[11px] text-text-tertiary leading-snug mt-1">{sub}</p>
            </div>
          ))}
        </div>
      </div>
    </Link>
  );
}
