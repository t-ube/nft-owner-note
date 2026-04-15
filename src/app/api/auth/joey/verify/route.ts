import { NextRequest, NextResponse } from 'next/server';
import { verifySignature } from 'xrpl/dist/npm/Wallet/signer';
import { deriveAddress } from 'ripple-keypairs';
import { supabase } from '@/lib/supabase';
import {
  attachSessionCookie,
  computeExpiresAt,
  generateToken,
  hashToken,
} from '@/lib/auth/syncSession';

export const runtime = 'edge';

type IncomingTx = {
  Account?: string;
  SigningPubKey?: string;
  TxnSignature?: string;
  [key: string]: unknown;
};

export async function POST(req: NextRequest) {
  let body: { tx_json?: unknown; deviceLabel?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const txJson = body.tx_json as IncomingTx | undefined;
  const deviceLabel = typeof body.deviceLabel === 'string' ? body.deviceLabel : null;

  if (!txJson || typeof txJson !== 'object') {
    return NextResponse.json({ error: 'tx_json is required' }, { status: 400 });
  }
  if (typeof txJson.SigningPubKey !== 'string' || !txJson.SigningPubKey) {
    return NextResponse.json({ error: 'tx_json.SigningPubKey is missing' }, { status: 400 });
  }
  if (typeof txJson.TxnSignature !== 'string' || !txJson.TxnSignature) {
    return NextResponse.json({ error: 'tx_json.TxnSignature is missing' }, { status: 400 });
  }
  if (typeof txJson.Account !== 'string' || !txJson.Account) {
    return NextResponse.json({ error: 'tx_json.Account is missing' }, { status: 400 });
  }

  // 1. Cryptographically verify the signature against the embedded SigningPubKey.
  let signatureValid = false;
  try {
    // verifySignature accepts a Transaction object or a serialized blob.
    // We pass the object directly. The function uses SigningPubKey from the tx
    // when no public key is supplied.
    signatureValid = verifySignature(txJson as unknown as Parameters<typeof verifySignature>[0]);
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Signature verification threw',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 400 }
    );
  }
  if (!signatureValid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // 2. The address derived from the public key must match the tx Account
  //    (otherwise the signer signed with a different key than they claim).
  let derivedAddress: string;
  try {
    derivedAddress = deriveAddress(txJson.SigningPubKey);
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Failed to derive address from SigningPubKey',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 400 }
    );
  }
  if (derivedAddress !== txJson.Account) {
    return NextResponse.json(
      { error: 'Signing key does not match Account', expected: derivedAddress, got: txJson.Account },
      { status: 400 }
    );
  }

  // 3. All good — issue a session.
  const address = txJson.Account;
  const token = generateToken();
  const tokenHash = await hashToken(token);
  const expiresAt = computeExpiresAt();

  try {
    const { error: insertError } = await supabase.from('sync_sessions').insert({
      token_hash: tokenHash,
      address,
      device_label: deviceLabel,
      expires_at: expiresAt.toISOString(),
      last_seen_at: new Date().toISOString(),
    });
    if (insertError) {
      console.error('Failed to insert sync_sessions row (joey):', insertError);
      return NextResponse.json(
        {
          error: 'Failed to create session',
          detail: insertError.message,
          code: insertError.code,
          hint: insertError.hint,
        },
        { status: 500 }
      );
    }

    const response = NextResponse.json({
      address,
      expiresAt: expiresAt.toISOString(),
    });
    attachSessionCookie(response, token, expiresAt);
    return response;
  } catch (err) {
    console.error('Joey verify error:', err);
    return NextResponse.json(
      {
        error: 'Internal server error',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
