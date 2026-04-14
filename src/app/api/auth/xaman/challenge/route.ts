import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  const apiKey = process.env.XAMAN_SERVER_API_KEY;
  const apiSecret = process.env.XAMAN_SERVER_API_SECRET;
  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      { error: 'Xaman server credentials are not configured' },
      { status: 500 }
    );
  }

  let returnUrl: string | undefined;
  try {
    const body = await req.json();
    if (typeof body?.returnUrl === 'string') {
      returnUrl = body.returnUrl;
    }
  } catch {
    // body is optional
  }

  try {
    const createBody: Record<string, unknown> = {
      txjson: { TransactionType: 'SignIn' },
    };
    if (returnUrl) {
      createBody.options = {
        return_url: {
          web: returnUrl,
          app: returnUrl,
        },
      };
    }

    const res = await fetch('https://xumm.app/api/v1/platform/payload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-API-Key': apiKey,
        'X-API-Secret': apiSecret,
      },
      body: JSON.stringify(createBody),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('Xaman payload create failed:', res.status, text);
      return NextResponse.json(
        {
          error: 'Failed to create payload',
          status: res.status,
          detail: text,
        },
        { status: 500 }
      );
    }

    const payload = (await res.json()) as {
      uuid?: string;
      next?: { always?: string };
      refs?: { qr_png?: string; websocket_status?: string };
    };
    if (!payload?.uuid) {
      return NextResponse.json({ error: 'Failed to create payload' }, { status: 500 });
    }

    return NextResponse.json({
      uuid: payload.uuid,
      qr: payload.refs?.qr_png,
      next: payload.next?.always,
      websocket: payload.refs?.websocket_status,
    });
  } catch (err) {
    console.error('Xaman challenge error:', err);
    return NextResponse.json(
      {
        error: 'Internal server error',
        detail: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
      { status: 500 }
    );
  }
}
