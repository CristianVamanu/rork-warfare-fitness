'use client';

import { useRef, useState, useEffect } from 'react';
import { useDoubleTap } from '@/lib/useDoubleTap';

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
    // Accept a comma decimal — half the world's phone keypads offer one.
    const parsed = parseFloat(draftValue.replace(',', '.'));
    if (!isNaN(parsed)) {
      onChange(Math.max(0, Math.min(max, parsed)));
    }
    setEditing(false);
  }

  // Two taps inside 320ms, on any device — onDoubleClick alone is a mouse
  // event that Mobile Safari only sometimes synthesises.
  const startEditing = useDoubleTap(() => { setDraftValue(String(value)); setEditing(true); });

  return (
    <div className="select-none">
      {/* Large live number — double-tap to type a value */}
      {editing ? (
        // type="text" + inputMode="decimal", not type="number": on iPhone
        // a number input opens the FULL keyboard (letters, with a numbers
        // row), which is what "the kg shows the wrong keyboard" was. The
        // decimal inputmode is the numeric keypad with a decimal point.
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          pattern="[0-9]*[.,]?[0-9]*"
          autoComplete="off"
          enterKeyHint="done"
          value={draftValue}
          onChange={(e) => setDraftValue(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={commitDraft}
          onKeyDown={(e) => { if (e.key === 'Enter') commitDraft(); }}
          aria-label={`Weight in ${unit}`}
          className="w-full text-center text-5xl font-black text-accent bg-transparent focus:outline-none mb-2 tabular-nums"
        />
      ) : (
        <button
          type="button"
          onClick={startEditing}
          disabled={disabled}
          aria-label={`${value} ${unit} — double-tap to type a weight`}
          className="w-full text-center text-5xl font-black text-accent mb-2 tabular-nums"
        >
          {value % 1 === 0 ? value : value.toFixed(1)}
          <span className="text-lg text-text-tertiary ml-1.5">{unit}</span>
        </button>
      )}
      {/* The hint is the only way anyone finds out the number is editable;
          a double-tap has no visual affordance. Small print, not a banner. */}
      <p className="text-[10px] text-text-tertiary text-center -mt-1 mb-2">
        {editing ? 'Type the weight, then Done' : 'Double-tap the number to type a weight'}
      </p>

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
