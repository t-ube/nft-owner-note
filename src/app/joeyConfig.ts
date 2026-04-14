import type { Config } from '@joey-wallet/wc-client';

/**
 * Build the Joey/WalletConnect provider config dynamically.
 *
 * `origin` should be the current page origin (e.g. `https://192.168.10.120:3000`).
 * Joey docs specify `redirect` as a STRING (universal link) — not the standard
 * WC `{universal, native}` object — so we follow the Joey shape verbatim.
 */
export function buildJoeyConfig(origin: string): Config {
  return {
    projectId: process.env['NEXT_PUBLIC_REOWN_PROJECT_ID'],
    metadata: {
      name: 'OwnerNote',
      description:
        'A management tool for XRPL NFTs - Easily track owners, monitor sales, and view statistics for XRP Ledger NFTs.',
      url: origin,
      icons: [`${origin}/images/favicon.ico`],
      // Joey docs use a plain string here, despite WC's type declaring an
      // object. Cast through unknown to satisfy the WC type system.
      redirect: origin as unknown as { universal?: string; native?: string },
    },
  } as Config;
}

// Backwards-compatible default for SSR / build-time imports. Will be replaced
// by buildJoeyConfig(window.location.origin) at runtime inside JoeyContext.
const defaultConfig: Config = {
  projectId: process.env['NEXT_PUBLIC_REOWN_PROJECT_ID'],
  metadata: {
    name: 'OwnerNote',
    description:
      'A management tool for XRPL NFTs - Easily track owners, monitor sales, and view statistics for XRP Ledger NFTs.',
    url: 'http://localhost:3000',
    icons: ['/images/favicon.ico'],
    redirect: 'http://localhost:3000' as unknown as {
      universal?: string;
      native?: string;
    },
  },
} as Config;

export default defaultConfig;
