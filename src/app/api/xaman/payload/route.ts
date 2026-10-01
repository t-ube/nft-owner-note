// 取引の署名用ペイロードを、サーバーの資格情報で作る。仕様は doc/login.md「取引の署名（Xaman）」。
import { NextRequest } from 'next/server';
import type { XummTypes } from 'xumm-sdk';
import { errorJson, getSessionSecret, guardPost, isLocalhost, json, readJsonBody, readSession, siteOrigin } from '@/lib/auth/session';
import { createPayload, isXamanConfigured, XAMAN_NETWORK } from '@/lib/auth/xaman';
import { liveXamanToken } from '@/lib/auth/supabase-admin';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

/**
 * 署名させてよい TransactionType。アプリが実際に署名させる種類だけを入れる。
 * 現時点では signAndSubmit の呼び出し元が無いため空。使うときに足す。
 */
const ALLOWED_TX_TYPES = new Set<string>([]);

// "/" で始まり "//" や "/\" で始まらない、自サイトのパスとクエリだけを受け付ける
function isSitePath(p: string): boolean {
  return /^\/(?![/\\])[^\s#]*$/.test(p);
}

export async function POST(req: NextRequest) {
  const secret = getSessionSecret();
  if (!secret || !isXamanConfigured()) return errorJson('not_configured', 503);
  const denied = guardPost(req);
  if (denied) return denied;

  const session = await readSession(req, secret);
  if (!session) return errorJson('not_signed_in', 401);
  if (session.wallet !== 'xaman') return errorJson('wrong_wallet', 403);

  const body = await readJsonBody<{ txjson?: unknown; return_path?: unknown }>(req);
  const txjson = body?.txjson;
  if (!txjson || typeof txjson !== 'object' || Array.isArray(txjson)) return errorJson('bad_tx', 400);
  const tx = { ...(txjson as Record<string, unknown>) };

  if (tx.Account === undefined) tx.Account = session.sub;
  if (tx.Account !== session.sub) return errorJson('account_mismatch', 403);
  if (typeof tx.TransactionType !== 'string' || !ALLOWED_TX_TYPES.has(tx.TransactionType)) {
    return errorJson('tx_not_allowed', 400);
  }

  let returnUrl: string | null = null;
  if (body?.return_path !== undefined) {
    if (typeof body.return_path !== 'string' || !isSitePath(body.return_path)) {
      return errorJson('bad_return_path', 400);
    }
    if (!isLocalhost(req)) returnUrl = `${siteOrigin(req)}${body.return_path}`;
  }

  const userToken = await liveXamanToken(session.sub);
  const payload = await createPayload({
    txjson: tx as XummTypes.XummJsonTransaction,
    options: {
      expire: 5,
      force_network: XAMAN_NETWORK,
      ...(returnUrl ? { return_url: { app: returnUrl, web: returnUrl } } : {}),
    },
    ...(userToken ? { user_token: userToken } : {}),
  });
  if (!payload) return errorJson('payload_failed', 502);

  return json({
    uuid: payload.uuid,
    next: payload.next,
    refs: { websocket_status: payload.refs.websocket_status, qr_png: payload.refs.qr_png },
    pushed: payload.pushed,
  });
}
