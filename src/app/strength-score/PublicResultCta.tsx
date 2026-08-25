'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

// Shared CTA block for the public result and challenge pages — the anonymous
// visitor must be able to immediately run their own test with zero login.
export function PublicResultCta() {
  return (
    <Card className="p-5 text-center space-y-3">
      <p className="text-lg font-black text-white">THINK YOU CAN BEAT THEM?</p>
      <Link href="/strength-score">
        <Button fullWidth size="lg">
          ENTER YOUR LIFTS <ArrowRight className="w-4 h-4" />
        </Button>
      </Link>
    </Card>
  );
}
