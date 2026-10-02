// マイアクティビティの一覧。ログイン中だけ使える。
// クエリ: address（複数可。無ければログイン中のアドレス）、kind（複数可）、party（対象者、複数可）、
//         include_transfers=1（0 での売買も含める）、include_self_mints=1（手動ミントも含める）、
//         from / to（ISO 日時）、before_date / before_hash（続き）、limit（1 ページの件数。1〜50、既定は 50）
import { NextRequest } from 'next/server';
import { errorJson, getSessionSecret, json, readSession } from '@/lib/auth/session';
import { ACTIVITY_PAGE_SIZE, fetchActivity, parseActivityFilter, parseCursor } from '@/lib/activity/server';
import type { ActivityPage } from '@/lib/activity/types';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = getSessionSecret();
  if (!secret) return errorJson('not_configured', 503);
  const session = await readSession(req, secret);
  if (!session) return errorJson('not_signed_in', 401);

  const params = req.nextUrl.searchParams;
  const filter = parseActivityFilter(params, session.sub);
  if (!filter) return errorJson('bad_filter', 400);

  const requested = Number(params.get('limit'));
  const limit =
    Number.isInteger(requested) && requested >= 1 && requested <= ACTIVITY_PAGE_SIZE ? requested : ACTIVITY_PAGE_SIZE;
  const items = await fetchActivity(filter, parseCursor(params), limit);
  if (!items) return errorJson('fetch_failed', 502);

  const last = items[items.length - 1];
  const page: ActivityPage = {
    items,
    next: items.length === limit && last ? { before_date: last.tx_date, before_hash: last.tx_hash } : null,
  };
  return json(page);
}
