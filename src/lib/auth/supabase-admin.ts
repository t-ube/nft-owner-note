// サーバー専用。owner_note.account / push_token の RPC（定義は src/query/account.sql）。
import { supabaseAdmin } from '@/lib/supabase/admin';

/** ログインの記録。token が null なら push_token には触らない。失敗したら false */
export async function recordLogin(
  address: string,
  token: string | null,
  expiresAt: string | null
): Promise<boolean> {
  const { error } = await supabaseAdmin.rpc('owner_note_login', {
    p_address: address,
    p_token: token,
    p_expires_at: expiresAt,
  });
  if (error) console.error('[auth] owner_note_login failed:', error.message);
  return !error;
}

/** user_token の更新（ログインしたことのあるアドレスのみ）。失敗は呼び出し側で握りつぶしてよい */
export async function touchToken(address: string, token: string, expiresAt: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc('owner_note_touch_token', {
    p_address: address,
    p_token: token,
    p_expires_at: expiresAt,
  });
  if (error) console.error('[auth] owner_note_touch_token failed:', error.message);
}

/** 生きている Xaman の user_token。無い・取れないときは null */
export async function liveXamanToken(address: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.rpc('owner_note_live_token', { p_address: address });
  if (error) {
    console.error('[auth] owner_note_live_token failed:', error.message);
    return null;
  }
  return typeof data === 'string' && data ? data : null;
}
