import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signUp, awaitSignupInFlight, isPendingSignup } from './auth';

/**
 * The signup ordering invariant, which a live outage turned out to depend on.
 *
 * New accounts could not get past onboarding: the Auth user was created and
 * the Firestore document was written, but AuthContext attached its profile
 * listener in between, against a connection whose token had not attached yet,
 * and both reads came back permission-denied.
 *
 * The guard that was supposed to prevent that was keyed by uid, and a uid does
 * not exist until createUserWithEmailAndPassword resolves — by which point
 * onAuthStateChanged has already fired. So the guard could not close the very
 * window it existed for.
 *
 * These tests pin the property that actually matters and cannot be read off
 * the types: the gate is closed BEFORE the account exists, and opens only
 * after the user document has been written.
 */

const { state } = vi.hoisted(() => ({
  state: {
    createResolve: null as null | ((v: unknown) => void),
    createReject: null as null | ((e: unknown) => void),
    docWritten: false,
    gateOpenAtWriteTime: null as null | boolean,
  },
}));

vi.mock('./firebase', () => ({ auth: {}, db: {} }));

vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: vi.fn(
    () => new Promise((resolve, reject) => {
      state.createResolve = resolve;
      state.createReject = reject;
    }),
  ),
  updateProfile: vi.fn(async () => {}),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  serverTimestamp: vi.fn(() => 'ts'),
  setDoc: vi.fn(async () => {
    state.docWritten = true;
    // Sampled at the moment of the write: the gate must still be closed here,
    // because this is precisely when AuthContext must not be listening yet.
    state.gateOpenAtWriteTime = await isOpen();
  }),
}));

vi.mock('./firestore', () => ({
  resolveTrainerId: vi.fn(async () => null),
  invalidateWorkoutsCache: vi.fn(),
  invalidateProgramsCache: vi.fn(),
  invalidateChannelsCache: vi.fn(),
}));

/** Has the gate opened yet? Resolves without waiting on it. */
function isOpen(): Promise<boolean> {
  return Promise.race([
    awaitSignupInFlight().then(() => true),
    new Promise<boolean>((r) => setTimeout(() => r(false), 0)),
  ]);
}

const fakeCredential = { user: { uid: 'u1', getIdToken: async () => 't' } };

beforeEach(() => {
  state.createResolve = null;
  state.createReject = null;
  state.docWritten = false;
  state.gateOpenAtWriteTime = null;
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));
});

describe('signup in-flight gate', () => {
  it('is open when no signup is running', async () => {
    expect(await isOpen()).toBe(true);
  });

  it('closes BEFORE the account exists — the window the uid-keyed flag could not cover', async () => {
    const signup = signUp('a@example.com', 'password123', 'A');

    // createUserWithEmailAndPassword has not resolved, so there is no uid yet
    // and isPendingSignup cannot know about this signup. The gate still must.
    expect(isPendingSignup('u1')).toBe(false);
    expect(await isOpen()).toBe(false);

    state.createResolve!(fakeCredential);
    await signup;
  });

  it('opens only after the user document has been written', async () => {
    const signup = signUp('b@example.com', 'password123', 'B');
    state.createResolve!(fakeCredential);
    await signup;

    expect(state.docWritten).toBe(true);
    // The write happened while the gate was still closed.
    expect(state.gateOpenAtWriteTime).toBe(false);
    expect(await isOpen()).toBe(true);
  });

  it('opens when account creation fails, so a later sign-in cannot hang', async () => {
    const signup = signUp('c@example.com', 'password123', 'C');
    expect(await isOpen()).toBe(false);

    state.createReject!(Object.assign(new Error('exists'), { code: 'auth/email-already-in-use' }));
    await expect(signup).rejects.toThrow('exists');

    // Left closed, the next authentication in this tab would wait forever on a
    // signup that never happened.
    expect(await isOpen()).toBe(true);
  });
});
