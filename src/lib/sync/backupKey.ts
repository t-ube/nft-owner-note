// lib/sync/backupKey.ts
//
// Backup-key acquisition and caching. There are two derivation paths:
//
//  - **Xaman**: HKDF input is the bytes of the SignIn `response.hex`
//    (verified deterministic on real devices). The hex is supplied by
//    the sign-in flow and the derived AES key is then cached in
//    localStorage so that browser restarts do not require re-signing.
//    On signOut the cache is wiped.
//
//  - **Joey**: HKDF input is a hardcoded constant baked into the bundle.
//    This is intentionally weaker than the Xaman path — it only protects
//    against direct Supabase DB leakage, not against an attacker who can
//    also read the public JS bundle. It exists because Joey's autofill
//    semantics make wallet-derived deterministic keys impossible without
//    adding an extra signing operation, which we explicitly want to avoid.
//
// Both paths produce an AES-256-GCM CryptoKey for the same encryption
// layer in SyncManager. The address is mixed in via the HKDF salt so two
// users never share a key.
//
// Storage rationale: localStorage (vs sessionStorage) means the key
// survives tab close / browser restart, so a user who is already signed
// in does not get their cloud sync silently disabled until they re-sign.
// The threat model (DB leakage) is unchanged — anyone with JS access on
// the page can already exfiltrate either storage.

import {
  addressSalt,
  deriveAesKeyFromBytes,
  exportKeyRaw,
  importKeyRaw,
} from './crypto';

export type WalletType = 'xaman' | 'joey';

const XAMAN_HKDF_INFO = 'xrpl-owner-note-backup-v1';
const JOEY_HKDF_INFO = 'xrpl-owner-note-joey-v1';

// Hardcoded constant for Joey backup key derivation. Anyone with the
// public JS bundle can read this, so on its own it provides no defence.
// Combined with the per-address salt it produces unique keys per user
// and protects against pure database leakage.
const JOEY_BACKUP_CONSTANT = 'xrpl-owner-note:joey-backup-key:v1';

const KEY_STORAGE_PREFIX = 'xon.backup-key:';
const WALLET_STORAGE_PREFIX = 'xon.backup-wallet:';

const memoryCache = new Map<string, CryptoKey>();

function cacheKey(address: string): string {
  return `${KEY_STORAGE_PREFIX}${address}`;
}

function walletStorageKey(address: string): string {
  return `${WALLET_STORAGE_PREFIX}${address}`;
}

function rememberWalletType(address: string, walletType: WalletType): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(walletStorageKey(address), walletType);
  } catch (err) {
    console.warn('[backupKey] localStorage walletType write failed', err);
  }
}

function recallWalletType(address: string): WalletType | null {
  if (typeof localStorage === 'undefined') return null;
  const v = localStorage.getItem(walletStorageKey(address));
  return v === 'xaman' || v === 'joey' ? v : null;
}

async function rememberKey(address: string, key: CryptoKey): Promise<void> {
  memoryCache.set(address, key);
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = await exportKeyRaw(key);
      localStorage.setItem(cacheKey(address), raw);
    } catch (err) {
      console.warn('[backupKey] localStorage cache failed', err);
    }
  }
}

async function recallKey(address: string): Promise<CryptoKey | null> {
  const fromMem = memoryCache.get(address);
  if (fromMem) return fromMem;
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(cacheKey(address));
  if (!raw) return null;
  try {
    const key = await importKeyRaw(raw);
    memoryCache.set(address, key);
    return key;
  } catch (err) {
    console.warn('[backupKey] localStorage import failed', err);
    return null;
  }
}

export function clearBackupKey(address: string): void {
  memoryCache.delete(address);
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(cacheKey(address));
    localStorage.removeItem(walletStorageKey(address));
  }
}

export function clearAllBackupKeys(): void {
  memoryCache.clear();
  if (typeof localStorage === 'undefined') return;
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && (k.startsWith(KEY_STORAGE_PREFIX) || k.startsWith(WALLET_STORAGE_PREFIX))) {
      toRemove.push(k);
    }
  }
  for (const k of toRemove) localStorage.removeItem(k);
}

/**
 * Derive a Xaman backup key from the SignIn `response.hex` and cache it.
 * Call this from the verify-success path of the Xaman sign-in flow.
 */
export async function setXamanBackupKey(
  address: string,
  signInHex: string
): Promise<CryptoKey> {
  const salt = await addressSalt(address);
  const key = await deriveAesKeyFromBytes(signInHex, salt, XAMAN_HKDF_INFO);
  await rememberKey(address, key);
  rememberWalletType(address, 'xaman');
  return key;
}

/**
 * Derive a Joey backup key from the hardcoded constant. Deterministic
 * per address, so this is safe to call any time after sign-in (no need
 * to capture material from the signing flow).
 */
export async function setJoeyBackupKey(address: string): Promise<CryptoKey> {
  const salt = await addressSalt(address);
  const ikm = new TextEncoder().encode(JOEY_BACKUP_CONSTANT);
  const key = await deriveAesKeyFromBytes(ikm, salt, JOEY_HKDF_INFO);
  await rememberKey(address, key);
  rememberWalletType(address, 'joey');
  return key;
}

/**
 * Look up a previously-derived backup key. For Joey this falls back to
 * deterministic re-derivation if the cache is empty (cold reload, since
 * the Joey constant is bundled). For Xaman, returns null when the
 * sessionStorage cache is missing — the caller should skip cloud sync
 * until the user signs in again.
 */
export async function getBackupKey(address: string): Promise<CryptoKey | null> {
  const cached = await recallKey(address);
  if (cached) return cached;
  const walletType = recallWalletType(address);
  if (walletType === 'joey') {
    return setJoeyBackupKey(address);
  }
  return null;
}
