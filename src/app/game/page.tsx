'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { AsciiBoard } from '@/components/AsciiBoard'
import { AtBatScreen } from '@/components/AtBatScreen'
import type { GameState } from '@/app/api/game/types'

export default function GamePage() {
  const { status } = useSession()
  const router = useRouter()
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [lastCpuLog, setLastCpuLog] = useState<string[]>([])
  const [lastRoll, setLastRoll] = useState<GameState['lastRoll']>(undefined)
  const [loading, setLoading] = useState(false)
  const [starting, setStarting] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/')
  }, [status, router])

  const loadCurrentGame = useCallback(async () => {
    const res = await fetch('/api/game/current')
    const data = await res.json()
    if (data?.id) setGameState(data)
  }, [])

  useEffect(() => {
    if (status === 'authenticated') loadCurrentGame()
  }, [status, loadCurrentGame])

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

  async function handleSimulate() {
    setSimulating(true)
    setError('')
    const res = await fetch('/api/game/simulate', { method: 'POST' })
    const data = await res.json()
    setSimulating(false)
    if (!res.ok) {
      setError(data.error ?? 'Error simulating game')
      return
    }
    setLastCpuLog([])
    setGameState(data)
  }

  async function handleAtBat() {
    if (!gameState) return
    setLoading(true)
    setLastRoll(undefined)
    setError('')
    const res = await fetch('/api/game/at-bat', { method: 'POST' })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Error processing at-bat')
      setLoading(false)
      return
    }
    setLastCpuLog(data.lastCpuLog ?? [])
    setGameState(data)
    setLastRoll(data.lastRoll ?? undefined)
    // Do NOT call setLoading(false) here — AtBatScreen calls onAtBatDone when animation completes
  }

  const onAtBatDone = useCallback(() => {
    setLoading(false)
    setLastRoll(undefined)
  }, [])

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
        <pre className="font-mono text-green-400 text-xl">{`⚾  PLAYBALL.EXE  ⚾`}</pre>
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
          VIEW ROSTER + STATS -&gt;
        </button>
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          className="font-mono text-xs text-green-600 hover:text-green-400"
        >
          LOGOUT
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between p-4">
        <button
          onClick={() => router.push('/stats')}
          className="font-mono text-xs text-green-600 hover:text-green-400"
        >
          ROSTER / STATS -&gt;
        </button>
        <div className="flex gap-4">
          {gameState.status === 'completed' && (
            <button
              onClick={() => { setGameState(null); setLastCpuLog([]) }}
              className="font-mono text-xs text-green-600 hover:text-green-400"
            >
              NEW GAME
            </button>
          )}
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="font-mono text-xs text-green-600 hover:text-green-400"
          >
            LOGOUT
          </button>
        </div>
      </div>

      {loading ? (
        <AtBatScreen
          batter={gameState.currentBatter}
          lastRoll={lastRoll}
          onDone={onAtBatDone}
        />
      ) : (
        <AsciiBoard
          state={gameState}
          lastCpuLog={lastCpuLog}
          onAtBat={handleAtBat}
          onSimulate={handleSimulate}
          loading={loading}
          simulating={simulating}
        />
      )}

      {error && !loading && (
        <pre className="font-mono text-red-400 text-xs text-center">{error}</pre>
      )}
    </div>
  )
}
