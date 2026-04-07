import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolveAtBat } from './game-engine'

afterEach(() => vi.restoreAllMocks())

function mockRoll(die1: number, die2: number) {
  vi.spyOn(Math, 'random')
    .mockReturnValueOnce((die1 - 1) / 6)
    .mockReturnValueOnce((die2 - 1) / 6)
}

describe('resolveAtBat', () => {
  it('returns HR on roll 12 with no modifiers (contact=5, power=5, pitching=1)', () => {
    mockRoll(6, 6)
    const result = resolveAtBat({ contact: 5, power: 5 }, { pitching: 1 })
    expect(result.outcome).toBe('HR')
    expect(result.die1).toBe(6)
    expect(result.die2).toBe(6)
    expect(result.adjusted).toBe(12)
    expect(result.net).toBe(0)
  })

  it('returns STRIKEOUT on roll 2 with no modifiers', () => {
    mockRoll(1, 1)
    const result = resolveAtBat({ contact: 5, power: 5 }, { pitching: 1 })
    expect(result.outcome).toBe('STRIKEOUT')
    expect(result.die1).toBe(1)
    expect(result.die2).toBe(1)
    expect(result.adjusted).toBe(2)
  })

  it('returns SINGLE on roll 8 with average batter vs weak pitcher', () => {
    mockRoll(4, 4)
    const result = resolveAtBat({ contact: 5, power: 5 }, { pitching: 1 })
    expect(result.outcome).toBe('SINGLE')
    expect(result.adjusted).toBe(8)
  })

  it('high contact batter shifts roll up toward hits', () => {
    mockRoll(3, 3) // roll 6 → FLYOUT without bonus
    const result = resolveAtBat({ contact: 10, power: 5 }, { pitching: 1 })
    expect(result.outcome).toBe('SINGLE') // 6 + 2 contact bonus = 8 → SINGLE
    expect(result.net).toBe(2)
    expect(result.adjusted).toBe(8)
  })

  it('ace pitcher reduces roll toward outs', () => {
    mockRoll(4, 4) // roll 8 → SINGLE without penalty
    const result = resolveAtBat({ contact: 5, power: 5 }, { pitching: 10 })
    expect(result.outcome).toBe('FLYOUT') // 8 - 2 = 6 → FLYOUT
    expect(result.net).toBe(-2)
    expect(result.adjusted).toBe(6)
  })

  it('returns TRIPLE on roll 9 with no modifiers', () => {
    mockRoll(4, 5)
    const result = resolveAtBat({ contact: 5, power: 5 }, { pitching: 1 })
    expect(result.outcome).toBe('TRIPLE')
    expect(result.adjusted).toBe(9)
  })

  it('clamps adjusted roll to 2 minimum', () => {
    mockRoll(1, 1)
    const result = resolveAtBat({ contact: 1, power: 1 }, { pitching: 10 })
    expect(result.outcome).toBe('STRIKEOUT')
    expect(result.adjusted).toBe(2)
  })

  it('clamps adjusted roll to 12 maximum', () => {
    mockRoll(6, 6)
    const result = resolveAtBat({ contact: 10, power: 10 }, { pitching: 1 })
    expect(result.outcome).toBe('HR')
    expect(result.adjusted).toBe(12)
  })
})
