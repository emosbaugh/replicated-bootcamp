'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { AsciiBoard } from '@/components/AsciiBoard'
import type { GameState } from '@/app/api/game/types'

export default function GamePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [lastCpuLog, setLastCpuLog] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') loadCurrentGame()
  }, [status])

  async function loadCurrentGame() {
    const res = await fetch('/api/game/current')
    const data = await res.json()
    if (data?.id) setGameState(data)
  }

  async function startGame() {
    setStarting(true)
    setError('')
    const res = await fetch('/api/game/start', { method: 'POST' })
    const data = await res.json()
    setStarting(false)
    if (!res.ok) {
      setError(data.error ?? 'Failed to start game')
      return
    }
    setLastCpuLog(data.lastCpuLog ?? [])
    setGameState(data)
  }

  async function handleAtBat() {
    if (!gameState) return
    setLoading(true)
    setError('')
    const res = await fetch('/api/game/at-bat', { method: 'POST' })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) {
      setError(data.error ?? 'Error processing at-bat')
      return
    }
    setLastCpuLog(data.lastCpuLog ?? [])
    setGameState(data)
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <pre className="font-mono text-green-400">LOADING...</pre>
      </div>
    )
  }

  if (!gameState) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4">
        <pre className="font-mono text-green-400 text-xl">{`⚾  BASEBALL DICE GAME  ⚾`}</pre>
        {error && <pre className="font-mono text-red-400 text-sm">{error}</pre>}
        <button
          onClick={startGame}
          disabled={starting}
          className="border border-green-400 text-green-400 font-mono px-8 py-3 text-sm hover:bg-green-400 hover:text-black disabled:opacity-50"
        >
          {starting ? '  STARTING GAME...  ' : '  NEW GAME  '}
        </button>
        <button
          onClick={() => router.push('/stats')}
          className="font-mono text-xs text-green-600 hover:text-green-400"
        >
          VIEW ROSTER + STATS →
        </button>
      </div>
    )
  }

  return (
    <div>
      <AsciiBoard
        state={gameState}
        lastCpuLog={lastCpuLog}
        onAtBat={handleAtBat}
        loading={loading}
      />
      {error && (
        <pre className="font-mono text-red-400 text-xs text-center">{error}</pre>
      )}
      <div className="flex justify-center gap-6 pb-4">
        <button
          onClick={() => router.push('/stats')}
          className="font-mono text-xs text-green-600 hover:text-green-400"
        >
          ROSTER / STATS
        </button>
        {gameState.status === 'completed' && (
          <button
            onClick={() => { setGameState(null); setLastCpuLog([]) }}
            className="font-mono text-xs text-green-600 hover:text-green-400"
          >
            NEW GAME
          </button>
        )}
      </div>
    </div>
  )
}
