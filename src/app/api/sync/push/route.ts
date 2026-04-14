import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/syncSession';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'edge';

type RemoteTable = 'address_groups' | 'addresses' | 'projects' | 'project_owner_values';

const TABLE_CONFIG: Record<RemoteTable, { addressColumn: string; conflict: string }> = {
  address_groups: { addressColumn: 'address', conflict: 'address,id' },
  addresses: { addressColumn: 'owner_address', conflict: 'owner_address,address' },
  projects: { addressColumn: 'address', conflict: 'address,id' },
  project_owner_values: { addressColumn: 'address', conflict: 'address,id' },
};

const MAX_ROWS_PER_REQUEST = 500;

type PushBody = {
  table: RemoteTable;
  rows: Record<string, unknown>[];
};

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: PushBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const config = TABLE_CONFIG[body.table];
  if (!config) {
    return NextResponse.json({ error: 'invalid table' }, { status: 400 });
  }
  if (!Array.isArray(body.rows)) {
    return NextResponse.json({ error: 'invalid rows' }, { status: 400 });
  }
  if (body.rows.length === 0) {
    return NextResponse.json({ upserted: 0 });
  }
  if (body.rows.length > MAX_ROWS_PER_REQUEST) {
    return NextResponse.json({ error: 'too many rows' }, { status: 413 });
  }

  // Force the address column to the session address so a caller cannot
  // write rows owned by a different XRPL account.
  const rows = body.rows.map(row => ({
    ...row,
    [config.addressColumn]: session.address,
  }));

  const supabase = createAdminClient();
  const { error } = await supabase
    .from(body.table)
    .upsert(rows, { onConflict: config.conflict });

  if (error) {
    console.error('[sync/push] error', { table: body.table, error: error.message });
    return NextResponse.json({ error: 'db error' }, { status: 500 });
  }

  return NextResponse.json({ upserted: rows.length });
}
