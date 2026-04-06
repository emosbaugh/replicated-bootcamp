'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { AsciiStats } from '@/components/AsciiStats'

interface RosterData {
  team: { name: string; abbr: string; franchiseName: string }
  batters: Array<{
    id: string; number: number; name: string; position: string
    season: { games: number; atBats: number; hits: number; homeRuns: number; rbi: number; walks: number; strikeouts: number } | null
  }>
  pitchers: Array<{
    id: string; number: number; name: string; position: string
    season: { gamesStarted: number; inningsPitched: number; hitsAllowed: number; walksAllowed: number; strikeoutsThrown: number; earnedRuns: number } | null
  }>
}

export default function StatsPage() {
  const { status } = useSession()
  const router = useRouter()
  const [roster, setRoster] = useState<RosterData | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') {
      fetch('/api/roster').then((r) => r.json()).then(setRoster)
    }
  }, [status])

  if (!roster) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <pre className="font-mono text-green-400">LOADING ROSTER...</pre>
      </div>
    )
  }

  return (
    <div>
      <AsciiStats
        teamName={roster.team.name}
        franchiseName={roster.team.franchiseName}
        batters={roster.batters}
        pitchers={roster.pitchers}
      />
      <div className="flex justify-center pb-4">
        <button
          onClick={() => router.push('/game')}
          className="font-mono text-xs text-green-600 hover:text-green-400"
        >
          ← BACK TO GAME
        </button>
      </div>
    </div>
  )
}
