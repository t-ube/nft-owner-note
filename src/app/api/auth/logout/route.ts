// 両方の Cookie を消す。user_token は Xaman アプリに紐づくので消さない。
import { NextRequest } from 'next/server';
import { clearLoginCookie, clearSessionCookie, guardPost, json } from '@/lib/auth/session';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const denied = guardPost(req, { requireJson: false });
  if (denied) return denied;

  const res = json({ ok: true });
  clearLoginCookie(req, res);
  clearSessionCookie(req, res);
  return res;
}
