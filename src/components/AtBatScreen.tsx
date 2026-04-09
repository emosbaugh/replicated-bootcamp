'use client'

import { useState, useEffect, useRef } from 'react'
import type { GameState } from '@/app/api/game/types'
import { statBar } from '@/lib/stat-bar'

const OUTCOME_TABLE: Record<number, string> = {
  2: 'STRIKEOUT', 3: 'STRIKEOUT', 4: 'GROUNDOUT', 5: 'GROUNDOUT',
  6: 'FLYOUT', 7: 'GROUNDOUT', 8: 'SINGLE', 9: 'TRIPLE',
  10: 'DOUBLE', 11: 'WALK', 12: 'HOME RUN',
}

interface Props {
  batter: GameState['currentBatter']
  lastRoll: GameState['lastRoll']
  onDone: () => void
  aiCommentaryEnabled: boolean
}

function contactBonus(c: number) { return Math.round((c - 5.5) / 2.25) }
function powerBonus(p: number) { return Math.round((p - 5.5) / 4.5) }
function pitcherPenalty(p: number) { return Math.round((p - 1) / 4.5) }
function sgn(n: number) { return (n >= 0 ? '+' : '') + n }
function rd() { return Math.ceil(Math.random() * 6) }

const W = 54
const row = (s: string) => '║' + s.padEnd(W) + '║'
const TOP = '╔' + '═'.repeat(W) + '╗'
const MID = '╠' + '═'.repeat(W) + '╣'
const BOT = '╚' + '═'.repeat(W) + '╝'

export function AtBatScreen({ batter, lastRoll, onDone, aiCommentaryEnabled }: Props) {
  const [die1, setDie1] = useState<number | null>(null)
  const [die2, setDie2] = useState<number | null>(null)
  const [phase, setPhase] = useState<'rolling' | 'landed' | 'done'>('rolling')
  const [showPopup, setShowPopup] = useState(false)
  const [commentary, setCommentary] = useState<string | null | 'loading'>(null)

  const lastRollRef = useRef(lastRoll)
  const flickerEndRef = useRef(Date.now() + 1300)

  useEffect(() => {
    lastRollRef.current = lastRoll
  }, [lastRoll])

  useEffect(() => {
    const interval = setInterval(() => {
      setDie1(rd())
      setDie2(rd())
      if (lastRollRef.current && Date.now() >= flickerEndRef.current) {
        clearInterval(interval)
        setDie1(lastRollRef.current.die1)
        setDie2(lastRollRef.current.die2)
        setPhase('landed')
      }
    }, 80)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (phase === 'landed') {
      const t = setTimeout(() => setPhase('done'), 700)
      return () => clearTimeout(t)
    }
  }, [phase])

  useEffect(() => {
    if (phase !== 'done' || !lastRoll || !aiCommentaryEnabled) return
    const controller = new AbortController()
    const outcome = OUTCOME_TABLE[lastRoll.adjusted] ?? ''
    setCommentary('loading')
    fetch(
      `/api/commentary?outcome=${encodeURIComponent(outcome)}&batter=${encodeURIComponent(batter.name)}`,
      { signal: controller.signal }
    )
      .then((r) => r.json())
      .then((data: { commentary?: string | null }) => setCommentary(data.commentary ?? null))
      .catch((err: Error) => {
        if (err.name !== 'AbortError') setCommentary(null)
      })
    return () => controller.abort()
  }, [phase, lastRoll, batter.name, aiCommentaryEnabled])

  const cb = contactBonus(batter.contact)
  const pb = powerBonus(batter.power)
  const pp = lastRoll ? pitcherPenalty(lastRoll.pitching) : 0
  const pitchingVal = lastRoll?.pitching ?? '?'

  const shortName = batter.name.split(' ').map((s, i) => i === 0 ? s[0] + '.' : s).join(' ')

  const diceRow = `   │ ${die1 ?? '?'} │  +  │ ${die2 ?? '?'} │`

  let rollLine = row('  ROLLING 2d6...')
  let mathLine = row('')
  let resultLine = row('')

  if (phase !== 'rolling' && lastRoll) {
    const raw = lastRoll.die1 + lastRoll.die2
    rollLine = row(`  rolled ${raw}  net ${sgn(lastRoll.net)}  →  adjusted: ${lastRoll.adjusted}`)
    mathLine = row(`  Contact${sgn(cb)} · Power${sgn(pb)} · Pitcher${sgn(-pp)}`)
  }

  if (phase === 'done' && lastRoll) {
    resultLine = row(`         ▸▸  ${OUTCOME_TABLE[lastRoll.adjusted]}  ◂◂`)
  }

  const board = [
    TOP,
    row('         PLATE APPEARANCE         '),
    MID,
    row(`  ${shortName} (#${batter.number} - ${batter.position})   vs   CPU Pitcher`),
    MID,
    row(`  CONTACT  ${batter.contact}  ${statBar(batter.contact)}  [${sgn(cb)}]`),
    row(`  POWER    ${batter.power}  ${statBar(batter.power)}  [${sgn(pb)}]`),
    row(`  PITCHING ${pitchingVal}  ${typeof pitchingVal === 'number' ? statBar(pitchingVal) : '░'.repeat(10)}  [${sgn(-pp)}]`),
    MID,
    rollLine,
    mathLine,
    row('   ┌───┐     ┌───┐'),
    row(diceRow),
    row('   └───┘     └───┘'),
    row(''),
    resultLine,
    MID,
    row('  [ ? ] outcome table'),
    BOT,
  ].join('\n')

  const outcomePopup = (() => {
    const adj = lastRoll?.adjusted
    const lines: Array<string | { text: string; hi: boolean }> = [
      '╔══ 2d6 OUTCOME TABLE ══════════╗',
      '║   roll   outcome               ║',
      '╠═══════════════════════════════╣',
      ...Object.entries(OUTCOME_TABLE).map(([k, v]) => {
        const r = parseInt(k)
        const arrow = r === adj ? '→' : ' '
        const marker = r === adj ? ' ◂' : ''
        return { text: `║  ${arrow} ${String(r).padStart(2)}    ${v.padEnd(13)}║${marker}`, hi: r === adj }
      }),
      '╚═══════════════════════════════╝',
    ]
    return lines
  })()

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
      <pre
        style={{ fontFamily: "'Courier New', Courier, monospace" }}
        className="text-sm leading-tight whitespace-pre"
      >
        {board.split('\n').map((line, i) => {
          const isRolling = line === rollLine || line === mathLine ||
            line.includes('┌───┐') || line.includes('│') || line.includes('└───┘')
          const isResult = line === resultLine && phase === 'done'
          const isLink = line.includes('[ ? ] outcome table')
          const color = isResult ? '#86efac' : isRolling && phase !== 'done' ? '#facc15' : '#4ade80'
          if (isLink) {
            const linkText = '[ ? ] outcome table'
            const linkIdx = line.indexOf(linkText)
            const prefix = line.substring(0, linkIdx)
            const suffix = line.substring(linkIdx + linkText.length)
            return (
              <span key={i} style={{ color: '#4ade80' }}>
                {prefix}
                <span
                  style={{ color: '#60a5fa', textDecoration: 'underline', cursor: 'pointer' }}
                  onClick={() => setShowPopup(true)}
                >
                  {linkText}
                </span>
                {suffix}
                {'\n'}
              </span>
            )
          }
          return <span key={i} style={{ color }}>{line}{'\n'}</span>
        })}
      </pre>

      {phase === 'done' && commentary === 'loading' && (
        <pre
          style={{ fontFamily: "'Courier New', Courier, monospace" }}
          className="text-yellow-400 text-xs mt-6 animate-pulse"
        >
          GENERATING COMMENTARY...
        </pre>
      )}

      {phase === 'done' && commentary !== null && commentary !== 'loading' && (
        <pre
          style={{ fontFamily: "'Courier New', Courier, monospace" }}
          className="text-cyan-300 text-xs mt-4 max-w-sm text-center whitespace-pre-wrap"
        >
          {commentary}
        </pre>
      )}

      {phase === 'done' && commentary !== 'loading' && (
        <button
          onClick={onDone}
          className="font-mono text-black bg-green-400 hover:bg-green-300 px-8 py-3 text-sm tracking-widest mt-4"
        >
          CONTINUE
        </button>
      )}

      {showPopup && (
        <div
          className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center cursor-pointer"
          onClick={() => setShowPopup(false)}
        >
          <pre
            style={{ fontFamily: "'Courier New', Courier, monospace" }}
            className="text-sm leading-tight whitespace-pre"
          >
            {outcomePopup.map((entry, i) => {
              if (typeof entry === 'string') {
                return <span key={i} style={{ color: '#4ade80' }}>{entry}{'\n'}</span>
              }
              return (
                <span key={i} style={{ color: entry.hi ? '#facc15' : '#4ade80', fontWeight: entry.hi ? 'bold' : 'normal' }}>
                  {entry.text}{'\n'}
                </span>
              )
            })}
            <span style={{ color: '#4ade80' }}>{'\n'}  click anywhere to close</span>
          </pre>
        </div>
      )}
    </div>
  )
}
