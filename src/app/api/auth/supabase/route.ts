// /api/auth/supabase/route.ts
export const runtime = 'edge';

import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

// 暗号化キー生成（256bit = 32bytes）
function generateEncryptionKey(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function POST(req: NextRequest) {
  try {
    const { walletAddress } = await req.json();

    if (!walletAddress || typeof walletAddress !== 'string') {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const email = `${walletAddress.toLowerCase()}@xrpl.wallet`;

    // ユーザー検索
    const { data: { users } } = await supabase.auth.admin.listUsers();
    let user = users.find((u) => u.email === email);

    // なければ作成
    if (!user) {
      const encryptionKey = generateEncryptionKey();
      
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          wallet_address: walletAddress,
          provider: 'xaman',
          encryption_key: encryptionKey,
        },
      });

      if (error || !data.user) {
        return NextResponse.json({ error: 'Failed to create user', e: error }, { status: 500 });
      }
      user = data.user;
    }

    // Magic Link生成
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error('Link generation error:', linkError);
      return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 });
    }

    // サーバー側でセッション生成（verifyOtpはadminでも使える）
    const { data: otpData, error: otpError } = await supabase.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: 'magiclink',
    });

    if (otpError || !otpData.session) {
      console.error('OTP verification error:', otpError);
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
    }

    // セッショントークンを返す
    return NextResponse.json({
      access_token: otpData.session.access_token,
      refresh_token: otpData.session.refresh_token,
      user: {
        id: user.id,
        wallet_address: walletAddress,
        user_metadata: user.user_metadata,
      },
    });
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}