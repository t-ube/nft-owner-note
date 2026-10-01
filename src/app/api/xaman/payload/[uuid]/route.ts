// 取引の署名結果を確かめる。自分の Account のペイロードしか見せない。
import { NextRequest } from 'next/server';
import { errorJson, getSessionSecret, json, readSession } from '@/lib/auth/session';
import { getPayload, isXamanConfigured, issuedUserToken } from '@/lib/auth/xaman';
import { touchToken } from '@/lib/auth/supabase-admin';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { uuid: string } }) {
  const secret = getSessionSecret();
  if (!secret || !isXamanConfigured()) return errorJson('not_configured', 503);

  const session = await readSession(req, secret);
  if (!session) return errorJson('not_signed_in', 401);

  const detail = await getPayload(params.uuid);
  // 他人のペイロードは「見つからない」と同じ応答にして、有無を漏らさない
  if (!detail?.meta?.exists || detail.payload?.request_json?.Account !== session.sub) {
    return errorJson('unknown_payload', 404);
  }

  const { meta } = detail;
  if (meta.signed) {
    const issued = issuedUserToken(detail);
    if (issued) await touchToken(session.sub, issued.token, issued.expiresAt);
    return json({
      signed: true,
      txid: detail.response?.txid ?? null,
      dispatched_result: detail.response?.dispatched_result ?? null,
    });
  }
  if (meta.expired || meta.cancelled || meta.resolved) return json({ signed: false });
  return errorJson('pending', 202);
}
