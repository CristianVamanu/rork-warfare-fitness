// "Remember this device" storage — a random secret paired with a server-
// issued deviceId, kept only in this browser's localStorage. The server
// holds a hash of the same secret at trustedDevices/{uid}/devices/{deviceId}
// with its own expiry, so a stolen/copied localStorage value alone isn't
// enough without also matching a still-valid server record — and either
// side clearing its copy independently revokes trust.
interface TrustedDevice {
  deviceId: string;
  token: string;
}

function storageKey(uid: string): string {
  return `2fa_trusted_${uid}`;
}

export function getTrustedDevice(uid: string): TrustedDevice | null {
  try {
    const raw = window.localStorage.getItem(storageKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TrustedDevice;
    if (!parsed?.deviceId || !parsed?.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setTrustedDevice(uid: string, device: TrustedDevice): void {
  try {
    window.localStorage.setItem(storageKey(uid), JSON.stringify(device));
  } catch {
    // Non-fatal — worst case the user is asked for a code again next time.
  }
}

export function clearTrustedDevice(uid: string): void {
  try {
    window.localStorage.removeItem(storageKey(uid));
  } catch {
    // ignore
  }
}
