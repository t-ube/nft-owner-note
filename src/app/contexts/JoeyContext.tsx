'use client';

import * as React from 'react';
import { advanced } from '@joey-wallet/wc-client/react';

import Config from '@/app/joeyConfig';

const { Provider: WcProvider, useProvider } = advanced.default;
export { useProvider };

export const JoeyWcProvider = (props: React.PropsWithChildren) => (
  <WcProvider config={Config}>{props.children}</WcProvider>
);
