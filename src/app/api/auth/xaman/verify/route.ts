import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  attachSessionCookie,
  computeExpiresAt,
  generateToken,
  hashToken,
} from '@/lib/auth/syncSession';

export const runtime = 'edge';

type JwtClaims = {
  sub?: string;
  aud?: string;
  exp?: number;
  app_uuidv4?: string;
};

function decodeJwtPayload(jwt: string): JwtClaims | null {
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  try {
    let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    b64 += '='.repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(b64)) as JwtClaims;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  let body: { jwt?: unknown; deviceLabel?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const jwt = typeof body.jwt === 'string' ? body.jwt : null;
  const deviceLabel = typeof body.deviceLabel === 'string' ? body.deviceLabel : null;
  if (!jwt) {
    return NextResponse.json({ error: 'jwt is required' }, { status: 400 });
  }

  type Stage =
    | 'parse_jwt'
    | 'validate_claims'
    | 'verify_with_xumm'
    | 'insert_session'
    | 'attach_cookie';
  let stage: Stage = 'parse_jwt';

  try {
    stage = 'parse_jwt';
    const claims = decodeJwtPayload(jwt);
    if (!claims) {
      return NextResponse.json(
        { error: 'Invalid JWT format', stage },
        { status: 400 }
      );
    }

    stage = 'validate_claims';
    const expectedAppId = process.env.NEXT_PUBLIC_XAMAN_API_KEY;
    if (expectedAppId && claims.app_uuidv4 && claims.app_uuidv4 !== expectedAppId) {
      return NextResponse.json(
        { error: 'JWT is for a different app', stage },
        { status: 403 }
      );
    }
    if (claims.exp && Date.now() / 1000 > claims.exp) {
      return NextResponse.json(
        { error: 'JWT expired', stage },
        { status: 401 }
      );
    }
    const address = claims.sub;
    if (!address) {
      return NextResponse.json(
        { error: 'JWT has no sub', stage },
        { status: 400 }
      );
    }

    stage = 'verify_with_xumm';
    const pingRes = await fetch('https://xumm.app/api/v1/jwt/ping', {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
    });
    if (!pingRes.ok) {
      const text = await pingRes.text();
      console.error(
        `[xaman/verify] ping rejected: ${pingRes.status} ${text}`
      );
      return NextResponse.json(
        { error: 'JWT rejected by Xumm', stage, status: pingRes.status },
        { status: 401 }
      );
    }

    stage = 'insert_session';
    const token = generateToken();
    const tokenHash = await hashToken(token);
    const expiresAt = computeExpiresAt();

    const { error: insertError } = await supabaseAdmin.from('sync_sessions').insert({
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
