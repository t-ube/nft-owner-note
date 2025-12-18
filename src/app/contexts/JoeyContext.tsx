'use client';

import * as React from 'react';
import { advanced } from '@joey-wallet/wc-client/react';

import Config from '@/app/joeyConfig';

const { Provider: WcProvider, useProvider } = advanced.default;
export { useProvider };

export const JoeyWcProvider = (props: React.PropsWithChildren) => (
  <WcProvider config={Config}>{props.children}</WcProvider>
);

/*
'use client';

import * as React from 'react';
import { advanced } from '@joey-wallet/wc-client/react';
import Config from '@/app/joeyConfig';

const { Provider: WcProvider, useProvider: useAdvancedProvider } = advanced.default;

type Listener = (event: unknown) => void;

export type JoeyWalletKitLike = {
  on: (event: string, cb: Listener) => void;
  off?: (event: string, cb: Listener) => void;
  core?: {
    relayer?: {
      on?: (event: string, cb: Listener) => void;
      off?: (event: string, cb: Listener) => void;
    };
  };
};

export type JoeyHandle = {
  walletKit?: JoeyWalletKitLike;
  actions: advanced.typings.IActions;
  session?: unknown;
  accounts?: string[] | undefined;
  chain?: unknown;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function hasOn(v: unknown): v is JoeyWalletKitLike {
  if (!isRecord(v)) return false;
  return typeof v.on === 'function';
}

function pickWalletKit(p: unknown): JoeyWalletKitLike | undefined {
  if (!isRecord(p)) return undefined;

  const candidates: unknown[] = [
    p.walletKit,
    p.walletkit,
    p.client,
    p.signClient,
    p.web3wallet,
  ];

  for (const c of candidates) {
    if (hasOn(c)) return c;
  }
  return undefined;
}

export function useJoey(): JoeyHandle {
  const p = useAdvancedProvider() as unknown;

  const walletKit = pickWalletKit(p);

  const rec = isRecord(p) ? p : ({} as Record<string, unknown>);

  return {
    walletKit,
    actions: rec.actions as advanced.typings.IActions,
    session: rec.session,
    accounts: rec.accounts as string[] | undefined,
    chain: rec.chain,
  };
}

export const useProvider = useJoey;

export const JoeyWcProvider = (props: React.PropsWithChildren) => (
  <WcProvider config={Config}>{props.children}</WcProvider>
);

*/