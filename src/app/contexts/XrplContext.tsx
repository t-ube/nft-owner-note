"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Client } from 'xrpl';

interface XrplContextType {
  client: Client | null;
  isReady: boolean;
  error: Error | null;
  reconnect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const XrplContext = createContext<XrplContextType | null>(null);

const XRPL_WEBSOCKET_URL = 'wss://s1.ripple.com';
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY = 2000; // 2 seconds

export const XrplProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [client, setClient] = useState<Client | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const connectingRef = useRef(false);
  const mountedRef = useRef(true);

  const cleanupClient = useCallback(async (oldClient: Client | null) => {
    if (oldClient) {
      try {
        oldClient.removeAllListeners();
        if (oldClient.isConnected()) {
          await oldClient.disconnect();
        }
      } catch (err) {
        console.error('Error during client cleanup:', err);
      }
    }
  }, []);

  const connect = useCallback(async () => {
    if (connectingRef.current || !mountedRef.current) return;
    connectingRef.current = true;

    try {
      // Cleanup existing client first
      await cleanupClient(client);

      const newClient = new Client(XRPL_WEBSOCKET_URL);
      
      // Setup event listeners before connecting
      newClient.on('disconnected', () => {
        if (mountedRef.current) {
          setIsReady(false);
          handleReconnect();
        }
      });

      newClient.on('error', (err) => {
        if (mountedRef.current) {
          setError(err);
          handleReconnect();
        }
      });

      await newClient.connect();
      
      if (mountedRef.current) {
        setClient(newClient);
        setIsReady(true);
        setError(null);
        setReconnectAttempts(0);
      } else {
        // Component unmounted during connection
        await cleanupClient(newClient);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error('Failed to connect to XRPL'));
        handleReconnect();
      }
    } finally {
      connectingRef.current = false;
    }
  }, [client, cleanupClient]);

  const handleReconnect = useCallback(async () => {
    if (!mountedRef.current) return;
    
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      setError(new Error('Max reconnection attempts reached'));
      return;
    }

    setReconnectAttempts(prev => prev + 1);
    await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY));
    await connect();
  }, [reconnectAttempts, connect]);

  const disconnect = useCallback(async () => {
    if (!mountedRef.current) return;
    
    await cleanupClient(client);
    setIsReady(false);
    setClient(null);
    setError(null);
  }, [client, cleanupClient]);

  const reconnect = useCallback(async () => {
    if (!mountedRef.current) return;
    
    setReconnectAttempts(0);
    await disconnect();
    await connect();
  }, [disconnect, connect]);

  // Initial connection
  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      cleanupClient(client);
    };
  }, []);

  // Ping connection to ensure it's alive
  useEffect(() => {
    if (!client || !isReady || !mountedRef.current) return;

    let isCheckingConnection = false;

    const checkConnection = async () => {
      if (isCheckingConnection || !mountedRef.current) return;
      isCheckingConnection = true;

      try {
        await client.request({
          command: 'ping'
        });
      } catch (err) {
        console.error('Ping failed:', err);
        if (mountedRef.current) {
          handleReconnect();
        }
      } finally {
        isCheckingConnection = false;
      }
    };

    const pingInterval = setInterval(checkConnection, 30000);

    return () => {
      clearInterval(pingInterval);
    };
  }, [client, isReady, handleReconnect]);

  const value = {
    client,
    isReady,
    error,
    reconnect,
    disconnect
  };

  return (
    <XrplContext.Provider value={value}>
      {children}
    </XrplContext.Provider>
  );
};

export const useXrplClient = () => {
  const context = useContext(XrplContext);
  if (!context) {
    throw new Error('useXrplClient must be used within an XrplProvider');
  }
  return context;
};