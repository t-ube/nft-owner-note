// サーバー専用。Joey 用チャレンジ tx の組み立てと検証。仕様は doc/login.md「Joey のチャレンジ tx」。
import { verifySignature } from 'xrpl/dist/npm/Wallet/signer';
import { deriveAddress } from 'ripple-keypairs';

const MEMO_TYPE = 'owner-note/login';

// Joey は台帳で通らない値（過去の LastLedgerSequence、Sequence 0 など）だと署名を拒むので、
// Fee / Sequence / LastLedgerSequence は Joey に本物の値を入れてもらう（autofill）。
// 署名済みの tx は送信できる形になるが、サーバーは送信しない。中身は何も変えない AccountSet。
const FIXED = {
  TransactionType: 'AccountSet',
} as const;

/** 署名済み tx の Fee の上限（drops）。漏れて送信されたときの損失をこれ以下に抑える */
const MAX_FEE_DROPS = 1000;

const ALLOWED_KEYS = new Set([
  ...Object.keys(FIXED),
  'Account',
  'Fee',
  'Sequence',
  'LastLedgerSequence',
  'Memos',
  'SigningPubKey',
  'TxnSignature',
  // ウォレットが既定値を書き足すことがあるので、0 のときだけ許す
  'Flags',
]);

function toHex(s: string): string {
  return Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

export function newChallenge(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function memoData(host: string, challenge: string): string {
  return toHex(`${host} ${challenge}`);
}

export function buildChallengeTx(address: string, host: string, challenge: string) {
  return {
    ...FIXED,
    Account: address,
    Memos: [{ Memo: { MemoType: toHex(MEMO_TYPE), MemoData: memoData(host, challenge) } }],
  };
}

export type JoeyVerifyError = 'bad_tx' | 'challenge_mismatch' | 'account_mismatch' | 'bad_signature';

/** 署名済み tx を確かめる。通れば null、駄目ならエラーコード */
export function verifyChallengeTx(
  tx: unknown,
  expected: { address: string; host: string; challenge: string }
): JoeyVerifyError | null {
  if (!tx || typeof tx !== 'object' || Array.isArray(tx)) return 'bad_tx';
  // ウォレットが返す hash は tx のフィールドではないので、検証の前に外す
  const t = { ...(tx as Record<string, unknown>) };
  delete t.hash;

  // 形: 決めたフィールドだけで、値も決めたとおり
  for (const key of Object.keys(t)) {
    if (!ALLOWED_KEYS.has(key)) return 'bad_tx';
  }
  if ('Flags' in t && t.Flags !== 0) return 'bad_tx';
  for (const [key, value] of Object.entries(FIXED)) {
    if (t[key] !== value) return 'bad_tx';
  }
  // autofill された値。形と、Fee が常識的な範囲かだけを見る
  if (typeof t.Fee !== 'string' || !/^\d+$/.test(t.Fee) || Number(t.Fee) > MAX_FEE_DROPS) return 'bad_tx';
  if (!Number.isInteger(t.Sequence) || (t.Sequence as number) < 1) return 'bad_tx';
  if ('LastLedgerSequence' in t && !Number.isInteger(t.LastLedgerSequence)) return 'bad_tx';
  if (typeof t.Account !== 'string') return 'bad_tx';
  if (typeof t.SigningPubKey !== 'string' || !t.SigningPubKey) return 'bad_tx';
  if (typeof t.TxnSignature !== 'string' || !t.TxnSignature) return 'bad_tx';

  const memos = t.Memos;
  if (!Array.isArray(memos) || memos.length !== 1) return 'bad_tx';
  const memo = (memos[0] as { Memo?: Record<string, unknown> } | null)?.Memo;
  if (!memo || typeof memo.MemoType !== 'string' || typeof memo.MemoData !== 'string') return 'bad_tx';
  if (Object.keys(memo).some((k) => k !== 'MemoType' && k !== 'MemoData')) return 'bad_tx';
  if (memo.MemoType.toUpperCase() !== toHex(MEMO_TYPE)) return 'bad_tx';

  // お題: ブラウザに結び付いた on_login のチャレンジと一致すること
  if (memo.MemoData.toUpperCase() !== memoData(expected.host, expected.challenge)) return 'challenge_mismatch';
  if (t.Account !== expected.address) return 'account_mismatch';

  // 署名: 公開鍵で検証でき、その公開鍵のアドレスが Account であること
  try {
    if (!verifySignature(t as unknown as Parameters<typeof verifySignature>[0])) return 'bad_signature';
    if (deriveAddress(t.SigningPubKey) !== t.Account) return 'bad_signature';
  } catch {
    return 'bad_signature';
  }
  return null;
}
