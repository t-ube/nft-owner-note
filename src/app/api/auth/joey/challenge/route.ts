// Joey。署名してもらうチャレンジ tx を作り、チャレンジを on_login でこのブラウザに結び付ける。
import { NextRequest } from 'next/server';
// xrpl 本体は WebSocket クライアントごと読み込むので、edge では軽い codec だけを使う
import { isValidClassicAddress } from 'ripple-address-codec';
import {
  createLoginCookieValue,
  errorJson,
  getSessionSecret,
  guardPost,
  json,
  readJsonBody,
  setLoginCookie,
} from '@/lib/auth/session';
import { buildChallengeTx, newChallenge } from '@/lib/auth/joey';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const secret = getSessionSecret();
  if (!secret) return errorJson('not_configured', 503);
  const denied = guardPost(req);
  if (denied) return denied;

  const body = await readJsonBody<{ address?: unknown }>(req);
  const address = typeof body?.address === 'string' ? body.address : '';
  if (!isValidClassicAddress(address)) return errorJson('bad_address', 400);

  const challenge = newChallenge();
  const res = json({ tx_json: buildChallengeTx(address, new URL(req.url).host, challenge) });
  setLoginCookie(req, res, await createLoginCookieValue(secret, { k: 'joey', v: challenge, a: address }));
  return res;
}
