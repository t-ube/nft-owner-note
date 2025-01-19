"use client";

// app/providers.tsx
import { XrplProvider } from "@/app/contexts/XrplContext"

export const Providers: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <XrplProvider>
      {children}
    </XrplProvider>
  );
};
