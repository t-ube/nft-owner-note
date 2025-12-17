import type { Config } from '@joey-wallet/wc-client';

export default {
	// Required
  projectId: process.env['NEXT_PUBLIC_REOWN_PROJECT_ID'],
  // Optional - Add your projects details
  metadata: {
    name: 'OwnerNote',
    description:
      'A management tool for XRPL NFTs - Easily track owners, monitor sales, and view statistics for XRP Ledger NFTs.',
    url: "http://localhost:3000",
    icons: ['/images/favicon.ico'],
    redirect: {
      universal: "http://localhost:3000",
    },
  },
} as Config