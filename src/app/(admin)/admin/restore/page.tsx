'use client';
export const dynamic = 'force-dynamic';

/**
 * The restore screen also lives as a tab inside /admin. This route stays so
 * the direct URL keeps working — RESTORE.md points at it, and during an
 * incident a bookmark that goes straight to the thing is worth more than a
 * tidy route table.
 */

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { RestorePanel } from '@/components/admin/RestorePanel';

export default function RestorePage() {
  return (
    <div className="px-4 py-5 max-w-2xl mx-auto space-y-4">
      <Link href="/admin?tab=restore" className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-white">
        <ChevronLeft className="w-3.5 h-3.5" /> Admin
      </Link>
      <RestorePanel />
    </div>
  );
}
