import { NextRequest, NextResponse } from 'next/server';
import { XummSdk } from 'xumm-sdk';

export const runtime = 'nodejs';

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
    const sdk = new XummSdk(apiKey, apiSecret);
    const payload = await sdk.payload.create({
      txjson: { TransactionType: 'SignIn' },
      options: returnUrl
        ? {
            return_url: {
              web: returnUrl,
              app: returnUrl,
            },
          }
        : undefined,
    });

    if (!payload) {
      return NextResponse.json({ error: 'Failed to create payload' }, { status: 500 });
    }

    return NextResponse.json({
      uuid: payload.uuid,
      qr: payload.refs.qr_png,
      next: payload.next.always,
      websocket: payload.refs.websocket_status,
    });
  } catch (err) {
    console.error('Xaman challenge error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
