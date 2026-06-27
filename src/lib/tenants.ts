/**
 * Tenant management — each trainer is a tenant owner.
 * trainerId == the admin user's Firebase Auth uid.
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Tenant, TenantStripe } from '@/types';

export async function createTenant(
  trainerId: string,
  name: string,
  email: string
): Promise<void> {
  await setDoc(doc(db, 'tenants', trainerId), {
    trainerId,
    name,
    email,
    createdAt: serverTimestamp(),
    stripe: { subscriptionStatus: 'inactive' },
  });
}

export async function getTenant(trainerId: string): Promise<Tenant | null> {
  const snap = await getDoc(doc(db, 'tenants', trainerId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Tenant) : null;
}

export async function updateTenantStripe(
  trainerId: string,
  stripe: Partial<TenantStripe>
): Promise<void> {
  await updateDoc(doc(db, 'tenants', trainerId), {
    stripe,
    lastUpdated: serverTimestamp(),
  });
}

/**
 * Checks whether the admin panel should be accessible.
 * Access is granted if no Stripe subscription exists (inactive = free trial)
 * or the subscription is active/trialing.
 * Cancels and past-due subscriptions block access.
 */
export function tenantHasAdminAccess(tenant: Tenant | null): boolean {
  if (!tenant) return true; // no tenant doc yet → allow (setup phase)
  const status = tenant.stripe?.subscriptionStatus ?? 'inactive';
  return status === 'active' || status === 'trialing' || status === 'inactive';
}
