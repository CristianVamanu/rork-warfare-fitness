'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Dumbbell, Filter, Play, Clock, Target, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { getPrograms } from '@/lib/firestore';
import { Header } from '@/components/layout/Header';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import type { Program } from '@/types';

const MOCK_PROGRAMS: Program[] = [
  {
    id: 'p1',
    name: 'Powerlifting Foundations',
    description: 'Build serious strength with the big 3 movements',
    level: 'intermediate',
    goal: 'strength',
    weeks: 8,
    daysPerWeek: 4,
    exercises: [],
    createdBy: 'system',
    isPublic: true,
  },
  {
    id: 'p2',
    name: 'Hypertrophy Program',
    description: 'Maximize muscle growth with high volume training',
    level: 'intermediate',
    goal: 'hypertrophy',
    weeks: 12,
    daysPerWeek: 5,
    exercises: [],
    createdBy: 'system',
    isPublic: true,
  },
  {
    id: 'p3',
    name: 'Beginner Full Body',
    description: 'Perfect starting point for new lifters',
    level: 'beginner',
    goal: 'general',
    weeks: 6,
    daysPerWeek: 3,
    exercises: [],
    createdBy: 'system',
    isPublic: true,
  },
  {
    id: 'p4',
    name: 'Fat Loss HIIT',
    description: 'High-intensity training for maximum fat burn',
    level: 'beginner',
    goal: 'weight-loss',
    weeks: 8,
    daysPerWeek: 4,
    exercises: [],
    createdBy: 'system',
    isPublic: true,
  },
];

const goalColors: Record<string, string> = {
  strength: 'accent',
  hypertrophy: 'info',
  endurance: 'success',
  'weight-loss': 'danger',
  general: 'muted',
};

const levelColors: Record<string, string> = {
  beginner: 'success',
  intermediate: 'accent',
  advanced: 'danger',
};

export default function TrainingPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    getPrograms()
      .then((p) => {
        setPrograms(p.length > 0 ? (p as Program[]) : MOCK_PROGRAMS);
      })
      .catch(() => setPrograms(MOCK_PROGRAMS))
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'all' ? programs : programs.filter((p) => p.goal === filter || p.level === filter);

  return (
    <div>
      <Header title="Training" />
      <div className="px-4 py-4 space-y-5">
        {/* Active Program Hero */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <h2 className="text-sm font-medium text-text-secondary mb-2">ACTIVE PROGRAM</h2>
          <Card className="p-5 relative overflow-hidden bg-gradient-to-br from-surface to-surface-elevated">
            <div className="absolute right-0 bottom-0 opacity-5">
              <Dumbbell className="w-32 h-32 text-accent" />
            </div>
            <Badge variant="accent" className="mb-3">Week 2 of 8</Badge>
            <h3 className="text-xl font-black text-white">Powerlifting Foundations</h3>
            <p className="text-text-secondary text-sm mt-1">4 days/week · Strength</p>
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-xs text-text-secondary">
                <span>Progress</span>
                <span>25%</span>
              </div>
              <div className="h-2 bg-white/8 rounded-full">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: '25%' }}
                  transition={{ duration: 0.7, delay: 0.3 }}
                  className="h-full bg-accent rounded-full"
                />
              </div>
            </div>
            <Link href={`/training/session?programId=${programs[0]?.id ?? 'p1'}`}>
              <Button className="mt-4" size="sm">
                <Play className="w-4 h-4" /> Start Today&apos;s Workout
              </Button>
            </Link>
          </Card>
        </motion.div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
          {['all', 'strength', 'hypertrophy', 'weight-loss', 'beginner', 'intermediate', 'advanced'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                filter === f
                  ? 'bg-accent text-black'
                  : 'bg-surface-elevated border border-white/10 text-text-secondary'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1).replace('-', ' ')}
            </button>
          ))}
        </div>

        {/* Programs Grid */}
        <div>
          <h2 className="text-base font-bold text-white mb-3">Browse Programs</h2>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((prog, i) => (
                <motion.div
                  key={prog.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link href={`/training/${prog.id}`}>
                    <Card className="p-4 hover:border-accent/30 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex gap-2 mb-2">
                            <Badge variant={(goalColors[prog.goal] || 'muted') as 'accent' | 'success' | 'danger' | 'info' | 'muted' | 'default'}>
                              {prog.goal}
                            </Badge>
                            <Badge variant={(levelColors[prog.level] || 'muted') as 'accent' | 'success' | 'danger' | 'info' | 'muted' | 'default'}>
                              {prog.level}
                            </Badge>
                          </div>
                          <h3 className="font-bold text-white">{prog.name}</h3>
                          <p className="text-xs text-text-secondary mt-1 line-clamp-2">{prog.description}</p>
                          <div className="flex items-center gap-4 mt-2">
                            <span className="flex items-center gap-1 text-xs text-text-tertiary">
                              <Clock className="w-3 h-3" />{prog.weeks}w
                            </span>
                            <span className="flex items-center gap-1 text-xs text-text-tertiary">
                              <Target className="w-3 h-3" />{prog.daysPerWeek}d/week
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-text-tertiary mt-1 flex-shrink-0" />
                      </div>
                    </Card>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
