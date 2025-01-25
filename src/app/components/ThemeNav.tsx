// components/ThemeNav.tsx
"use client"

import { ThemeToggle } from "@/app/components/ThemeToggle"
import { LanguageSwitcher } from "@/app/components/LanguageSwitcher"

export function ThemeNav() {
  return (
    <div className="fixed top-4 right-4 flex items-center gap-2">
      <ThemeToggle />
      <LanguageSwitcher />
    </div>
  )
}