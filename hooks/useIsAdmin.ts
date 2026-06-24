import { useApp } from '@/contexts/AppContext';

/**
 * Returns true if the current user has the Firebase custom claim { admin: true }.
 * Claim is set via: npx ts-node scripts/set-admin.ts <email>
 * Single source of truth — no Firestore field, no env var.
 */
export function useIsAdmin(): boolean {
  const { user } = useApp();
  return user?.isAdmin === true;
}
