// 今のログイン状態。残りが少なければセッションを発行し直す。
import { NextRequest } from 'next/server';
import { getSessionSecret, json, readSession, setSessionCookie, shouldRenewSession } from '@/lib/auth/session';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = getSessionSecret();
  const session = secret ? await readSession(req, secret) : null;
  if (!secret || !session) return json({ account: null, wallet: null, expiresAt: null });

  if (shouldRenewSession(session)) {
    const res = json({
      account: session.sub,
      wallet: session.wallet,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await setSessionCookie(req, res, secret, session.sub, session.wallet);
    return res;
  }
  return json({
    account: session.sub,
    wallet: session.wallet,
    expiresAt: new Date(session.exp * 1000).toISOString(),
  });
}
