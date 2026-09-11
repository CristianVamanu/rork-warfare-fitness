'use client';

import { useRef, useCallback } from 'react';

/**
 * A double-tap that works on a phone.
 *
 * `onDoubleClick` is a mouse event. Mobile Safari synthesises it only some of
 * the time — it depends on whether the page is zoomable and whether the two
 * taps land within its own, undocumented window — so a control that relies on
 * it "works on double tap" on one phone and does nothing on the next. Two
 * plain clicks inside 320ms is the same gesture and fires everywhere.
 *
 * Returns an onClick handler. A single tap is ignored, so the element can
 * still carry its own single-tap behaviour elsewhere if needed.
 */
export function useDoubleTap(onDouble: () => void, windowMs = 320): () => void {
  const last = useRef(0);
  return useCallback(() => {
    const now = Date.now();
    if (now - last.current < windowMs) {
      last.current = 0;
      onDouble();
    } else {
      last.current = now;
    }
  }, [onDouble, windowMs]);
}
