'use client';

import * as React from 'react';
import { advanced } from '@joey-wallet/wc-client/react';

import defaultConfig, { buildJoeyConfig } from '@/app/joeyConfig';

const { Provider: WcProvider, useProvider } = advanced.default;
export { useProvider };

export const JoeyWcProvider = (props: React.PropsWithChildren) => {
  // Build the config from the actual page origin so that
  // metadata.redirect.universal points to the URL the user really visited
  // (e.g. https://192.168.x.x:3000 over LAN), not localhost.
  const [config, setConfig] = React.useState(() => defaultConfig);

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      setConfig(buildJoeyConfig(window.location.origin));
    }
  }, []);

  return <WcProvider config={config}>{props.children}</WcProvider>;
};
