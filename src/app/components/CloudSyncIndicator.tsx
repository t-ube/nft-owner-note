'use client'

// Small fixed-position badge that shows while a cloud sync is in flight.
// Mounted globally inside SyncSessionProvider so it appears on every
// route. Hidden when no sync is active.

import { RefreshCw } from 'lucide-react'

interface CloudSyncIndicatorProps {
  active: boolean
}

export function CloudSyncIndicator({ active }: CloudSyncIndicatorProps) {
  if (!active) return null
  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border bg-white/90 px-3 py-1.5 text-xs text-gray-700 shadow-md backdrop-blur dark:bg-gray-800/90 dark:text-gray-200 dark:border-gray-700"
      role="status"
      aria-live="polite"
    >
      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
      <span>Syncing…</span>
    </div>
  )
}
