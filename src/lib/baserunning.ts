import { type Outcome } from './game-engine'

export interface Bases {
  first: string | null
  second: string | null
  third: string | null
}

export interface BasesResult {
  newBases: Bases
  runsScored: number
  rbi: number
  outRecorded: boolean
}

export function advanceBases(
  outcome: Outcome,
  bases: Bases,
  batterId: string
): BasesResult {
  switch (outcome) {
    case 'HR': {
      const runnersScoring = [bases.first, bases.second, bases.third].filter(Boolean).length
      return {
        newBases: { first: null, second: null, third: null },
        runsScored: runnersScoring + 1,
        rbi: runnersScoring + 1,
        outRecorded: false,
      }
    }

    case 'TRIPLE': {
      const runnersScoring = [bases.first, bases.second, bases.third].filter(Boolean).length
      return {
        newBases: { first: null, second: null, third: batterId },
        runsScored: runnersScoring,
        rbi: runnersScoring,
        outRecorded: false,
      }
    }

    case 'DOUBLE': {
      const runnersScoring = [bases.second, bases.third].filter(Boolean).length
      return {
        newBases: { first: null, second: batterId, third: bases.first },
        runsScored: runnersScoring,
        rbi: runnersScoring,
        outRecorded: false,
      }
    }

    case 'SINGLE': {
      const runsScored = bases.third ? 1 : 0
      return {
        newBases: { first: batterId, second: bases.first, third: bases.second },
        runsScored,
        rbi: runsScored,
        outRecorded: false,
      }
    }

    case 'WALK': {
      if (bases.first && bases.second && bases.third) {
        return {
          newBases: { first: batterId, second: bases.first, third: bases.second },
          runsScored: 1,
          rbi: 1,
          outRecorded: false,
        }
      }
      if (bases.first && bases.second) {
        return {
          newBases: { first: batterId, second: bases.first, third: bases.second },
          runsScored: 0,
          rbi: 0,
          outRecorded: false,
        }
      }
      if (bases.first) {
        return {
          newBases: { first: batterId, second: bases.first, third: bases.third },
          runsScored: 0,
          rbi: 0,
          outRecorded: false,
        }
      }
      return {
        newBases: { first: batterId, second: bases.second, third: bases.third },
        runsScored: 0,
        rbi: 0,
        outRecorded: false,
      }
    }

    case 'GROUNDOUT':
    case 'FLYOUT':
    case 'STRIKEOUT':
      return {
        newBases: { ...bases },
        runsScored: 0,
        rbi: 0,
        outRecorded: true,
      }
  }
}

export function describePlay(name: string, outcome: Outcome, runsScored: number): string {
  const lastName = name.split(' ').at(-1) ?? name
  switch (outcome) {
    case 'HR':
      return runsScored === 1
        ? `${lastName} — Solo HR`
        : `${lastName} — ${runsScored}-run HR`
    case 'TRIPLE':
      return runsScored > 0
        ? `${lastName} — Triple, ${runsScored} score`
        : `${lastName} — Triple`
    case 'DOUBLE':
      return runsScored > 0
        ? `${lastName} — Double, ${runsScored} score`
        : `${lastName} — Double`
    case 'SINGLE':
      return runsScored > 0
        ? `${lastName} — Single, scores`
        : `${lastName} — Single`
    case 'WALK':
      return runsScored > 0
        ? `${lastName} — Walk, scores`
        : `${lastName} — Walk`
    case 'GROUNDOUT': return `${lastName} — Groundout`
    case 'FLYOUT':    return `${lastName} — Flyout`
    case 'STRIKEOUT': return `${lastName} — Strikeout`
  }
}
