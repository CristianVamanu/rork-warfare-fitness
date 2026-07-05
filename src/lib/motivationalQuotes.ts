export const FASTING_QUOTES = [
  'Discipline is choosing between what you want now and what you want most.',
  'Your body can do it. It\'s your mind you need to convince.',
  'Every hour fasted is a rep for your willpower.',
  'Hunger is a wave — ride it, don\'t fight it.',
  'The body achieves what the mind believes.',
  'Comfort is the enemy of progress.',
  'You\'re not starving. You\'re healing.',
  'Strong people don\'t give up when hunger says quit.',
];

export const HABIT_QUOTES = [
  'Every day clean is a day you chose yourself.',
  'Progress, not perfection.',
  'You didn\'t come this far to only come this far.',
  'Discipline is the bridge between goals and results.',
  'One day at a time is still a streak.',
  'The pain of discipline weighs ounces. The pain of regret weighs tons.',
  'Small wins compound into a new identity.',
  'You\'re stronger than the urge.',
];

export function pickQuote(quotes: string[]): string {
  return quotes[Math.floor(Math.random() * quotes.length)];
}
