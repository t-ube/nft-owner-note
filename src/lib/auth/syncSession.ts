import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const SYNC_COOKIE_NAME = 'sync_token';
export const SYNC_COOKIE_PATH = '/';
export const SYNC_SESSION_DAYS = 90;
export const SYNC_CHALLENGE_TTL_MS = 5 * 60 * 1000;

export type SyncSession = {
  address: string;
  expiresAt: string;
  tokenHash: string;
};

export function generateToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function computeExpiresAt(days = SYNC_SESSION_DAYS): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export function attachSessionCookie(response: NextResponse, token: string, expiresAt: Date) {
  response.cookies.set(SYNC_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: SYNC_COOKIE_PATH,
    expires: expiresAt,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SYNC_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: SYNC_COOKIE_PATH,
    maxAge: 0,
  });
}

export async function getSession(): Promise<SyncSession | null> {
  const token = cookies().get(SYNC_COOKIE_NAME)?.value;
  if (!token) {
    console.log('[syncSession] no cookie present');
    return null;
  }

  const tokenHash = hashToken(token);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('sync_sessions')
    .select('address, expires_at, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error) {
    console.log('[syncSession] lookup error:', error.message);
    return null;
  }
  if (!data) {
    console.log('[syncSession] no row for token_hash', tokenHash.slice(0, 8));
    return null;
  }
  if (data.revoked_at) {
    console.log('[syncSession] row is revoked');
    return null;
  }
  if (new Date(data.expires_at).getTime() < Date.now()) {
    console.log('[syncSession] row is expired');
    return null;
  }

  // Best-effort last_seen_at update; failure is non-fatal.
  void supabase
    .from('sync_sessions')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('token_hash', tokenHash);

  return {
    address: data.address,
    expiresAt: data.expires_at,
    tokenHash,
  };
}

export async function revokeSessionByHash(tokenHash: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from('sync_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token_hash', tokenHash);
}

// ----- HMAC challenge helpers (used by Joey sync sign-in) -----

function getNonceSecret(): string {
  const secret = process.env.SYNC_NONCE_SECRET;
  if (!secret) {
    throw new Error('SYNC_NONCE_SECRET is not configured');
  }
  return secret;
}

/**
 * Build a stateless, time-limited challenge string of the form
 *   "<expiresAtMs>:<random>.<hmacHex>"
 * The data part can be re-derived and HMAC-verified by the server, so no
 * server-side storage is needed. TTL is enforced via the encoded expiry.
 */
export function createSyncChallenge(): string {
  const secret = getNonceSecret();
  const expiresAt = Date.now() + SYNC_CHALLENGE_TTL_MS;
  const random = crypto.randomBytes(16).toString('hex');
  const data = `${expiresAt}:${random}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('hex');
  return `${data}.${sig}`;
}

/**
 * Verify a challenge string previously issued by createSyncChallenge.
 * Returns true iff the HMAC matches and the encoded expiry is in the future.
 */
export function verifySyncChallenge(challenge: string): boolean {
  if (typeof challenge !== 'string') return false;
  const idx = challenge.lastIndexOf('.');
  if (idx <= 0) return false;

  const data = challenge.slice(0, idx);
  const sig = challenge.slice(idx + 1);

  let secret: string;
  try {
    secret = getNonceSecret();
  } catch {
    return false;
  }

  const expected = crypto.createHmac('sha256', secret).update(data).digest('hex');

  let sigBuf: Buffer;
  let expectedBuf: Buffer;
  try {
    sigBuf = Buffer.from(sig, 'hex');
    expectedBuf = Buffer.from(expected, 'hex');
  } catch {
    return false;
  }
  if (sigBuf.length !== expectedBuf.length) return false;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return false;

  const [expiresAtStr] = data.split(':');
  const expiresAtMs = parseInt(expiresAtStr, 10);
  if (Number.isNaN(expiresAtMs)) return false;
  if (Date.now() > expiresAtMs) return false;

  return true;
}
