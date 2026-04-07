import { resolveAtBat } from './game-engine'
import { advanceBases, describePlay, type Bases } from './baserunning'

export interface CpuBatter {
  id: string
  name: string
  contact: number
  power: number
}

export interface CpuPitcher {
  pitching: number
}

export interface CpuHalfInningResult {
  score: number
  log: string[]
  newLineupPosition: number
}

export function runCpuHalfInning(
  lineup: CpuBatter[],
  pitcher: CpuPitcher,
  startPosition: number
): CpuHalfInningResult {
  let outs = 0
  let bases: Bases = { first: null, second: null, third: null }
  let score = 0
  let position = startPosition
  const log: string[] = []

  while (outs < 3) {
    const batter = lineup[position % 9]
    const atBatResult = resolveAtBat(batter, pitcher)
    const result = advanceBases(atBatResult.outcome, bases, batter.id)

    bases = result.newBases
    score += result.runsScored
    if (result.outRecorded) outs++
    log.push(describePlay(batter.name, atBatResult.outcome, result.runsScored))
    position++
  }

  return { score, log, newLineupPosition: position % 9 }
}
