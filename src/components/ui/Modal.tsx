'use client';

import { useEffect, useId, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // Where focus was before the modal opened, so closing puts it back —
  // otherwise a keyboard or screen-reader user is dropped at the top of
  // the document every time a dialog closes.
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // This component is the ONLY dialog primitive in the app, and until now it
  // had no dialog semantics at all: no role, no Escape, focus left wherever
  // it was underneath, and Tab walked straight out of the panel into the
  // page behind the overlay. Fixing it here fixes every modal in the app.
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    // Move focus in on the next frame — the panel is animating in and its
    // children mount with it.
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus();
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((n) => n.offsetParent !== null);
      if (nodes.length === 0) { e.preventDefault(); return; }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panelRef.current)) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown);
      restoreFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ backgroundColor: 'var(--overlay)' }}
            className="fixed inset-0 backdrop-blur-sm z-50"
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            style={{ boxShadow: 'var(--shadow-modal)' }}
            className={cn(
              'fixed inset-x-4 top-[5vh] z-50 max-w-lg mx-auto bg-surface-elevated border border-border rounded-2xl flex flex-col outline-none',
              'max-h-[90vh]',
              className
            )}
          >
            <div className="flex items-center justify-between p-5 border-b border-border flex-shrink-0">
              {title && <h2 id={titleId} className="text-lg font-bold text-foreground">{title}</h2>}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="ml-auto p-1.5 rounded-lg text-text-secondary hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
