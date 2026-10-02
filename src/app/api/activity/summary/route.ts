// マイアクティビティの集計（通貨ごとの受取など）。ログイン中だけ使える。絞り込みは一覧と同じクエリ。
import { NextRequest } from 'next/server';
import { errorJson, getSessionSecret, json, readSession } from '@/lib/auth/session';
import { fetchActivitySummary, parseActivityFilter } from '@/lib/activity/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = getSessionSecret();
  if (!secret) return errorJson('not_configured', 503);
  const session = await readSession(req, secret);
  if (!session) return errorJson('not_signed_in', 401);

  const filter = parseActivityFilter(req.nextUrl.searchParams, session.sub);
  if (!filter) return errorJson('bad_filter', 400);

  const summary = await fetchActivitySummary(filter);
  if (!summary) return errorJson('fetch_failed', 502);
  return json(summary);
}
