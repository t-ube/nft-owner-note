import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSession } from '@/lib/auth/syncSession';

export const runtime = 'edge';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ADDRESS_COLUMN: Record<string, string> = {
  address_groups: 'address',
  addresses: 'owner_address',
  projects: 'address',
  project_owner_values: 'address',
};

type PullBody = {
  table: keyof typeof ADDRESS_COLUMN;
  since: number;
};

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: PullBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const { table, since } = body;
  const addressColumn = ADDRESS_COLUMN[table];
  if (!addressColumn) {
    return NextResponse.json({ error: 'invalid table' }, { status: 400 });
  }
  if (typeof since !== 'number' || !Number.isFinite(since) || since < 0) {
    return NextResponse.json({ error: 'invalid since' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq(addressColumn, session.address)
    .gt('updated_at', since)
    .order('updated_at', { ascending: true });

  if (error) {
    console.error('[sync/pull] error', { table, error: error.message });
    return NextResponse.json({ error: 'db error' }, { status: 500 });
  }

  return NextResponse.json({
    rows: data ?? [],
    serverTime: Date.now(),
  });
}
