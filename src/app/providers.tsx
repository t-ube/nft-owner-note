// app/providers.tsx
"use client"

import { ThemeProvider } from "next-themes"
import { XamanProvider } from "@/app/contexts/XamanContext"
import { JoeyWcProvider } from "@/app/contexts/JoeyContext"
import { XRPLWalletProvider } from "@/app/contexts/XRPLWalletContext"
import { SyncSessionProvider } from "@/app/contexts/SyncSessionContext"

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
          <SyncSessionProvider>
            <XRPLWalletProvider>
              {children}
            </XRPLWalletProvider>
          </SyncSessionProvider>
        </XamanProvider>
      </JoeyWcProvider>
    </ThemeProvider>
  )
}
