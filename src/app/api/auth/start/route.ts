// Xaman・スマホ用。ペイロードを作って Xaman へ転送する（戻り先あり）。
// タップから Xaman までを1回のページ遷移にするため GET で受ける。
import { NextRequest, NextResponse } from 'next/server';
import {
  createLoginCookieValue,
  getSessionSecret,
  isLocalhost,
  normalizeLang,
  setLoginCookie,
  siteOrigin,
} from '@/lib/auth/session';
import { createSignInPayload, isXamanConfigured } from '@/lib/auth/xaman';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const lang = normalizeLang(req.nextUrl.searchParams.get('lang'));
  const origin = siteOrigin(req);
  const failed = () => {
    const res = NextResponse.redirect(`${origin}/${lang}?login=failed`, 302);
    res.headers.set('Cache-Control', 'no-store');
    return res;
  };

  const secret = getSessionSecret();
  if (!secret || !isXamanConfigured()) return failed();

  // スマホから見た localhost は自分自身になるので、戻り先を付けない
  const returnUrl = isLocalhost(req) ? null : `${origin}/${lang}?login=xaman`;
  const payload = await createSignInPayload(lang, returnUrl);
  if (!payload) return failed();

  const res = NextResponse.redirect(payload.next.always, 302);
  res.headers.set('Cache-Control', 'no-store');
  setLoginCookie(req, res, await createLoginCookieValue(secret, { k: 'xaman', v: payload.uuid }));
  return res;
}
