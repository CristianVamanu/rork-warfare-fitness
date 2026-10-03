export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import AuthActionClient from './AuthActionClient';

/**
 * Firebase Auth's email action handler, on our own domain.
 *
 * Point Firebase at this in Console → Authentication → Templates → (each
 * template) → Customise action URL:
 *
 *     https://warfarefitness.com/auth/action
 *
 * Firebase appends `mode`, `oobCode`, `continueUrl` and `lang` itself.
 *
 * Suspense is required, not decorative: useSearchParams() opts a client
 * component into client-side rendering, and Next refuses to build the route
 * without a boundary around it.
 */
export default function AuthActionPage() {
  return (
    <Suspense fallback={null}>
      <AuthActionClient />
    </Suspense>
  );
}
