import { describe, it, expect } from 'vitest'
import { advanceBases } from './baserunning'

const EMPTY: import('./baserunning').Bases = { first: null, second: null, third: null }

describe('advanceBases', () => {
  it('HR scores all runners including batter', () => {
    const bases = { first: 'p1', second: 'p2', third: 'p3' }
    const r = advanceBases('HR', bases, 'batter')
    expect(r.runsScored).toBe(4)
    expect(r.rbi).toBe(4)
    expect(r.newBases).toEqual(EMPTY)
    expect(r.outRecorded).toBe(false)
  })

  it('solo HR scores 1 run from empty bases', () => {
    const r = advanceBases('HR', EMPTY, 'batter')
    expect(r.runsScored).toBe(1)
    expect(r.rbi).toBe(1)
    expect(r.newBases).toEqual(EMPTY)
  })

  it('TRIPLE clears bases and puts batter on third', () => {
    const bases = { first: 'p1', second: null, third: 'p3' }
    const r = advanceBases('TRIPLE', bases, 'batter')
    expect(r.runsScored).toBe(2)
    expect(r.newBases).toEqual({ first: null, second: null, third: 'batter' })
  })

  it('DOUBLE scores runners on second and third, runner on first to third', () => {
    const bases = { first: 'p1', second: 'p2', third: 'p3' }
    const r = advanceBases('DOUBLE', bases, 'batter')
    expect(r.runsScored).toBe(2)   // p2 and p3 score
    expect(r.rbi).toBe(2)
    expect(r.newBases).toEqual({ first: null, second: 'batter', third: 'p1' })
  })

  it('SINGLE advances all runners one base, scores runner from third', () => {
    const bases = { first: 'p1', second: 'p2', third: 'p3' }
    const r = advanceBases('SINGLE', bases, 'batter')
    expect(r.runsScored).toBe(1)   // p3 scores
    expect(r.rbi).toBe(1)
    expect(r.newBases).toEqual({ first: 'batter', second: 'p1', third: 'p2' })
  })

  it('WALK with bases loaded scores runner from third', () => {
    const bases = { first: 'p1', second: 'p2', third: 'p3' }
    const r = advanceBases('WALK', bases, 'batter')
    expect(r.runsScored).toBe(1)
    expect(r.rbi).toBe(1)
    expect(r.newBases).toEqual({ first: 'batter', second: 'p1', third: 'p2' })
  })

  it('WALK with only first occupied forces runner to second', () => {
    const bases = { first: 'p1', second: null, third: null }
    const r = advanceBases('WALK', bases, 'batter')
    expect(r.runsScored).toBe(0)
    expect(r.newBases).toEqual({ first: 'batter', second: 'p1', third: null })
  })

  it('WALK with empty bases puts batter on first only', () => {
    const r = advanceBases('WALK', EMPTY, 'batter')
    expect(r.newBases).toEqual({ first: 'batter', second: null, third: null })
  })

  it('STRIKEOUT records an out and does not move runners', () => {
    const bases = { first: 'p1', second: null, third: null }
    const r = advanceBases('STRIKEOUT', bases, 'batter')
    expect(r.outRecorded).toBe(true)
    expect(r.runsScored).toBe(0)
    expect(r.newBases).toEqual(bases)
  })

  it('GROUNDOUT records an out and does not move runners', () => {
    const r = advanceBases('GROUNDOUT', EMPTY, 'batter')
    expect(r.outRecorded).toBe(true)
    expect(r.runsScored).toBe(0)
  })

  it('FLYOUT records an out and does not move runners', () => {
    const r = advanceBases('FLYOUT', EMPTY, 'batter')
    expect(r.outRecorded).toBe(true)
    expect(r.runsScored).toBe(0)
  })
})
