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

  type Stage = 'create_payload' | 'parse_payload' | 'validate_payload';
  let stage: Stage = 'create_payload';

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

    stage = 'create_payload';
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
      console.error('[xaman/challenge] create_payload failed:', res.status, text);
      return NextResponse.json(
        { error: 'Failed to create payload', stage, detail: text, status: res.status },
        { status: 502 }
      );
    }

    stage = 'parse_payload';
    const payload = (await res.json()) as {
      uuid?: string;
      next?: { always?: string };
      refs?: { qr_png?: string; websocket_status?: string };
    };

    stage = 'validate_payload';
    if (!payload?.uuid) {
      return NextResponse.json(
        { error: 'Failed to create payload', stage, detail: 'missing uuid' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      uuid: payload.uuid,
      qr: payload.refs?.qr_png,
      next: payload.next?.always,
      websocket: payload.refs?.websocket_status,
    });
  } catch (err) {
    const e = err as {
      name?: string;
      message?: string;
      cause?: unknown;
      stack?: string;
    } | null;
    const name = e?.name ?? 'UnknownError';
    const message = e?.message ?? String(err);
    const causeStr =
      e?.cause instanceof Error
        ? `${e.cause.name}: ${e.cause.message}`
        : e?.cause !== undefined
          ? String(e.cause)
          : '';
    const stackFirst = e?.stack?.split('\n').slice(0, 3).join(' | ') ?? '';
    console.error(
      `[xaman/challenge] ${stage} threw: ${name}: ${message}` +
        (causeStr ? ` | cause=${causeStr}` : '') +
        (stackFirst ? ` | stack=${stackFirst}` : '')
    );
    return NextResponse.json(
      {
        error: 'Internal server error',
        stage,
        name,
        detail: message,
        cause: causeStr || undefined,
        stack: stackFirst || undefined,
      },
      { status: 500 }
    );
  }
}
