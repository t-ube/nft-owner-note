// Xaman からの通知で user_token を更新する。本文は信じず、uuid を手がかりに Xaman から引き直す。
// Xaman に再送させないよう、常に 200 を返す。
import { NextRequest } from 'next/server';
import { json, readJsonBody } from '@/lib/auth/session';
import { getPayload, isXamanConfigured, issuedUserToken } from '@/lib/auth/xaman';
import { touchToken } from '@/lib/auth/supabase-admin';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!isXamanConfigured()) return json({ ok: true });

  const body = await readJsonBody<{ meta?: { payload_uuidv4?: unknown } }>(req);
  const uuid = body?.meta?.payload_uuidv4;
  if (typeof uuid !== 'string') return json({ ok: true });

  const detail = await getPayload(uuid);
  const account = detail?.response?.account;
  const issued = detail ? issuedUserToken(detail) : null;
  if (detail?.meta?.signed && account && issued) {
    await touchToken(account, issued.token, issued.expiresAt);
  }
  return json({ ok: true });
}
