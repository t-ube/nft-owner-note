// Xaman・PC 用。SignIn ペイロードを作る（戻り先なし）。
import { NextRequest } from 'next/server';
import {
  createLoginCookieValue,
  errorJson,
  getSessionSecret,
  guardPost,
  json,
  normalizeLang,
  setLoginCookie,
} from '@/lib/auth/session';
import { createSignInPayload, isXamanConfigured } from '@/lib/auth/xaman';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const secret = getSessionSecret();
  if (!secret || !isXamanConfigured()) return errorJson('not_configured', 503);
  const denied = guardPost(req, { requireJson: false });
  if (denied) return denied;

  const lang = normalizeLang(req.nextUrl.searchParams.get('lang'));
  const payload = await createSignInPayload(lang, null);
  if (!payload) return errorJson('payload_failed', 502);

  const res = json({
    uuid: payload.uuid,
    link: payload.next.always,
    qr: payload.refs.qr_png,
    ws: payload.refs.websocket_status,
  });
  setLoginCookie(req, res, await createLoginCookieValue(secret, { k: 'xaman', v: payload.uuid }));
  return res;
}
