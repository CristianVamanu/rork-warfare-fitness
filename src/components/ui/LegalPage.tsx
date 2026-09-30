'use client';

import Link from 'next/link';
import { ChevronLeft, FileText } from 'lucide-react';
import { CornerBrackets, SectionEyebrow } from '@/components/landing/chrome';
import { TechBackdrop } from '@/components/ui/TechField';
import { LegalContent } from '@/components/ui/LegalContent';
import { OperatorLine } from '@/components/ui/OperatorLine';

/**
 * The shell every legal page sits in: the same grid-and-bloom backdrop,
 * eyebrow, bracketed panel and readout labels as the rest of the app, so
 * Terms and Privacy stop looking like a pasted Word document.
 */
export function LegalPage({
  eyebrow,
  title,
  text,
  backHref,
  backLabel,
  operator = true,
}: {
  eyebrow: string;
  title: string;
  text: string;
  backHref: string;
  backLabel: string;
  operator?: boolean;
}) {
  const sections = text.split(/\n\s*\n/).filter((b) => b.startsWith('## ')).length;
  return (
    <div className="relative min-h-screen bg-background overflow-hidden">
      <TechBackdrop className="opacity-40" />
      <div className="relative px-4 py-10 sm:py-14 max-w-2xl mx-auto">
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-white transition-colors mb-8">
          <ChevronLeft className="w-4 h-4" /> {backLabel}
        </Link>

        <div className="mb-6">
          <SectionEyebrow>{eyebrow}</SectionEyebrow>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white mt-2">{title}</h1>
          <div className="flex items-center gap-3 mt-3">
            <span className="wf-readout text-[10px] font-semibold text-text-tertiary">{sections} sections</span>
            <span className="flex-1 h-px bg-gradient-to-r from-accent/30 to-transparent" />
            <span className="wf-readout text-[10px] font-semibold text-text-tertiary">Rev {new Date().getFullYear()}</span>
          </div>
        </div>

        <div
          className="group relative rounded-2xl border backdrop-blur-sm px-5 py-6 sm:px-8 sm:py-8"
          style={{ background: 'var(--card-glass-bg)', borderColor: 'var(--card-glass-border)' }}
        >
          <CornerBrackets />
          <div className="flex items-center gap-2 mb-6 text-text-tertiary">
            <FileText className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span className="wf-readout text-[10px] font-semibold">Plain English · Binding</span>
          </div>
          <LegalContent text={text} />
        </div>

        <div className="mt-6 space-y-1 px-1">
          {operator && <OperatorLine />}
          <p className="wf-readout text-[10px] text-text-tertiary">Last updated {new Date().getFullYear()}</p>
        </div>
      </div>
    </div>
  );
}
