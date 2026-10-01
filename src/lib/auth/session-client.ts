// 画面側のログイン API 呼び出し。仕様は doc/login.md。
import type { WalletType } from '@/types/Wallet';

export type AuthSession = {
  address: string;
  wallet: WalletType;
  expiresAt: string;
};

export type XamanLoginStart = { uuid: string; link: string; qr: string; ws: string };

export type VerifyResult =
  | { status: 'ok'; account: string }
  | { status: 'pending' }
  | { status: 'error'; error: string };

/** スマホのログイン開始時刻を置く sessionStorage のキー */
export const MOBILE_LOGIN_STARTED_KEY = 'auth.xamanLoginStartedAt';
export const LOGIN_TTL_MS = 5 * 60 * 1000;

async function readError(res: Response): Promise<string> {
  const data = await res.json().catch(() => null);
  return typeof data?.error === 'string' ? data.error : `http_${res.status}`;
}

function postJson(url: string, body?: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function fetchMe(): Promise<AuthSession | null> {
  const res = await fetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.account) return null;
  return { address: data.account, wallet: data.wallet, expiresAt: data.expiresAt };
}

export async function logout(): Promise<void> {
  await postJson('/api/auth/logout');
}

// ----- Xaman -----

export async function startXamanLogin(lang: string): Promise<XamanLoginStart> {
  const res = await postJson(`/api/auth/login?lang=${encodeURIComponent(lang)}`);
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export function startXamanMobileLogin(lang: string): void {
  try {
    sessionStorage.setItem(MOBILE_LOGIN_STARTED_KEY, String(Date.now()));
  } catch {
    /* sessionStorage が使えなくても、戻り先の ?login=xaman で確かめられる */
  }
  window.location.href = `/api/auth/start?lang=${encodeURIComponent(lang)}`;
}

export async function verifyXamanLogin(): Promise<VerifyResult> {
  const res = await postJson('/api/auth/verify');
  if (res.status === 202) return { status: 'pending' };
  if (!res.ok) return { status: 'error', error: await readError(res) };
  const data = await res.json();
  return { status: 'ok', account: data.account };
}

// ----- Joey -----

export async function joeyChallenge(address: string): Promise<Record<string, unknown>> {
  const res = await postJson('/api/auth/joey/challenge', { address });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  return data.tx_json;
}

export async function joeyVerify(txJson: unknown): Promise<string> {
  const res = await postJson('/api/auth/joey/verify', { tx_json: txJson });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  return data.account;
}

// ----- 取引の署名（Xaman） -----

export type XamanSignRequest = {
  uuid: string;
  next: { always: string };
  refs: { websocket_status: string; qr_png: string };
  pushed: boolean;
};

export type XamanSignResult =
  | { status: 'signed'; txid: string | null; dispatched_result: string | null }
  | { status: 'rejected' }
  | { status: 'pending' }
  | { status: 'error'; error: string };

export async function createXamanSignRequest(txjson: unknown, returnPath?: string): Promise<XamanSignRequest> {
  const res = await postJson('/api/xaman/payload', { txjson, ...(returnPath ? { return_path: returnPath } : {}) });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function fetchXamanSignResult(uuid: string): Promise<XamanSignResult> {
  const res = await fetch(`/api/xaman/payload/${encodeURIComponent(uuid)}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (res.status === 202) return { status: 'pending' };
  if (!res.ok) return { status: 'error', error: await readError(res) };
  const data = await res.json();
  if (!data.signed) return { status: 'rejected' };
  return { status: 'signed', txid: data.txid, dispatched_result: data.dispatched_result };
}
