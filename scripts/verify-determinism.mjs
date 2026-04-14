// Verify that ripple-keypairs signing is deterministic for both
// ed25519 and secp256k1 — i.e. signing the same canonical message
// twice with the same secret yields the same signature bytes.
//
// This validates the core assumption of the backup encryption design:
// HKDF(signature) -> stable AES key across sessions and devices.
//
// Run: node scripts/verify-determinism.mjs

import {
  generateSeed,
  deriveKeypair,
  sign,
  verify,
  deriveAddress,
} from 'ripple-keypairs';

const ITERATIONS = 5;

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function checkScheme(label, algorithm) {
  const seed = generateSeed({ algorithm });
  const keypair = deriveKeypair(seed);
  const address = deriveAddress(keypair.publicKey);

  // Canonical backup-key derivation message
  const canonical = `xrpl-owner-note:backup-key:v1:${address}`;
  const messageBytes = new TextEncoder().encode(canonical);
  const messageHex = bytesToHex(messageBytes);

  console.log(`\n=== ${label} (${algorithm}) ===`);
  console.log(`address:  ${address}`);
  console.log(`message:  ${canonical}`);

  const sigs = new Set();
  let firstSig = null;
  for (let i = 0; i < ITERATIONS; i++) {
    const s = sign(messageHex, keypair.privateKey);
    sigs.add(s);
    if (!firstSig) firstSig = s;
  }

  const ok = verify(messageHex, firstSig, keypair.publicKey);
  const deterministic = sigs.size === 1;

  console.log(`signature bytes: ${firstSig.length / 2} bytes`);
  console.log(`signature hex:   ${firstSig.slice(0, 32)}...`);
  console.log(`unique sigs over ${ITERATIONS} runs: ${sigs.size}`);
  console.log(`verify():        ${ok ? 'OK' : 'FAIL'}`);
  console.log(`deterministic:   ${deterministic ? 'YES' : 'NO'}`);
  return deterministic && ok;
}

const results = [
  checkScheme('ed25519',   'ed25519'),
  checkScheme('secp256k1', 'ecdsa-secp256k1'),
];

console.log('\n=== summary ===');
console.log(`ed25519:   ${results[0] ? 'PASS' : 'FAIL'}`);
console.log(`secp256k1: ${results[1] ? 'PASS' : 'FAIL'}`);

process.exit(results.every(Boolean) ? 0 : 1);
