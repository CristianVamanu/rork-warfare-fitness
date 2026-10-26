'use client';

import { Toaster, ToastBar, toast } from 'react-hot-toast';
import { X } from 'lucide-react';

/**
 * App-wide toast host.
 *
 * Previously a bare <Toaster>, which renders toasts that cannot be dismissed
 * — no close control, and tapping them does nothing. An error toast set to
 * 8 seconds therefore sat on screen for the full 8 seconds no matter what
 * the user did, which reads as a stuck message rather than a notification.
 * Reported on the AI scan failure, where the error is the longest-lived
 * toast in the app.
 *
 * Every toast is now tap-to-dismiss, and anything that isn't a transient
 * loading spinner also gets a real close button so the affordance is
 * visible rather than something you have to guess at.
 */
export function AppToaster() {
  return (
    <Toaster
      position="top-center"
      toastOptions={{
        style: {
          background: 'var(--surface-elevated)',
          color: 'var(--foreground)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '12px',
          fontSize: '14px',
        },
        success: { iconTheme: { primary: '#10B981', secondary: 'var(--surface-elevated)' } },
        error: { iconTheme: { primary: '#EF4444', secondary: 'var(--surface-elevated)' } },
      }}
    >
      {(t) => (
        <ToastBar toast={t}>
          {({ icon, message }) => (
            <div
              className="flex items-start gap-1 cursor-pointer"
              onClick={() => toast.dismiss(t.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toast.dismiss(t.id); }}
            >
              {icon}
              <div className="flex-1 min-w-0">{message}</div>
              {t.type !== 'loading' && (
                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={(e) => { e.stopPropagation(); toast.dismiss(t.id); }}
                  className="ml-1 -mr-1 mt-0.5 p-1 rounded-md text-text-tertiary hover:text-foreground transition-colors flex-shrink-0"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          )}
        </ToastBar>
      )}
    </Toaster>
  );
}
