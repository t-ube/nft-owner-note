import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/syncSession';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'edge';

type SettingsRow = {
  address: string;
  data_provision_enabled: boolean;
  updated_at: number;
};

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('user_settings')
    .select('data_provision_enabled')
    .eq('address', session.address)
    .maybeSingle();

  if (error) {
    console.error('[settings/get] error', { error: error.message });
    return NextResponse.json({ error: 'db error' }, { status: 500 });
  }

  return NextResponse.json({
    dataProvisionEnabled: data?.data_provision_enabled ?? false,
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { dataProvisionEnabled?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (typeof body.dataProvisionEnabled !== 'boolean') {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const row: SettingsRow = {
    address: session.address,
    data_provision_enabled: body.dataProvisionEnabled,
    updated_at: Date.now(),
  };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('user_settings')
    .upsert(row, { onConflict: 'address' });

  if (error) {
    console.error('[settings/post] error', { error: error.message });
    return NextResponse.json({ error: 'db error' }, { status: 500 });
  }

  return NextResponse.json({ dataProvisionEnabled: row.data_provision_enabled });
}
