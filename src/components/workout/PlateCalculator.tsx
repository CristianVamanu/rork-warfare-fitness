'use client';

import { useState } from 'react';
import { Calculator, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';

// 15kg/35lb and 25kg/25lb plates are excluded by default — most gyms and
// home setups have far fewer pairs of those than the round, standard
// denominations, so a mathematically-optimal-but-uncommon combo (e.g. 25+15
// for 40kg/side) isn't actually what most people can rack. Common plates
// only by default; the odd ones are opt-in via "I also have odd plates".
const PLATES_KG_COMMON = [20, 10, 5, 2.5, 1.25];
const PLATES_KG_ALL = [25, 20, 15, 10, 5, 2.5, 1.25];
const PLATES_LBS_COMMON = [45, 10, 5, 2.5];
const PLATES_LBS_ALL = [45, 35, 25, 10, 5, 2.5];
const PLATE_COLOR_KG: Record<number, string> = {
  25: 'bg-red-500',
  20: 'bg-blue-500',
  15: 'bg-yellow-500',
  10: 'bg-green-500',
  5: 'bg-white',
  2.5: 'bg-gray-400',
  1.25: 'bg-gray-500',
};
const PLATE_COLOR_LBS: Record<number, string> = {
  45: 'bg-blue-500',
  35: 'bg-yellow-500',
  25: 'bg-green-500',
  10: 'bg-white',
  5: 'bg-gray-400',
  2.5: 'bg-gray-500',
};

function calculatePlates(perSide: number, available: number[]): number[] {
  const result: number[] = [];
  let remaining = perSide;
  for (const plate of available) {
    while (remaining >= plate - 0.01) {
      result.push(plate);
      remaining -= plate;
    }
  }
  return result;
}

interface Props {
  targetWeight: number;
  unit: string;
}

export function PlateCalculatorButton({ targetWeight, unit }: Props) {
  const [open, setOpen] = useState(false);
  const [barWeight, setBarWeight] = useState(unit === 'lbs' ? 45 : 20);
  const [includeOddPlates, setIncludeOddPlates] = useState(false);

  const perSide = Math.max(0, (targetWeight - barWeight) / 2);
  const plateColor = unit === 'lbs' ? PLATE_COLOR_LBS : PLATE_COLOR_KG;
  const availablePlates = unit === 'lbs'
    ? (includeOddPlates ? PLATES_LBS_ALL : PLATES_LBS_COMMON)
    : (includeOddPlates ? PLATES_KG_ALL : PLATES_KG_COMMON);
  const plates = calculatePlates(perSide, availablePlates);
  const usedWeight = plates.reduce((s, p) => s + p, 0) * 2 + barWeight;
  const shortBy = targetWeight - usedWeight;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-text-tertiary hover:text-white hover:bg-white/8 transition-colors"
      >
        <Calculator className="w-3 h-3" />
        Plates
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Plate Calculator">
        <div className="space-y-4">
          <div>
            <label className="text-xs text-text-secondary mb-1.5 block">Bar weight ({unit})</label>
            <div className="flex gap-2">
              {(unit === 'lbs' ? [35, 45] : [15, 20]).map((b) => (
                <button
                  key={b}
                  onClick={() => setBarWeight(b)}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-colors ${barWeight === b ? 'bg-accent text-black border-accent' : 'border-white/10 text-text-secondary'}`}
                >
                  {b}{unit}
                </button>
              ))}
            </div>
          </div>

          <div className="text-center py-2">
            <p className="text-xs text-text-tertiary">Target weight</p>
            <p className="text-3xl font-black text-white">{targetWeight}{unit}</p>
          </div>

          <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={includeOddPlates}
              onChange={(e) => setIncludeOddPlates(e.target.checked)}
              className="w-4 h-4 rounded accent-accent"
            />
            I also have {unit === 'lbs' ? '25lb/35lb' : '15kg/25kg'} plates
          </label>

          {perSide <= 0 ? (
            <p className="text-center text-sm text-text-secondary py-4">Target weight is at or below the bar — no plates needed.</p>
          ) : (
            <>
              <div>
                <p className="text-xs font-bold text-text-tertiary uppercase tracking-wide mb-2 text-center">Load each side with</p>
                {plates.length === 0 ? (
                  <p className="text-center text-sm text-text-secondary">No exact plate combination — try a different target.</p>
                ) : (
                  <div className="flex items-center justify-center gap-1.5 flex-wrap py-2">
                    {plates.map((p, i) => (
                      <div
                        key={i}
                        className={`${plateColor[p] ?? 'bg-gray-400'} rounded-md flex items-center justify-center font-bold text-black text-[11px] flex-shrink-0`}
                        style={{ width: Math.max(24, Math.min(48, 18 + p)), height: Math.max(40, Math.min(64, 30 + p)) }}
                      >
                        {p}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-center text-xs text-text-tertiary">
                {plates.map((p) => `${p}`).join(' + ')} {plates.length > 0 && `per side`}
              </p>
              {Math.abs(shortBy) > 0.05 && (
                <p className="text-center text-[11px] text-yellow-400">
                  Closest possible: {usedWeight}{unit} ({shortBy > 0 ? `${shortBy.toFixed(2)}${unit} short` : `${Math.abs(shortBy).toFixed(2)}${unit} over`})
                </p>
              )}
            </>
          )}

          <button onClick={() => setOpen(false)} className="w-full py-2.5 rounded-xl text-sm font-bold text-text-secondary hover:text-white hover:bg-white/5 transition-colors flex items-center justify-center gap-1.5">
            <X className="w-4 h-4" /> Close
          </button>
        </div>
      </Modal>
    </>
  );
}
