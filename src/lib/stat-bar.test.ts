import { describe, it, expect } from 'vitest'
import { statBar } from './stat-bar'

describe('statBar', () => {
  it('renders 10 chars for value 5', () => {
    expect(statBar(5)).toHaveLength(10)
    expect(statBar(5)).toBe('█████░░░░░')
  })

  it('renders all filled for value 10', () => {
    expect(statBar(10)).toBe('██████████')
  })

  it('renders all empty for value 0', () => {
    expect(statBar(0)).toBe('░░░░░░░░░░')
  })

  it('clamps values above 10 without throwing', () => {
    expect(() => statBar(15)).not.toThrow()
    expect(statBar(15)).toBe('██████████')
  })

  it('clamps negative values without throwing', () => {
    expect(() => statBar(-1)).not.toThrow()
    expect(statBar(-1)).toBe('░░░░░░░░░░')
  })
})
