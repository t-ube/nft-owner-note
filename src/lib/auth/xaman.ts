// サーバー専用。Xaman Platform API。API Secret を持つのはここだけ。
import type { XummTypes } from 'xumm-sdk';

const API_BASE = 'https://xumm.app/api/v1/platform';

export const XAMAN_NETWORK = 'MAINNET';
/** user_token の寿命（最後の署名から30日） */
export const USER_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type Credentials = { key: string; secret: string };

function getCredentials(): Credentials | null {
  // API Key は公開値なので、既存の NEXT_PUBLIC_XAMAN_API_KEY でも受ける
  const key = process.env.XAMAN_API_KEY || process.env.NEXT_PUBLIC_XAMAN_API_KEY;
  const secret = process.env.XAMAN_API_SECRET;
  return key && secret ? { key, secret } : null;
}

export function isXamanConfigured(): boolean {
  return getCredentials() !== null;
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T | null> {
  const cred = getCredentials();
  if (!cred) return null;
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-API-Key': cred.key,
        'X-API-Secret': cred.secret,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
    if (!res.ok) {
      console.error(`[xaman] ${method} ${path} -> ${res.status} ${await res.text().catch(() => '')}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.error(`[xaman] ${method} ${path} failed:`, err);
    return null;
  }
}

export type CreatedPayload = XummTypes.XummPostPayloadResponse;
export type PayloadDetail = XummTypes.XummGetPayloadResponse;

export function createPayload(body: XummTypes.CreatePayload): Promise<CreatedPayload | null> {
  return call<CreatedPayload>('POST', '/payload', body);
}

export function getPayload(uuid: string): Promise<PayloadDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(uuid)) return Promise.resolve(null);
  return call<PayloadDetail>('GET', `/payload/${uuid}`);
}

/** SignIn ペイロード。Xaman に出す文言はここで持つ（ブラウザからは受け取らない） */
export function createSignInPayload(lang: 'en' | 'ja', returnUrl: string | null) {
  return createPayload({
    txjson: { TransactionType: 'SignIn' },
    options: {
      expire: 5,
      ...(returnUrl ? { return_url: { app: returnUrl, web: returnUrl } } : {}),
    },
    custom_meta: {
      instruction: lang === 'ja' ? 'OwnerNote にログインします' : 'Sign in to OwnerNote',
    },
  } as XummTypes.CreatePayload);
}

/** 署名で発行された user_token と、その期限 */
export function issuedUserToken(detail: PayloadDetail): { token: string; expiresAt: string } | null {
  const token = detail.application?.issued_user_token;
  if (!token) return null;
  return { token, expiresAt: new Date(Date.now() + USER_TOKEN_TTL_MS).toISOString() };
}
