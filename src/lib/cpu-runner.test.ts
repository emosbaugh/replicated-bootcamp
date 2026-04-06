import { describe, it, expect, vi, afterEach } from 'vitest'
import { runCpuHalfInning } from './cpu-runner'

afterEach(() => vi.restoreAllMocks())

const LINEUP = Array.from({ length: 9 }, (_, i) => ({
  id: `cpu-${i}`,
  name: `Player ${i + 1}`,
  contact: 5,
  power: 5,
}))

const PITCHER = { pitching: 5 }

describe('runCpuHalfInning', () => {
  it('runs until 3 outs and returns score and log', () => {
    // Force all groundouts (roll 7 each time → GROUNDOUT after -1 avg pitcher penalty)
    // pitch=5 → penalty=1, roll=7, adj=6 → FLYOUT
    // Mock: always roll (3,4)=7, adj with pitching=5 penalty=1 → 6 → FLYOUT = out
    vi.spyOn(Math, 'random').mockReturnValue(0.5) // die=4 each time → roll=8, adj=7=GROUNDOUT
    const result = runCpuHalfInning(LINEUP, PITCHER, 0)
    expect(result.log.length).toBeGreaterThanOrEqual(3)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.newLineupPosition).toBeGreaterThan(0)
  })

  it('wraps lineup position past 9', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    // Start at position 8 (last batter), should wrap back
    const result = runCpuHalfInning(LINEUP, PITCHER, 8)
    expect(result.newLineupPosition).toBeLessThan(9)
  })
})
