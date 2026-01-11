// app/providers.tsx
"use client"

import { ThemeProvider } from "next-themes"
import { XamanProvider } from '@/app/contexts/XamanContext';
import { JoeyWcProvider } from '@/app/contexts/JoeyContext';
import { XRPLWalletProvider } from '@/app/contexts/XRPLWalletContext';
import { SupabaseAuthProvider } from '@/app/contexts/SupabaseAuthContext';
import { SyncProvider} from '@/app/contexts/SyncContext';

export const Providers: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <JoeyWcProvider>
        <XamanProvider>
          <XRPLWalletProvider>
            <SupabaseAuthProvider>
              <SyncProvider>
                {children}
              </SyncProvider>
            </SupabaseAuthProvider>
          </XRPLWalletProvider>
        </XamanProvider>
      </JoeyWcProvider>
    </ThemeProvider>
  )
}