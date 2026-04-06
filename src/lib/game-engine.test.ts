import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolveAtBat } from './game-engine'

afterEach(() => vi.restoreAllMocks())

function mockRoll(die1: number, die2: number) {
  // Math.floor(Math.random() * 6) + 1 for each die
  vi.spyOn(Math, 'random')
    .mockReturnValueOnce((die1 - 1) / 6)
    .mockReturnValueOnce((die2 - 1) / 6)
}

describe('resolveAtBat', () => {
  it('returns HR on roll 12 with no modifiers (contact=5, power=5, pitching=1)', () => {
    mockRoll(6, 6) // roll 12
    expect(resolveAtBat({ contact: 5, power: 5 }, { pitching: 1 })).toBe('HR')
  })

  it('returns STRIKEOUT on roll 2 with no modifiers', () => {
    mockRoll(1, 1) // roll 2
    expect(resolveAtBat({ contact: 5, power: 5 }, { pitching: 1 })).toBe('STRIKEOUT')
  })

  it('returns SINGLE on roll 8 with average batter vs weak pitcher', () => {
    mockRoll(4, 4) // roll 8
    expect(resolveAtBat({ contact: 5, power: 5 }, { pitching: 1 })).toBe('SINGLE')
  })

  it('high contact batter shifts roll up toward hits', () => {
    // contact=10 gives +2 bonus
    // roll 6 + 2 = 8 → SINGLE
    mockRoll(3, 3) // roll 6 → FLYOUT without bonus
    const result = resolveAtBat({ contact: 10, power: 5 }, { pitching: 1 })
    expect(result).toBe('SINGLE') // 6 + 2 contact bonus = 8 → SINGLE
  })

  it('ace pitcher reduces roll toward outs', () => {
    // pitching=10 gives -2 penalty
    // roll 8 - 2 = 6 → FLYOUT instead of SINGLE
    mockRoll(4, 4) // roll 8 → SINGLE without penalty
    const result = resolveAtBat({ contact: 5, power: 5 }, { pitching: 10 })
    expect(result).toBe('FLYOUT') // 8 - 2 = 6 → FLYOUT
  })

  it('returns TRIPLE on roll 9 with no modifiers', () => {
    mockRoll(4, 5) // roll 9
    expect(resolveAtBat({ contact: 5, power: 5 }, { pitching: 1 })).toBe('TRIPLE')
  })

  it('clamps adjusted roll to 2 minimum', () => {
    // contact=1, power=1, pitching=10: adj = -2 + -1 + -2 = -5, roll 2 → max(2, 2-5)=2
    mockRoll(1, 1) // roll 2
    expect(resolveAtBat({ contact: 1, power: 1 }, { pitching: 10 })).toBe('STRIKEOUT')
  })

  it('clamps adjusted roll to 12 maximum', () => {
    // contact=10, power=10, pitching=1: adj = +2+1-0=3, roll 12 → min(12,15)=12
    mockRoll(6, 6) // roll 12
    expect(resolveAtBat({ contact: 10, power: 10 }, { pitching: 1 })).toBe('HR')
  })
})
