'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, Play, Clock, Target, Dumbbell, CheckCircle } from 'lucide-react';
import { getProgram } from '@/lib/firestore';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import type { Program } from '@/types';

const MOCK_EXERCISES = [
  { id: 'e1', name: 'Barbell Back Squat', sets: 4, reps: '5', restSeconds: 180, muscleGroup: 'Legs' },
  { id: 'e2', name: 'Romanian Deadlift', sets: 3, reps: '8', restSeconds: 120, muscleGroup: 'Hamstrings' },
  { id: 'e3', name: 'Leg Press', sets: 3, reps: '10', restSeconds: 90, muscleGroup: 'Quads' },
  { id: 'e4', name: 'Leg Curl', sets: 3, reps: '12', restSeconds: 60, muscleGroup: 'Hamstrings' },
];

export default function ProgramDetailPage() {
  const { programId } = useParams();
  const router = useRouter();
  const [program, setProgram] = useState<Program | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!programId) return;
    getProgram(programId as string)
      .then((p) => setProgram(p as Program))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [programId]);

  if (loading) {
    return (
      <div className="px-4 py-4 space-y-4">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  const displayProgram = program || {
    id: programId as string,
    name: 'Powerlifting Foundations',
    description: 'Build serious strength with the big 3 movements. Focuses on progressive overload.',
    level: 'intermediate' as const,
    goal: 'strength' as const,
    weeks: 8,
    daysPerWeek: 4,
    exercises: MOCK_EXERCISES,
    createdBy: 'system',
    isPublic: true,
  };

  return (
    <div>
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-white/8">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => router.back()} className="p-2 rounded-xl text-text-secondary hover:text-white hover:bg-white/5">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-bold text-white flex-1 truncate">{displayProgram.name}</h1>
        </div>
      </div>

      <div className="px-4 py-4 space-y-5">
        {/* Hero Card */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-5 relative overflow-hidden">
            <div className="absolute right-4 bottom-4 opacity-5">
              <Dumbbell className="w-24 h-24" />
            </div>
            <div className="flex gap-2 mb-3">
              <Badge variant="accent">{displayProgram.goal}</Badge>
              <Badge variant="muted">{displayProgram.level}</Badge>
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">{displayProgram.name}</h2>
            <p className="text-text-secondary text-sm mt-2 leading-relaxed">{displayProgram.description}</p>

            <div className="grid grid-cols-3 gap-3 mt-4">
              {[
                { icon: Clock, label: 'Duration', value: `${displayProgram.weeks} weeks` },
                { icon: Target, label: 'Frequency', value: `${displayProgram.daysPerWeek}x/week` },
                { icon: Dumbbell, label: 'Level', value: displayProgram.level },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="text-center p-3 bg-surface-elevated rounded-xl">
                  <Icon className="w-4 h-4 text-accent mx-auto mb-1" />
                  <p className="text-[10px] text-text-secondary">{label}</p>
                  <p className="text-xs font-bold text-white capitalize">{value}</p>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>

        {/* Week Overview */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <h2 className="text-base font-bold text-white mb-3">Week 1 Preview</h2>
          <div className="space-y-2">
            {MOCK_EXERCISES.map((ex, i) => (
              <Card key={ex.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-accent-muted flex items-center justify-center text-accent text-xs font-bold">
                    {i + 1}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{ex.name}</p>
                    <p className="text-xs text-text-secondary">{ex.sets} sets × {ex.reps} reps · {ex.restSeconds}s rest</p>
                  </div>
                </div>
                <Badge variant="muted">{ex.muscleGroup}</Badge>
              </Card>
            ))}
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Button fullWidth size="lg" onClick={() => router.push('/training/session')}>
            <Play className="w-5 h-5" /> Start Program
          </Button>
          <p className="text-center text-xs text-text-tertiary mt-2">
            This will become your active program
          </p>
        </motion.div>
      </div>
    </div>
  );
}
