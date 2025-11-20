'use client'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Project, AddressInfo, dbManager } from '@/utils/db'
/*
export function Tracker() {
  useEffect(() => {
    fetch('/api/track', { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: window.location.pathname,
        full_url: window.location.href,
      })
    })
  }, [])

  return null
}
*/

interface TrackPayload {
  path: string
  project_id?: string
  issuer?: string
  taxon?: number | null
  owner_list_count?: number
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

    let project: Project | undefined
    let ownerListCount: number | undefined
    let cancelled = false

    const run = async () => {
      // IndexedDB から「登録オーナー数」を取得

      if (projectId) {
        // プロジェクト情報を逆引き
        project = await dbManager.getProjectByProjectId(projectId)
      }

      console.log(project);

      const infos: AddressInfo[] = await dbManager.getAllAddressInfos()
      ownerListCount = infos.length

      if (cancelled) return

      const payload: TrackPayload = {
        path: pathname,
      }

      if (project) {
        const rawTaxon = project?.taxon ?? null
        let taxon: number | null = null
        if (typeof rawTaxon === 'string') {
          const parsed = Number(rawTaxon)
          taxon = Number.isFinite(parsed) ? parsed : null
        } else if (typeof rawTaxon === 'number') {
          taxon = rawTaxon
        }

        payload.project_id = project.projectId
        payload.issuer = project.issuer
        payload.taxon = taxon
      }

      if (typeof ownerListCount === 'number') {
        payload.owner_list_count = ownerListCount
      }

      // API に送信
      await fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    }

    run()

    return () => {
      cancelled = true
    }
  }, [pathname])

  return null
}