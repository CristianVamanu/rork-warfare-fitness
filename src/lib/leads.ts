/** Shared shape for the admin email list — see /api/admin/leads. */
export type LeadSource = 'landing' | 'standards' | 'free-plan' | 'onboarding';

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  landing: 'Landing page',
  standards: 'Standards test',
  'free-plan': 'Free plan',
  onboarding: 'Quiz, no account',
};

export interface LeadRow {
  id: string;
  email: string;
  source: LeadSource;
  marketingOptIn: boolean;
  /** Free-plan leads only: the program being dripped and whether it still is. */
  programName: string;
  dripActive: boolean;
  createdAt: string; // ISO
}
