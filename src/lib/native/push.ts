/**
 * Push notifications inside the native iOS/Android apps.
 *
 * Browsers and the PWA use Web Push with our VAPID keys (pushNotifications.ts).
 * A native web view has no push service for that, so the apps register with
 * Firebase Cloud Messaging through @capacitor/push-notifications and store
 * the FCM token next to the web subscriptions, at
 * pushSubscriptions/{uid}/devices/{deviceId} with `fcmToken` instead of
 * `subscription`. pushSend.ts sends to whichever kind a device document has,
 * so every existing notification reaches the apps with no other change.
 */
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { isNativeApp, nativePlatform } from '@/lib/native/health';

type Mod = typeof import('@capacitor/push-notifications');
let cached: { M: Mod } | null = null;
// Plain-object wrapper: the plugin is a Capacitor proxy and must never be the
// value a promise resolves to (the `.then` probe becomes a native call).
async function load(): Promise<{ M: Mod }> {
  if (!cached) cached = { M: await import('@capacitor/push-notifications') };
  return cached;
}

const TOKEN_KEY = 'wf.nativePushToken';
const deviceId = () => `native-${nativePlatform()}`;

export async function nativePushEnabled(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const { M } = await load();
    const perm = await M.PushNotifications.checkPermissions();
    return perm.receive === 'granted' && !!localStorage.getItem(TOKEN_KEY);
  } catch { return false; }
}

/** Asks for permission, registers with FCM/APNs and stores the token. */
export async function nativePushEnable(userId: string): Promise<boolean> {
  if (!isNativeApp()) return false;
  const { M } = await load();
  const { PushNotifications } = M;
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') return false;

  const token = await new Promise<string | null>((resolve) => {
    let settled = false;
    const handles: { remove: () => Promise<void> }[] = [];
    // Resolve once and drop the listeners, so toggling repeatedly does not
    // stack registration callbacks.
    const done = (t: string | null) => {
      if (settled) return;
      settled = true;
      handles.forEach((h) => h.remove().catch(() => {}));
      resolve(t);
    };
    PushNotifications.addListener('registration', (t) => done(t.value)).then((h) => handles.push(h)).catch(() => done(null));
    PushNotifications.addListener('registrationError', () => done(null)).then((h) => handles.push(h)).catch(() => done(null));
    PushNotifications.register().catch(() => done(null));
    setTimeout(() => done(null), 15_000);
  });
  if (!token) return false;

  await setDoc(doc(db, 'pushSubscriptions', userId, 'devices', deviceId()), {
    userId,
    fcmToken: token,
    platform: nativePlatform(),
    updatedAt: serverTimestamp(),
  });
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* private mode */ }
  return true;
}

export async function nativePushDisable(userId: string): Promise<void> {
  if (!isNativeApp()) return;
  try { const { M } = await load(); await M.PushNotifications.unregister(); } catch { /* noop */ }
  await deleteDoc(doc(db, 'pushSubscriptions', userId, 'devices', deviceId())).catch(() => {});
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* noop */ }
}

/**
 * Routes a tapped notification to its URL and surfaces one received while the
 * app is open. Call once per app session; returns a cleanup function.
 */
export function nativePushListen(onOpenUrl: (url: string) => void, onForeground?: (title: string, body: string) => void): () => void {
  if (!isNativeApp()) return () => {};
  let cancelled = false;
  const handles: { remove: () => Promise<void> }[] = [];
  load().then(async ({ M }) => {
    if (cancelled) return;
    handles.push(await M.PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
      const url = (a.notification.data as Record<string, string> | undefined)?.url;
      if (url) onOpenUrl(url);
    }));
    handles.push(await M.PushNotifications.addListener('pushNotificationReceived', (n) => {
      onForeground?.(n.title || 'Warfare Fitness', n.body || '');
    }));
  }).catch(() => {});
  return () => { cancelled = true; handles.forEach((h) => h.remove().catch(() => {})); };
}
