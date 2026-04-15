import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const SYNC_COOKIE_NAME = 'sync_token';
export const SYNC_COOKIE_PATH = '/';
export const SYNC_SESSION_DAYS = 90;
export const SYNC_CHALLENGE_TTL_MS = 5 * 60 * 1000;

export type SyncSession = {
  address: string;
  expiresAt: string;
  tokenHash: string;
};

// ----- Web Crypto helpers (edge-runtime compatible) -----

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function bytesToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(digest);
}

async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return bytesToHex(sig);
}

// ----- Token + cookie helpers -----

export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function hashToken(token: string): Promise<string> {
  return sha256Hex(token);
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

  const tokenHash = await hashToken(token);
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
export async function createSyncChallenge(): Promise<string> {
  const secret = getNonceSecret();
  const expiresAt = Date.now() + SYNC_CHALLENGE_TTL_MS;
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  let random = '';
  for (let i = 0; i < randomBytes.length; i++) {
    random += randomBytes[i].toString(16).padStart(2, '0');
  }
  const data = `${expiresAt}:${random}`;
  const sig = await hmacSha256Hex(secret, data);
  return `${data}.${sig}`;
}

/**
 * Verify a challenge string previously issued by createSyncChallenge.
 * Returns true iff the HMAC matches and the encoded expiry is in the future.
 */
export async function verifySyncChallenge(challenge: string): Promise<boolean> {
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

  const expected = await hmacSha256Hex(secret, data);
  if (!constantTimeEqualHex(sig, expected)) return false;

  const [expiresAtStr] = data.split(':');
  const expiresAtMs = parseInt(expiresAtStr, 10);
  if (Number.isNaN(expiresAtMs)) return false;
  if (Date.now() > expiresAtMs) return false;

  return true;
}
