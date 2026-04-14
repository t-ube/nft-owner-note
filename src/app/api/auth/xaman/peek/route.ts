// Test-only endpoint for the Xaman determinism check.
// Fetches a Xumm payload by uuid and returns the raw signing material
// (`response.hex`, `response.signmethod`, `response.account`) without
// creating a sync session. This is used by /test/xaman-determinism to
// verify whether Xaman SignIn signatures over the same canonical payload
// are byte-identical across sessions.
//
// IMPORTANT: this endpoint never persists the hex anywhere — it is read
// once from Xumm and returned to the caller. It exists purely to let the
// developer empirically verify the backup-encryption design assumption.

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const apiKey = process.env.XAMAN_SERVER_API_KEY;
  const apiSecret = process.env.XAMAN_SERVER_API_SECRET;
  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      { error: 'Xaman server credentials are not configured' },
      { status: 500 }
    );
  }

  const uuid = req.nextUrl.searchParams.get('uuid');
  if (!uuid) {
    return NextResponse.json({ error: 'uuid is required' }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://xumm.app/api/v1/platform/payload/${encodeURIComponent(uuid)}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-API-Key': apiKey,
          'X-API-Secret': apiSecret,
        },
      }
    );

    if (res.status === 404) {
      return NextResponse.json({ error: 'Payload not found' }, { status: 404 });
    }
    if (!res.ok) {
      const text = await res.text();
      console.error('Xaman peek failed:', res.status, text);
      return NextResponse.json({ error: 'Failed to fetch payload' }, { status: 500 });
    }

    const payload = (await res.json()) as {
      meta?: { signed?: boolean; resolved?: boolean; expired?: boolean; cancelled?: boolean };
      response?: {
        account?: string;
        hex?: string;
        txid?: string;
        signmethod?: string;
      };
      payload?: {
        request_json?: unknown;
        signmethod?: string;
      };
    };

    return NextResponse.json({
      meta: payload.meta ?? null,
      response: payload.response ?? null,
      requestJson: payload.payload?.request_json ?? null,
    });
  } catch (err) {
    console.error('Xaman peek error:', err);
    return NextResponse.json(
      {
        error: 'Internal server error',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
