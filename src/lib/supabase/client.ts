// src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr';

export function createSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      /*
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'ownernote-auth',
        storage: {
          getItem: (key) => {
            if (typeof window === 'undefined') return null;
            return window.localStorage.getItem(key);
          },
          setItem: (key, value) => {
            if (typeof window === 'undefined') return;
            window.localStorage.setItem(key, value);
          },
          removeItem: (key) => {
            if (typeof window === 'undefined') return;
            window.localStorage.removeItem(key);
          },
        },
      },
        */
      global: {
        fetch: (url, options) => {
          return fetch(url, {
            ...options,
            signal: AbortSignal.timeout(10000),
          });
        },
      },
    }
  );
}