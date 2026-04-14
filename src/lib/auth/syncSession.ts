import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const SYNC_COOKIE_NAME = 'sync_token';
export const SYNC_COOKIE_PATH = '/';
export const SYNC_SESSION_DAYS = 90;

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
