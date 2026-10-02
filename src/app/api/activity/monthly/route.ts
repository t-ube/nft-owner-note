// マイアクティビティの月別集計（チャート用）。ログイン中だけ使える。絞り込みは一覧と同じクエリ。
// クエリ: tz（月を区切るタイムゾーン。IANA 名）
import { NextRequest } from 'next/server';
import { errorJson, getSessionSecret, json, readSession } from '@/lib/auth/session';
import { fetchActivityMonthly, isTimeZone, parseActivityFilter } from '@/lib/activity/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = getSessionSecret();
  if (!secret) return errorJson('not_configured', 503);
  const session = await readSession(req, secret);
  if (!session) return errorJson('not_signed_in', 401);

  const params = req.nextUrl.searchParams;
  const tz = params.get('tz');
  const filter = parseActivityFilter(params, session.sub);
  if (!filter) return errorJson('bad_filter', 400);

  const months = await fetchActivityMonthly(filter, isTimeZone(tz) ? tz : 'UTC');
  if (!months) return errorJson('fetch_failed', 502);
  return json(months);
}
