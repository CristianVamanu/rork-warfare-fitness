import { QUEST_DEFS } from '@/lib/quests';

/** Small inline row of quest reward icons for a user — leaderboard rows,
 * profile header, anywhere identity needs to show off earned badges. */
export function QuestBadgeRow({ questIds, max = 3 }: { questIds: string[]; max?: number }) {
  if (!questIds?.length) return null;
  const icons = questIds
    .map((id) => QUEST_DEFS.find((q) => q.id === id)?.rewardIcon)
    .filter((icon): icon is string => !!icon)
    .slice(0, max);
  if (icons.length === 0) return null;

  return (
    <span className="inline-flex items-center gap-0.5">
      {icons.map((icon, i) => (
        <span key={i} className="text-xs">{icon}</span>
      ))}
      {questIds.length > max && (
        <span className="text-[9px] text-text-tertiary ml-0.5">+{questIds.length - max}</span>
      )}
    </span>
  );
}
