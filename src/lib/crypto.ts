// lib/crypto.ts

// キーをCryptoKeyに変換
async function getKey(hexKey: string): Promise<CryptoKey> {
  const matches = hexKey.match(/.{1,2}/g);
  if (!matches) throw new Error('Invalid hex key');
  
  const keyBytes = new Uint8Array(
    matches.map(byte => parseInt(byte, 16))
  );
  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

// 暗号化
export async function encrypt(plaintext: string, hexKey: string): Promise<string> {
  const key = await getKey(hexKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  );

  // IV + ciphertext を結合してBase64エンコード
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  
  // Array.fromを使用してUint8Arrayを配列に変換
  return btoa(String.fromCharCode.apply(null, Array.from(combined)));
}

// 復号化
export async function decrypt(encryptedBase64: string, hexKey: string): Promise<string> {
  const key = await getKey(hexKey);
  const binaryString = atob(encryptedBase64);
  const combined = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    combined[i] = binaryString.charCodeAt(i);
  }
  
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  
  return new TextDecoder().decode(plaintext);
}