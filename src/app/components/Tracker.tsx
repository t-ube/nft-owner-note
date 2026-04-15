'use client'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Project, AddressInfo, dbManager } from '@/utils/db'
import { supabaseBrowser } from '@/lib/supabase/client'

const USER_ID_STORAGE_KEY = 'user_id'

function getOrCreateUserId(): string {
  try {
    let id = localStorage.getItem(USER_ID_STORAGE_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(USER_ID_STORAGE_KEY, id)
    }
    return id
  } catch {
    return crypto.randomUUID()
  }
}

const extractProjectId = (pathname: string): string | null => {
  const segments = pathname.split('/').filter(Boolean)
  const projectsIndex = segments.indexOf('projects')
  if (projectsIndex === -1) return null

  const id = segments[projectsIndex + 1]
  return id ?? null
}

export function Tracker() {
  const pathname = usePathname()

  useEffect(() => {
    const projectId = extractProjectId(pathname)

    let cancelled = false

    const run = async () => {
      let project: Project | undefined
      if (projectId) {
        project = await dbManager.getProjectByProjectId(projectId)
      }

      const infos: AddressInfo[] = await dbManager.getAllAddressInfos()
      const ownerListCount = infos.length

      if (cancelled) return

      let taxon: number | null = null
      if (project) {
        const rawTaxon = project.taxon ?? null
        if (typeof rawTaxon === 'string') {
          const parsed = Number(rawTaxon)
          taxon = Number.isFinite(parsed) ? parsed : null
        } else if (typeof rawTaxon === 'number') {
          taxon = rawTaxon
        }
      }

      const row = {
        user_id: getOrCreateUserId(),
        path: window.location.href,
        ip: null,
        user_agent: navigator.userAgent,
        owner_list_count: ownerListCount,
        issuer: project?.issuer ?? null,
        taxon,
      }

      const { error } = await supabaseBrowser.from('visits').insert([row])
      if (error) {
        console.error('Tracker insert error:', error)
      }
    }

    run()

    return () => {
      cancelled = true
    }
  }, [pathname])

  return null
}
