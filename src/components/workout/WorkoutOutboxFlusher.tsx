'use client';

/**
 * Uploads workouts that were finished offline (lib/workoutOutbox) when the
 * app opens with a connection and whenever the phone comes back online,
 * and shows a small banner while any are waiting.
 */
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CloudOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { flushWorkouts, pendingWorkouts } from '@/lib/workoutOutbox';

export function WorkoutOutboxFlusher() {
  const { user, refreshProfile } = useAuth();
  const [waiting, setWaiting] = useState(0);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    const count = () => setWaiting(pendingWorkouts(uid).length);
    const flush = async () => {
      count();
      if (!pendingWorkouts(uid).length) return;
      const n = await flushWorkouts(uid);
      count();
      if (n > 0) {
        toast.success(n === 1 ? 'Your offline workout is saved' : `${n} offline workouts saved`);
        refreshProfile().catch(() => {});
      }
    };
    flush();
    window.addEventListener('online', flush);
    window.addEventListener('wf-outbox', count);
    const onVisible = () => { if (document.visibilityState === 'visible') flush(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', flush);
      window.removeEventListener('wf-outbox', count);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user, refreshProfile]);

  if (!waiting) return null;
  return (
    <div className="mx-4 mt-2 rounded-xl px-3 py-2 flex items-center gap-2 text-xs font-semibold bg-accent-muted text-accent" role="status">
      <CloudOff className="w-4 h-4 flex-shrink-0" />
      {waiting === 1 ? '1 workout saved on this phone. It uploads when you are back online.' : `${waiting} workouts saved on this phone. They upload when you are back online.`}
    </div>
  );
}
