// hooks/useXrplClient.ts
import { Client } from 'xrpl';
import { useState, useEffect } from 'react';

export function useXrplClient() {
  const [client, setClient] = useState<Client | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const newClient = new Client('wss://s1.ripple.com');
    
    const connect = async () => {
      try {
        await newClient.connect();
        setIsReady(true);
        setClient(newClient);
      } catch (err) {
        console.error('Failed to connect to XRPL:', err);
      }
    };

    connect();

    return () => {
      newClient.disconnect();
    };
  }, []);

  return { client, isReady };
}