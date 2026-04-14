import { NextResponse } from 'next/server';
import { createSyncChallenge } from '@/lib/auth/syncSession';
import { REST_ENDPOINT } from '@/utils/xrpl';

export const runtime = 'nodejs';

async function fetchCurrentLedger(): Promise<number | null> {
  try {
    const res = await fetch(REST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'ledger_current',
        params: [{}],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const idx = data?.result?.ledger_current_index;
    return typeof idx === 'number' ? idx : null;
  } catch {
    return null;
  }
}

export async function POST() {
  try {
    const challenge = createSyncChallenge();
    const currentLedger = await fetchCurrentLedger();
    const lastLedgerSequence =
      typeof currentLedger === 'number' ? currentLedger + 2 : null;

    return NextResponse.json({ challenge, lastLedgerSequence });
  } catch (err) {
    console.error('Joey challenge error:', err);
    return NextResponse.json(
      {
        error: 'Failed to create challenge',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
