'use client';

import { useRef, useState, useEffect } from 'react';

interface WeightSliderProps {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  max?: number;
  unit?: string;
  disabled?: boolean;
}

// Replaces the old scroll-physics WeightWheel (100+ rendered DOM nodes,
// debounced scroll-snap timers) with a native range input — tap-anywhere
// and drag work for free since the whole track is the input's hit target,
// and there's no custom scroll physics to feel laggy on lower-end phones.
export function WeightSlider({
  value,
  onChange,
  step = 2.5,
  max = 300,
  unit = 'kg',
  disabled = false,
}: WeightSliderProps) {
  const [editing, setEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(String(value));
  const lastHapticStep = useRef<number>(Math.floor(value / 5));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function handleSlide(raw: number) {
    onChange(raw);
    // Haptic tick every 5 units crossed — Vibration API only works on
    // Android Chrome; iOS Safari has no web vibration support at all, so
    // this silently no-ops there rather than failing.
    const step5 = Math.floor(raw / 5);
    if (step5 !== lastHapticStep.current) {
      lastHapticStep.current = step5;
      navigator.vibrate?.(10);
    }
  }

  function commitDraft() {
    const parsed = parseFloat(draftValue);
    if (!isNaN(parsed)) {
      onChange(Math.max(0, Math.min(max, parsed)));
    }
    setEditing(false);
  }

  return (
    <div className="select-none">
      {/* Large live number — double-tap/double-click to enter a value manually */}
      {editing ? (
        <input
          ref={inputRef}
          type="number"
          value={draftValue}
          onChange={(e) => setDraftValue(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => { if (e.key === 'Enter') commitDraft(); }}
          className="w-full text-center text-5xl font-black text-accent bg-transparent focus:outline-none mb-2"
        />
      ) : (
        <button
          onDoubleClick={() => { setDraftValue(String(value)); setEditing(true); }}
          disabled={disabled}
          className="w-full text-center text-5xl font-black text-accent mb-2 tabular-nums"
        >
          {value % 1 === 0 ? value : value.toFixed(1)}
          <span className="text-lg text-text-tertiary ml-1.5">{unit}</span>
        </button>
      )}

      {/* Fine adjustment + slider */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => handleSlide(Math.max(0, parseFloat((value - step).toFixed(2))))}
          disabled={disabled}
          className="w-9 h-9 rounded-full bg-surface-elevated border border-border flex items-center justify-center text-foreground hover:bg-border active:scale-95 transition-all flex-shrink-0"
        >
          −
        </button>

        <div className="flex-1">
          <input
            type="range"
            min={0}
            max={max}
            step={step}
            value={value}
            disabled={disabled}
            onChange={(e) => handleSlide(parseFloat(e.target.value))}
            className="w-full weight-slider-input"
            style={{ accentColor: '#F5A623' }}
          />
          <div className="flex justify-between text-[10px] text-text-tertiary mt-0.5">
            <span>0</span>
            <span>{max}</span>
          </div>
        </div>

        <button
          onClick={() => handleSlide(Math.min(max, parseFloat((value + step).toFixed(2))))}
          disabled={disabled}
          className="w-9 h-9 rounded-full bg-surface-elevated border border-border flex items-center justify-center text-foreground hover:bg-border active:scale-95 transition-all flex-shrink-0"
        >
          +
        </button>
      </div>
    </div>
  );
}
