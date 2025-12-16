// app/providers.tsx
"use client"

import { ThemeProvider } from "next-themes"
import { XamanProvider } from '@/app/contexts/XamanContext';

export const Providers: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <XamanProvider>
        {children}
      </XamanProvider>
    </ThemeProvider>
  )
}