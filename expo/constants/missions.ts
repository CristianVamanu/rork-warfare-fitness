export interface Mission {
  id: string;
  title: string;
  description: string;
  briefing: string;
  duration: string;
  difficulty: 'Recruit' | 'Warrior' | 'Elite';
  category: string;
  imageUrl: string;
  objectives: string[];
  completed: boolean;
  progress: number;
}

export const MISSIONS: Mission[] = [
  {
    id: '1',
    title: 'The War Path',
    description: 'Tactical full-body conditioning',
    briefing: 'Soldier, this is not a workout. This is warfare against weakness. Every rep is a battle. Every set is a mission. Complete 30 days of tactical conditioning and emerge as a warrior.',
    duration: '30 Days',
    difficulty: 'Warrior',
    category: 'Full Body',
    imageUrl: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800&q=80',
    objectives: [
      'Complete 30 consecutive days',
      'Push-ups: 100 daily',
      'Pull-ups: 50 daily',
      'Run: 5km daily',
      'Cold shower: 3 minutes',
    ],
    completed: false,
    progress: 0,
  },
  {
    id: '2',
    title: 'Anxiety Killer (90 Days)',
    description: 'Crush anxiety, build resilience',
    briefing: 'Anxiety is the enemy. For 90 days, you will wage war on fear. Through discipline, cold exposure, and relentless action, you will forge an unbreakable mind.',
    duration: '90 Days',
    difficulty: 'Elite',
    category: 'Mental Strength',
    imageUrl: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800&q=80',
    objectives: [
      'Daily meditation: 10 minutes',
      'Cold exposure: 5 minutes',
      'Journal: morning & evening',
      'Physical training: 60 minutes',
      'Zero excuses policy',
    ],
    completed: false,
    progress: 0,
  },
  {
    id: '3',
    title: 'Alpha Bulk',
    description: 'Advanced hypertrophy & bulking',
    briefing: 'Mission objective: Build maximum muscle mass. This is a 12-week hypertrophy protocol designed for warriors ready to dominate the iron.',
    duration: '12 Weeks',
    difficulty: 'Elite',
    category: 'Strength',
    imageUrl: 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=800&q=80',
    objectives: [
      'Train 6 days per week',
      'Progressive overload every session',
      'Protein: 1g per lb bodyweight',
      'Sleep: 8+ hours',
      'Track all lifts',
    ],
    completed: false,
    progress: 0,
  },
  {
    id: '4',
    title: 'Burn Ops',
    description: 'Fat loss + conditioning',
    briefing: 'This is a search and destroy mission against body fat. High-intensity tactical training combined with metabolic conditioning. No mercy.',
    duration: '8 Weeks',
    difficulty: 'Warrior',
    category: 'Fat Loss',
    imageUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80',
    objectives: [
      'HIIT training: 4x weekly',
      'Caloric deficit: 500 cal',
      'Steps: 10,000 daily',
      'Fasted cardio: 3x weekly',
      'Zero cheat days',
    ],
    completed: false,
    progress: 0,
  },
  {
    id: '5',
    title: 'Calisthenics Warfare',
    description: 'Bodyweight mastery',
    briefing: 'No equipment. No excuses. Master your bodyweight and become a weapon. This is primal strength training.',
    duration: '6 Weeks',
    difficulty: 'Recruit',
    category: 'Bodyweight',
    imageUrl: 'https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?w=800&q=80',
    objectives: [
      'Master basic movements',
      'Progress to advanced variations',
      'Train anywhere, anytime',
      'Build functional strength',
      'Achieve muscle-up',
    ],
    completed: false,
    progress: 0,
  },
  {
    id: '6',
    title: 'Future Warriors',
    description: 'Teen resilience & discipline',
    briefing: 'Cadets, attention! This program is designed to build the next generation of warriors. Discipline, strength, and mental fortitude start here.',
    duration: '12 Weeks',
    difficulty: 'Recruit',
    category: 'Youth',
    imageUrl: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&q=80',
    objectives: [
      'Build healthy habits',
      'Develop discipline',
      'Physical fitness foundation',
      'Mental resilience training',
      'Leadership skills',
    ],
    completed: false,
    progress: 0,
  },
];
