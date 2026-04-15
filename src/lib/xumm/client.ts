import { Xumm } from 'xumm';

let instance: Xumm | null = null;

export function getXumm(): Xumm {
  if (typeof window === 'undefined') {
    throw new Error('getXumm must be called in the browser');
  }
  if (!instance) {
    const apiKey = process.env.NEXT_PUBLIC_XAMAN_API_KEY;
    if (!apiKey) {
      throw new Error('NEXT_PUBLIC_XAMAN_API_KEY is not configured');
    }
    instance = new Xumm(apiKey);
  }
  return instance;
}
