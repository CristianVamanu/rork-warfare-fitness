'use client';
export const dynamic = 'force-dynamic';

import { useRouter } from 'next/navigation';
import { Ban } from 'lucide-react';
import { signOut } from '@/lib/auth';
import { Button } from '@/components/ui/Button';

export default function BannedPage() {
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut().catch(() => {});
    router.replace('/login');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-danger/10 flex items-center justify-center mb-5">
        <Ban className="w-8 h-8 text-danger" />
      </div>
      <h1 className="text-2xl font-black text-white mb-2">Account Suspended</h1>
      <p className="text-text-secondary text-sm max-w-xs mb-8">
        Your account has been suspended. Please contact your coach or trainer for more information.
      </p>
      <Button variant="danger" onClick={handleSignOut}>Sign Out</Button>
    </div>
  );
}
