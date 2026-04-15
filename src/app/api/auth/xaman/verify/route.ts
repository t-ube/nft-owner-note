import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  attachSessionCookie,
  computeExpiresAt,
  generateToken,
  hashToken,
} from '@/lib/auth/syncSession';

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

  let body: { uuid?: unknown; deviceLabel?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const uuid = typeof body.uuid === 'string' ? body.uuid : null;
  const deviceLabel = typeof body.deviceLabel === 'string' ? body.deviceLabel : null;
  if (!uuid) {
    return NextResponse.json({ error: 'uuid is required' }, { status: 400 });
  }

  type Stage =
    | 'fetch_payload'
    | 'parse_payload'
    | 'validate_payload'
    | 'generate_token'
    | 'insert_session'
    | 'attach_cookie';
  let stage: Stage = 'fetch_payload';

  try {
    stage = 'fetch_payload';
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
      return NextResponse.json(
        { error: 'Payload not found', stage },
        { status: 404 }
      );
    }
    if (!res.ok) {
      const text = await res.text();
      console.error('[xaman/verify] fetch_payload failed:', res.status, text);
      return NextResponse.json(
        { error: 'Failed to fetch payload', stage, detail: text, status: res.status },
        { status: 502 }
      );
    }

    stage = 'parse_payload';
    const payload = (await res.json()) as {
      meta?: { signed?: boolean };
      response?: { account?: string };
    };

    stage = 'validate_payload';
    if (!payload?.meta) {
      return NextResponse.json(
        { error: 'Payload not found', stage },
        { status: 404 }
      );
    }
    if (!payload.meta.signed) {
      return NextResponse.json(
        { error: 'Payload was not signed', stage },
        { status: 400 }
      );
    }
    const address = payload.response?.account;
    if (!address) {
      return NextResponse.json(
        { error: 'No account in payload response', stage },
        { status: 400 }
      );
    }

    stage = 'generate_token';
    const token = generateToken();
    const tokenHash = await hashToken(token);
    const expiresAt = computeExpiresAt();

    stage = 'insert_session';
    const supabase = createAdminClient();
    const { error: insertError } = await supabase.from('sync_sessions').insert({
      token_hash: tokenHash,
      address,
      device_label: deviceLabel,
      expires_at: expiresAt.toISOString(),
      last_seen_at: new Date().toISOString(),
    });

    if (insertError) {
      console.error('[xaman/verify] insert_session failed:', insertError);
      return NextResponse.json(
        {
          error: 'Failed to create session',
          stage,
          detail: insertError.message,
          code: insertError.code,
          hint: insertError.hint,
        },
        { status: 500 }
      );
    }

    stage = 'attach_cookie';
    const response = NextResponse.json({
      address,
      expiresAt: expiresAt.toISOString(),
    });
    attachSessionCookie(response, token, expiresAt);
    return response;
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
    // Single-line log so Cloudflare Workers log viewer does not truncate the Error object.
    console.error(
      `[xaman/verify] ${stage} threw: ${name}: ${message}` +
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
