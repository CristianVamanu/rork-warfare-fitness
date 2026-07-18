import { getSecret } from '@/lib/secrets';
import type { Firestore } from 'firebase-admin/firestore';

/**
 * WHOOP OAuth2 + data API — https://developer.whoop.com
 * A user connects their WHOOP account once (Settings -> Connect WHOOP);
 * we store their encrypted access/refresh tokens server-side and pull
 * recovery/sleep/strain data on demand or via a periodic sync.
 */

const AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const API_BASE = 'https://api.prod.whoop.com/developer/v2';

const SCOPES = ['read:recovery', 'read:cycles', 'read:sleep', 'read:workout', 'read:profile', 'offline'].join(' ');

/** Admin-panel "WHOOP Wearable Sync" toggle — defaults on until explicitly turned off. */
export async function isWhoopEnabled(db: Firestore): Promise<boolean> {
  const snap = await db.collection('system').doc('config').get();
  return snap.data()?.whoopEnabled !== false;
}

export interface WhoopTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // ms epoch
}

export async function buildAuthorizeUrl(redirectUri: string, state: string): Promise<string | null> {
  const clientId = await getSecret('WHOOP_CLIENT_ID');
  if (!clientId) return null;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES,
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function tokenRequest(body: Record<string, string>): Promise<WhoopTokens> {
  const clientId = await getSecret('WHOOP_CLIENT_ID');
  const clientSecret = await getSecret('WHOOP_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('WHOOP is not configured');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...body, client_id: clientId, client_secret: clientSecret }).toString(),
  });
  if (!res.ok) throw new Error(`WHOOP token request failed: ${res.status} ${await res.text().catch(() => '')}`);
  const json = await res.json();
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + (Number(json.expires_in ?? 3600) * 1000),
  };
}

export function exchangeCodeForTokens(code: string, redirectUri: string): Promise<WhoopTokens> {
  return tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
}

export function refreshTokens(refreshToken: string): Promise<WhoopTokens> {
  return tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
}

async function whoopGet(accessToken: string, path: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`WHOOP API ${path} failed: ${res.status}`);
  return res.json();
}

export interface WhoopSummary {
  recoveryScore?: number;
  hrvMs?: number;
  restingHeartRate?: number;
  sleepPerformancePercent?: number;
  respiratoryRate?: number;
  dayStrain?: number;
  syncedAt: string;
}

/** Pulls the single most recent recovery + sleep + cycle record. Best-effort per field. */
export async function fetchLatestSummary(accessToken: string): Promise<WhoopSummary> {
  const summary: WhoopSummary = { syncedAt: new Date().toISOString() };

  try {
    const recovery = await whoopGet(accessToken, '/recovery?limit=1');
    const rec = recovery?.records?.[0]?.score;
    if (rec) {
      summary.recoveryScore = rec.recovery_score;
      summary.hrvMs = rec.hrv_rmssd_milli;
      summary.restingHeartRate = rec.resting_heart_rate;
    }
  } catch (err) {
    console.warn('[whoop] recovery fetch failed:', err);
  }

  try {
    const sleep = await whoopGet(accessToken, '/activity/sleep?limit=1');
    const sleepScore = sleep?.records?.[0]?.score;
    if (sleepScore) {
      summary.sleepPerformancePercent = sleepScore.sleep_performance_percentage;
      summary.respiratoryRate = sleepScore.respiratory_rate;
    }
  } catch (err) {
    console.warn('[whoop] sleep fetch failed:', err);
  }

  try {
    const cycle = await whoopGet(accessToken, '/cycle?limit=1');
    const cycleScore = cycle?.records?.[0]?.score;
    if (cycleScore) summary.dayStrain = cycleScore.strain;
  } catch (err) {
    console.warn('[whoop] cycle fetch failed:', err);
  }

  return summary;
}
