import { Info } from 'lucide-react';

/**
 * The small print under anything an AI estimated: food photos, barcode
 * matches, meal ideas. One sentence, the same everywhere, so a member
 * learns once that these are estimates to check rather than facts.
 */
export function AiDisclaimer({ className = '' }: { className?: string }) {
  return (
    <p className={`flex items-start gap-1.5 text-[11px] leading-relaxed text-text-tertiary ${className}`}>
      <Info className="w-3 h-3 flex-shrink-0 mt-[3px]" />
      <span>
        Calories and macros here are AI estimates and can be wrong. Check labels and portions, and speak to a doctor or
        registered dietitian before changing your diet for a medical condition. Not medical advice.
      </span>
    </p>
  );
}
