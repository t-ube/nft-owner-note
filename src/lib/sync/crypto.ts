// lib/sync/crypto.ts
//
// HKDF-SHA256 -> AES-256-GCM helpers used by the cloud-backup encryption
// layer. All operations run in the browser via Web Crypto.
//
// Key derivation is done by the caller (see backupKey.ts) and then handed
// here as raw bytes. This module knows nothing about wallets — it only
// turns key material into AES-GCM operations.

const AES_ALGORITHM = 'AES-GCM';
const AES_KEY_LENGTH_BITS = 256;
const IV_LENGTH_BYTES = 12;

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) {
    throw new Error('hex string has odd length');
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return new Uint8Array(buf);
}

/**
 * Derive a 32-byte AES-256-GCM key from arbitrary input key material via
 * HKDF-SHA256. `salt` should be domain-separating (e.g. sha256(address))
 * so two users never share a key. `info` should pin the purpose
 * (e.g. "xrpl-owner-note-backup-v1") so the same ikm can be split into
 * unrelated subkeys later if needed.
 */
export async function deriveAesKeyFromBytes(
  ikm: Uint8Array | string,
  salt: Uint8Array,
  info: string
): Promise<CryptoKey> {
  const ikmBytes = typeof ikm === 'string' ? hexToBytes(ikm) : ikm;
  const baseKey = await crypto.subtle.importKey(
    'raw',
    ikmBytes as BufferSource,
    'HKDF',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt as BufferSource,
      info: new TextEncoder().encode(info),
    },
    baseKey,
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH_BITS },
    true, // extractable so we can cache raw bytes in sessionStorage
    ['encrypt', 'decrypt']
  );
}

export async function addressSalt(address: string): Promise<Uint8Array> {
  return sha256(new TextEncoder().encode(address));
}

/**
 * Encrypt an arbitrary JSON-serializable object under the given AES-GCM key.
 * Returns base64(iv || ciphertext+tag). The IV is fresh per call.
 */
export async function encryptJson(
  key: CryptoKey,
  value: unknown
): Promise<string> {
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
  const ctBuf = await crypto.subtle.encrypt(
    { name: AES_ALGORITHM, iv: iv as BufferSource },
    key,
    plaintext as BufferSource
  );
  const ct = new Uint8Array(ctBuf);
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return bytesToBase64(out);
}

/**
 * Decrypt a base64(iv || ct+tag) blob produced by `encryptJson` and parse
 * the plaintext as JSON. Throws if the key is wrong or the blob is
 * corrupted.
 */
export async function decryptJson<T = unknown>(
  key: CryptoKey,
  blob: string
): Promise<T> {
  const all = base64ToBytes(blob);
  if (all.length < IV_LENGTH_BYTES + 1) {
    throw new Error('cipher blob too short');
  }
  const iv = all.slice(0, IV_LENGTH_BYTES);
  const ct = all.slice(IV_LENGTH_BYTES);
  const ptBuf = await crypto.subtle.decrypt(
    { name: AES_ALGORITHM, iv: iv as BufferSource },
    key,
    ct as BufferSource
  );
  const plaintext = new TextDecoder().decode(ptBuf);
  return JSON.parse(plaintext) as T;
}

// ----- raw export / import for sessionStorage caching -----

export async function exportKeyRaw(key: CryptoKey): Promise<string> {
  const buf = await crypto.subtle.exportKey('raw', key);
  return bytesToBase64(new Uint8Array(buf));
}

export async function importKeyRaw(b64: string): Promise<CryptoKey> {
  const bytes = base64ToBytes(b64);
  return crypto.subtle.importKey(
    'raw',
    bytes as BufferSource,
    { name: AES_ALGORITHM, length: AES_KEY_LENGTH_BITS },
    true,
    ['encrypt', 'decrypt']
  );
}
