/**
 * Sends the home-screen widget its numbers (Android, WarfareWidgetPlugin in
 * the app shell). Called by the dashboard; a no-op on the web, and caught on
 * app builds from before the widget existed.
 */
import { registerPlugin } from '@capacitor/core';
import { isNativeApp, nativePlatform } from '@/lib/native/health';

interface WidgetPlugin { update(o: { streak: number; title: string; subtitle: string }): Promise<void> }
let plugin: { P: WidgetPlugin } | null = null;
let last = '';

export function updateWidget(data: { streak: number; title: string; subtitle: string }) {
  if (!isNativeApp() || nativePlatform() !== 'android') return;
  const key = JSON.stringify(data);
  if (key === last) return;
  last = key;
  // Plain-object wrapper: never hand the Capacitor proxy to a promise.
  if (!plugin) plugin = { P: registerPlugin<WidgetPlugin>('WarfareWidget') };
  plugin.P.update(data).catch(() => { /* older app build without the widget */ });
}
