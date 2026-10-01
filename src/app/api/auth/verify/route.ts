// Xaman。on_login の uuid の署名結果を、サーバーの資格情報で Xaman から引いて確かめる。
import { NextRequest } from 'next/server';
import {
  clearLoginCookie,
  errorJson,
  getSessionSecret,
  guardPost,
  json,
  readPendingLogin,
  setSessionCookie,
} from '@/lib/auth/session';
import { getPayload, isXamanConfigured, issuedUserToken } from '@/lib/auth/xaman';
import { recordLogin } from '@/lib/auth/supabase-admin';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const secret = getSessionSecret();
  if (!secret || !isXamanConfigured()) return errorJson('not_configured', 503);
  const denied = guardPost(req, { requireJson: false });
  if (denied) return denied;

  // uuid はブラウザから受け取らず、署名付き Cookie にあるものだけを見る
  const pending = await readPendingLogin(req, secret, 'xaman');
  if (!pending) return errorJson('no_pending_login', 401);

  const detail = await getPayload(pending.v);
  if (!detail || !detail.meta?.exists) return errorJson('unknown_payload', 404);

  const { meta } = detail;
  if (meta.expired || meta.cancelled || (meta.resolved && !meta.signed)) {
    const res = errorJson('declined', 409);
    clearLoginCookie(req, res);
    return res;
  }
  if (!meta.signed) return errorJson('pending', 202);

  const account = detail.response?.account;
  if (!account) return errorJson('no_account', 502);

  // 保存に失敗したらログインさせない（通知が届かないことに誰も気づけなくなる）
  const issued = issuedUserToken(detail);
  if (!(await recordLogin(account, issued?.token ?? null, issued?.expiresAt ?? null))) {
    return errorJson('save_failed', 502);
  }

  const res = json({ account, push: !!issued });
  clearLoginCookie(req, res);
  await setSessionCookie(req, res, secret, account, 'xaman');
  return res;
}
