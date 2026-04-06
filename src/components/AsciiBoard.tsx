'use client'

import type { GameState } from '@/app/api/game/types'

interface Props {
  state: GameState
  lastCpuLog?: string[]
  onAtBat: () => void
  loading: boolean
}

function outPips(outs: number) {
  return [0, 1, 2].map((i) => (i < outs ? '●' : '○')).join('  ')
}

function runnerSymbol(occupied: boolean) {
  return occupied ? '●' : '○'
}

export function AsciiBoard({ state, lastCpuLog, onAtBat, loading }: Props) {
  const { inning, halfInning, outs, homeScore, awayScore, runnersOnBase,
          currentBatter, gameLog, userTeam, cpuTeam, status, result } = state

  const inningStr = `INNING ${inning} ${halfInning === 'bot' ? '▼' : '▲'}`
  const awayAbbr = cpuTeam.abbr.padEnd(3)
  const homeAbbr = userTeam.abbr.padEnd(3)

  const b = currentBatter
  const shortName = b.name.split(' ').map((s, i) => i === 0 ? s[0] + '.' : s).join(' ')
  const avgStr = b.seasonStats.avg.padStart(4)

  const gameOverMsg = status === 'completed'
    ? result === 'user_win' ? '  ★ YOU WIN! ★'
    : result === 'cpu_win' ? '  COMPUTER WINS'
    : '  FINAL — TIE'
    : ''

  const board = [
    `╔══════════════════════════════════════════════════════╗`,
    `║  ${userTeam.franchiseName.toUpperCase().padEnd(20)}${inningStr.padStart(30)}  ║`,
    `╠══════════════════════════════════════════════════════╣`,
    `║  SCORE:  ${awayAbbr} ${String(awayScore).padStart(2)}  |  ${homeAbbr} ${String(homeScore).padStart(2)}                          ║`,
    `║  OUTS:   [ ${outPips(outs)} ]                                ║`,
    `╠══════════════════════════════════════════════════════╣`,
    `║                        2B                            ║`,
    `║                    ${runnerSymbol(!!runnersOnBase.second)}                         ║`,
    `║             3B                1B                     ║`,
    `║          ${runnerSymbol(!!runnersOnBase.third)}                    ${runnerSymbol(!!runnersOnBase.first)}            ║`,
    `║                    ${runnerSymbol(false)}                         ║`,
    `║                   HOME                               ║`,
    `╠══════════════════════════════════════════════════════╣`,
    `║  AT BAT:  ${shortName.padEnd(18)}(#${String(b.number).padStart(2)} · ${b.position.padEnd(2)})  ║`,
    `║  ${avgStr} AVG  ·  ${String(b.seasonStats.hr).padStart(2)} HR  ·  ${String(b.seasonStats.rbi).padStart(3)} RBI  (season)       ║`,
    `╠══════════════════════════════════════════════════════╣`,
    `║  ${(gameLog[0] ?? '—').slice(0, 52).padEnd(52)}  ║`,
    `╚══════════════════════════════════════════════════════╝`,
  ].join('\n')

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
      <pre className="font-mono text-green-400 text-sm leading-tight whitespace-pre">
        {board}
      </pre>

      {lastCpuLog && lastCpuLog.length > 0 && (
        <pre className="font-mono text-yellow-400 text-xs mt-2 whitespace-pre">
          {`  ${cpuTeam.abbr} half-inning:\n`}
          {lastCpuLog.map((l) => `    ${l}`).join('\n')}
        </pre>
      )}

      {status === 'in_progress' ? (
        <button
          onClick={onAtBat}
          disabled={loading}
          className="mt-6 font-mono text-black bg-green-400 hover:bg-green-300 disabled:opacity-50 px-8 py-3 text-sm tracking-widest"
        >
          {loading ? '  PITCHING...  ' : '  TAKE PLATE APPEARANCE  '}
        </button>
      ) : (
        <pre className="font-mono text-yellow-300 text-lg mt-4">{gameOverMsg}</pre>
      )}
    </div>
  )
}
