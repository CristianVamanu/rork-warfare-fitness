'use client';

// Fixed, full-viewport decorative layer behind the app's content column.
// On mobile the max-w-lg content covers the whole width, so this is
// invisible — it only shows in the large empty margins either side of the
// content on desktop, which is exactly where the app looked flat/dull.
// Fully pointer-events-none and z-indexed behind everything so it can
// never intercept a click or tab stop.
export function AppBackground() {
  return (
    // No z-index here on purpose — it relies on being the first thing
    // rendered in AppLayout's DOM order (painted first, so subsequent
    // siblings like <main> and BottomNav naturally paint on top of it at
    // the same "auto" stacking level). A negative z-index would instead
    // sink it below the wrapping div's own opaque background and hide it
    // completely, since that div isn't itself position:relative and so
    // doesn't create a stacking context this layer could sit above within.
    <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <div className="app-bg-grid absolute inset-0" />
      <div className="app-bg-orb app-bg-orb-1" />
      <div className="app-bg-orb app-bg-orb-2" />
      <div className="app-bg-orb app-bg-orb-3" />
    </div>
  );
}
