'use client'

import { useState, useEffect } from 'react'

type Update = {
  versionLabel: string
  releaseNotes: string
}

export function UpdateBanner() {
  const [update, setUpdate] = useState<Update | null>(null)

  useEffect(() => {
    async function checkForUpdates() {
      try {
        const res = await fetch('/api/updates')
        if (!res.ok) {
          console.warn('[updates] unexpected response', res.status)
          return
        }
        const data: Update[] = await res.json()
        if (data.length > 0) {
          setUpdate(data[0])
        } else {
          setUpdate(null)
        }
      } catch {
        // preserve current banner state on transient failures
      }
    }

    checkForUpdates()
    const interval = setInterval(checkForUpdates, 60_000)
    return () => clearInterval(interval)
  }, [])

  if (!update) return null

  return (
    <div className="sticky top-0 left-0 right-0 z-50 bg-black border-b border-yellow-400 font-mono text-xs text-yellow-400 text-center py-2 px-4">
      UPDATE AVAILABLE: v{update.versionLabel} — {update.releaseNotes}
    </div>
  )
}
