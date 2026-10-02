// マイアクティビティの月別の表示で、まとまりの中の行。ログイン中だけ使える。絞り込みは一覧と同じクエリ。
// クエリ: by（artwork / buyer）、key（/api/activity/groups が返した key）
import { NextRequest } from 'next/server';
import { errorJson, getSessionSecret, json, readSession } from '@/lib/auth/session';
import { fetchActivityGroupItems, parseActivityFilter } from '@/lib/activity/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = getSessionSecret();
  if (!secret) return errorJson('not_configured', 503);
  const session = await readSession(req, secret);
  if (!session) return errorJson('not_signed_in', 401);

  const params = req.nextUrl.searchParams;
  const by = params.get('by') === 'buyer' ? 'buyer' : 'artwork';
  const key = params.get('key');
  if (!key || key.length > 2048) return errorJson('bad_key', 400);
  const filter = parseActivityFilter(params, session.sub);
  if (!filter) return errorJson('bad_filter', 400);

  const items = await fetchActivityGroupItems(filter, by, key);
  if (!items) return errorJson('fetch_failed', 502);
  return json(items);
}
