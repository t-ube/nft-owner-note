'use client'
import { useEffect } from 'react'

export function Tracker() {
  useEffect(() => {
    fetch('/api/track', { method: 'POST' })
  }, [])
  return null
}
