interface BatterRow {
  number: number
  name: string
  position: string
  season: {
    games: number; atBats: number; hits: number
    homeRuns: number; rbi: number; walks: number; strikeouts: number
  } | null
}

interface PitcherRow {
  number: number
  name: string
  position: string
  season: {
    gamesStarted: number; inningsPitched: number; hitsAllowed: number
    walksAllowed: number; strikeoutsThrown: number; earnedRuns: number
  } | null
}

interface Props {
  teamName: string
  franchiseName: string
  batters: BatterRow[]
  pitchers: PitcherRow[]
}

function avg(hits: number, ab: number): string {
  if (ab === 0) return '.000'
  return (hits / ab).toFixed(3).replace('0.', '.')
}

function era(er: number, ip: number): string {
  if (ip === 0) return '0.00'
  return ((er * 9) / ip).toFixed(2)
}

export function AsciiStats({ teamName, franchiseName, batters, pitchers }: Props) {
  const header = [
    `╔═══════════════════════════════════════════════════════════════════╗`,
    `║  ${franchiseName.toUpperCase().padEnd(65)}║`,
    `║  ${teamName.padEnd(65)}║`,
    `╠═══════════════════════════════════════════════════════════════════╣`,
    `║  BATTING                                                          ║`,
    `║  #    NAME                POS   G    AB    H   HR  RBI   AVG     ║`,
    `║  ─────────────────────────────────────────────────────────────── ║`,
  ].join('\n')

  const batterRows = batters.map((b) => {
    const s = b.season
    const g   = String(s?.games ?? 0).padStart(3)
    const ab  = String(s?.atBats ?? 0).padStart(4)
    const h   = String(s?.hits ?? 0).padStart(4)
    const hr  = String(s?.homeRuns ?? 0).padStart(4)
    const rbi = String(s?.rbi ?? 0).padStart(4)
    const a   = avg(s?.hits ?? 0, s?.atBats ?? 0)
    const num = String(b.number).padStart(3)
    const name = b.name.slice(0, 18).padEnd(18)
    const pos = b.position.padEnd(3)
    return `║  ${num}  ${name}  ${pos}  ${g}  ${ab}  ${h}  ${hr}  ${rbi}  ${a}   ║`
  })

  const pitcherHeader = [
    `╠═══════════════════════════════════════════════════════════════════╣`,
    `║  PITCHING                                                         ║`,
    `║  #    NAME                POS   G    IP    H   BB    K   ERA     ║`,
    `║  ─────────────────────────────────────────────────────────────── ║`,
  ].join('\n')

  const pitcherRows = pitchers.map((p) => {
    const s = p.season
    const g   = String(s?.gamesStarted ?? 0).padStart(3)
    const ip  = String(s?.inningsPitched ?? 0).padStart(5)
    const h   = String(s?.hitsAllowed ?? 0).padStart(4)
    const bb  = String(s?.walksAllowed ?? 0).padStart(4)
    const k   = String(s?.strikeoutsThrown ?? 0).padStart(4)
    const e   = era(s?.earnedRuns ?? 0, s?.inningsPitched ?? 0)
    const num = String(p.number).padStart(3)
    const name = p.name.slice(0, 18).padEnd(18)
    const pos = p.position.padEnd(3)
    return `║  ${num}  ${name}  ${pos}  ${g}  ${ip}  ${h}  ${bb}  ${k}  ${e}  ║`
  })

  const footer = `╚═══════════════════════════════════════════════════════════════════╝`

  const board = [header, ...batterRows, pitcherHeader, ...pitcherRows, footer].join('\n')

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-start p-4 pt-8">
      <pre className="font-mono text-green-400 text-sm leading-tight whitespace-pre overflow-x-auto">
        {board}
      </pre>
    </div>
  )
}
