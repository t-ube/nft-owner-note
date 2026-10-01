// Joey。署名済みのチャレンジ tx を確かめる。お題は on_login にあるものしか見ない。
import { NextRequest } from 'next/server';
import {
  clearLoginCookie,
  errorJson,
  getSessionSecret,
  guardPost,
  json,
  readJsonBody,
  readPendingLogin,
  setSessionCookie,
} from '@/lib/auth/session';
import { verifyChallengeTx } from '@/lib/auth/joey';
import { recordLogin } from '@/lib/auth/supabase-admin';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const secret = getSessionSecret();
  if (!secret) return errorJson('not_configured', 503);
  const denied = guardPost(req);
  if (denied) return denied;

  const pending = await readPendingLogin(req, secret, 'joey');
  if (!pending || !pending.a) return errorJson('no_pending_login', 401);

  const body = await readJsonBody<{ tx_json?: unknown }>(req);
  const failure = verifyChallengeTx(body?.tx_json, {
    address: pending.a,
    host: new URL(req.url).host,
    challenge: pending.v,
  });
  if (failure) return errorJson(failure, 400);

  const account = pending.a;
  // Joey には user_token が無いので、ログインの記録だけを残す
  if (!(await recordLogin(account, null, null))) return errorJson('save_failed', 502);

  const res = json({ account });
  clearLoginCookie(req, res);
  await setSessionCookie(req, res, secret, account, 'joey');
  return res;
}
