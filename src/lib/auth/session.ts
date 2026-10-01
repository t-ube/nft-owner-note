// サーバー専用。Cookie の署名と検証、API Route の共通の守り。
// 仕様は doc/login.md。edge runtime で動くよう Web Crypto だけを使う。
import { NextRequest, NextResponse } from 'next/server';

export type LoginWallet = 'xaman' | 'joey';

export const LOGIN_COOKIE = 'on_login';
export const SESSION_COOKIE = 'on_session';

const LOGIN_TTL_SEC = 5 * 60;
const SESSION_TTL_SEC = 30 * 24 * 60 * 60;
const SESSION_RENEW_BEFORE_SEC = 7 * 24 * 60 * 60;

/** 待ち受け中のお題。Xaman は v にペイロード uuid、Joey は v にチャレンジ・a にアドレス */
export type PendingLogin = {
  k: LoginWallet;
  v: string;
  a?: string;
  exp: number;
};

export type Session = {
  sub: string;
  wallet: LoginWallet;
  iat: number;
  exp: number;
};

// ----- base64url / HMAC -----

const enc = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array | null {
  try {
    let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    b64 += '='.repeat((4 - (b64.length % 4)) % 4);
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function encodeJson(value: unknown): string {
  return toBase64Url(enc.encode(JSON.stringify(value)));
}

function decodeJson<T>(s: string): T | null {
  const bytes = fromBase64Url(s);
  if (!bytes) return null;
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

export function getSessionSecret(): string | null {
  return process.env.SESSION_SECRET || null;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

async function sign(secret: string, data: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(data));
  return toBase64Url(new Uint8Array(sig));
}

// 比較は crypto.subtle.verify に任せる（文字列比較によるタイミング攻撃を避ける）
async function verify(secret: string, data: string, sig: string): Promise<boolean> {
  const bytes = fromBase64Url(sig);
  if (!bytes) return false;
  return crypto.subtle.verify('HMAC', await hmacKey(secret), bytes, enc.encode(data));
}

const nowSec = () => Math.floor(Date.now() / 1000);

// ----- on_login -----

export async function createLoginCookieValue(
  secret: string,
  pending: Omit<PendingLogin, 'exp'>
): Promise<string> {
  const body = encodeJson({ ...pending, exp: nowSec() + LOGIN_TTL_SEC });
  return `${body}.${await sign(secret, body)}`;
}

export async function readPendingLogin(
  req: NextRequest,
  secret: string,
  wallet: LoginWallet
): Promise<PendingLogin | null> {
  const raw = req.cookies.get(LOGIN_COOKIE)?.value;
  if (!raw) return null;
  const [body, sig] = raw.split('.');
  if (!body || !sig || !(await verify(secret, body, sig))) return null;
  const pending = decodeJson<PendingLogin>(body);
  if (!pending || pending.k !== wallet || typeof pending.v !== 'string') return null;
  if (typeof pending.exp !== 'number' || pending.exp < nowSec()) return null;
  return pending;
}

// ----- on_session（JWT, HS256） -----

const JWT_HEADER = encodeJson({ alg: 'HS256', typ: 'JWT' });

export async function createSessionJwt(secret: string, address: string, wallet: LoginWallet): Promise<string> {
  const iat = nowSec();
  const payload = encodeJson({ sub: address, wallet, iat, exp: iat + SESSION_TTL_SEC });
  const data = `${JWT_HEADER}.${payload}`;
  return `${data}.${await sign(secret, data)}`;
}

export async function readSession(req: NextRequest, secret: string): Promise<Session | null> {
  const raw = req.cookies.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 3 || parts[0] !== JWT_HEADER) return null;
  if (!(await verify(secret, `${parts[0]}.${parts[1]}`, parts[2]))) return null;
  const s = decodeJson<Session>(parts[1]);
  if (!s || typeof s.sub !== 'string' || (s.wallet !== 'xaman' && s.wallet !== 'joey')) return null;
  if (typeof s.exp !== 'number' || s.exp < nowSec()) return null;
  return s;
}

export function shouldRenewSession(s: Session): boolean {
  return s.exp - nowSec() < SESSION_RENEW_BEFORE_SEC;
}

// ----- Cookie の付け外し -----

function cookieBase(req: NextRequest) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: new URL(req.url).protocol === 'https:',
  };
}

export function setLoginCookie(req: NextRequest, res: NextResponse, value: string) {
  res.cookies.set(LOGIN_COOKIE, value, { ...cookieBase(req), maxAge: LOGIN_TTL_SEC });
}

export function clearLoginCookie(req: NextRequest, res: NextResponse) {
  res.cookies.set(LOGIN_COOKIE, '', { ...cookieBase(req), maxAge: 0 });
}

export async function setSessionCookie(
  req: NextRequest,
  res: NextResponse,
  secret: string,
  address: string,
  wallet: LoginWallet
) {
  const jwt = await createSessionJwt(secret, address, wallet);
  res.cookies.set(SESSION_COOKIE, jwt, { ...cookieBase(req), maxAge: SESSION_TTL_SEC });
}

export function clearSessionCookie(req: NextRequest, res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, '', { ...cookieBase(req), maxAge: 0 });
}

// ----- 応答と共通の守り -----

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function errorJson(error: string, status: number): NextResponse {
  return json({ error }, status);
}

export function siteOrigin(req: NextRequest): string {
  return new URL(req.url).origin;
}

/**
 * POST の前提を確かめる。問題があればその応答を返し、無ければ null。
 * - Origin が自サイトであること（無いものも拒否）
 * - 本文が application/json であること（<form enctype="text/plain"> を弾く）
 */
export function guardPost(req: NextRequest, { requireJson = true } = {}): NextResponse | null {
  if (req.headers.get('origin') !== siteOrigin(req)) return errorJson('cross_origin', 403);
  if (requireJson) {
    const type = req.headers.get('content-type') ?? '';
    if (!type.toLowerCase().startsWith('application/json')) return errorJson('bad_content_type', 415);
  }
  return null;
}

export async function readJsonBody<T>(req: NextRequest): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

export function normalizeLang(lang: string | null): 'en' | 'ja' {
  return lang === 'ja' ? 'ja' : 'en';
}

export function isLocalhost(req: NextRequest): boolean {
  const host = new URL(req.url).hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}
