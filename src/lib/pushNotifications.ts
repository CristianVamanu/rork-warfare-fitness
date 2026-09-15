/**
 * Web Push subscription helpers.
 * VAPID public key is stored in Firestore system/config so the client can
 * subscribe without hard-coding keys. VAPID private key lives only in env vars.
 */

import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

// A subscription lives at pushSubscriptions/{userId}/devices/{deviceId},
// not a single doc per userId — subscribing on a second device (e.g. phone
// after already enabling it on desktop) used to silently overwrite the
// first device's subscription there, since both wrote to the exact same
// doc. Keying by a stable id derived from the subscription's own endpoint
// (unique per browser/device registration) lets every device coexist, and
// the send route now delivers to all of a user's registered devices.
function deviceIdFromEndpoint(endpoint: string): string {
  return encodeURIComponent(endpoint).slice(0, 500);
}

export async function subscribeToPush(userId: string, vapidPublicKey: string): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;

  try {
    const reg = await navigator.serviceWorker.ready;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

    // Store subscription in Firestore so the server can send messages
    await setDoc(doc(db, 'pushSubscriptions', userId, 'devices', deviceIdFromEndpoint(sub.endpoint)), {
      userId,
      subscription: JSON.parse(JSON.stringify(sub)),
      updatedAt: serverTimestamp(),
    });

    return true;
  } catch (err) {
    console.error('[Push] subscribe failed:', err);
    return false;
  }
}

export async function unsubscribeFromPush(userId: string): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      // Only this device's registration — leaves any other device's
      // subscription (e.g. a phone, if unsubscribing from desktop) intact.
      await deleteDoc(doc(db, 'pushSubscriptions', userId, 'devices', deviceIdFromEndpoint(endpoint)));
    }
  } catch (err) {
    console.error('[Push] unsubscribe failed:', err);
  }
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}
