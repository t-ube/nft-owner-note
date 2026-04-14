import { NextResponse } from 'next/server';
import {
  clearSessionCookie,
  getSession,
  revokeSessionByHash,
} from '@/lib/auth/syncSession';

export const runtime = 'nodejs';

export async function POST() {
  const session = await getSession();
  if (session) {
    await revokeSessionByHash(session.tokenHash);
  }
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
