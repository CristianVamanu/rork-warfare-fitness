/**
 * Native barcode scanning for the iOS/Android apps.
 *
 * The web scanner (ZXing on a <video>) works in browsers and the PWA, but in
 * the Android app's web view it could not lock focus on a product barcode.
 * Inside the app we use Google's ML Kit code scanner instead: a system
 * full-screen scanner with autofocus and auto-zoom, no camera UI of our own.
 * On Android it lives in a Play Services module that may need a one-time
 * download on older phones; we trigger that and wait.
 *
 * Returns the decoded product code, or null when the user cancelled or the
 * scanner is unavailable (the caller then falls back to the web scanner).
 */
import { isNativeApp, nativePlatform } from '@/lib/native/health';

type Mod = typeof import('@capacitor-mlkit/barcode-scanning');
let cached: { M: Mod } | null = null;
// Wrapped in a plain object: the plugin is a Capacitor proxy, and resolving a
// promise to it directly makes JS probe `.then`, which becomes a native call.
async function load(): Promise<{ M: Mod }> {
  if (!cached) cached = { M: await import('@capacitor-mlkit/barcode-scanning') };
  return cached;
}

export async function nativeScanSupported(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try { const { M } = await load(); return (await M.BarcodeScanner.isSupported()).supported; } catch { return false; }
}

/** Makes sure the Android scanner module is installed; resolves when usable. */
async function ensureAndroidModule(M: Mod, onProgress?: (pct: number) => void): Promise<boolean> {
  if (nativePlatform() !== 'android') return true;
  const { available } = await M.BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
  if (available) return true;
  return new Promise<boolean>((resolve) => {
    let done = false;
    const finish = (ok: boolean) => { if (!done) { done = true; resolve(ok); } };
    const S = M.GoogleBarcodeScannerModuleInstallState;
    M.BarcodeScanner.addListener('googleBarcodeScannerModuleInstallProgress', (e) => {
      if (typeof e.progress === 'number') onProgress?.(e.progress);
      if (e.state === S.COMPLETED) finish(true);
      if (e.state === S.FAILED || e.state === S.CANCELED) finish(false);
    }).catch(() => finish(false));
    M.BarcodeScanner.installGoogleBarcodeScannerModule().catch(() => finish(false));
    // Belt and braces: a slow network should not hang the page forever.
    setTimeout(async () => {
      try { finish((await M.BarcodeScanner.isGoogleBarcodeScannerModuleAvailable()).available); } catch { finish(false); }
    }, 60_000);
  });
}

export async function nativeScanBarcode(onProgress?: (pct: number) => void): Promise<string | null> {
  if (!isNativeApp()) return null;
  const { M } = await load();
  const { BarcodeScanner, BarcodeFormat } = M;
  if (!(await BarcodeScanner.isSupported()).supported) return null;
  if (!(await ensureAndroidModule(M, onProgress))) return null;
  try {
    const { barcodes } = await BarcodeScanner.scan({
      formats: [BarcodeFormat.Ean13, BarcodeFormat.Ean8, BarcodeFormat.UpcA, BarcodeFormat.UpcE, BarcodeFormat.Code128, BarcodeFormat.Code39],
      autoZoom: true,
    });
    const code = barcodes[0]?.rawValue || barcodes[0]?.displayValue || '';
    return code.trim() || null;
  } catch {
    // User closed the scanner, or it failed to open.
    return null;
  }
}
