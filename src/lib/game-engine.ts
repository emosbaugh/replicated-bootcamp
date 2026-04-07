export type Outcome =
  | 'HR' | 'TRIPLE' | 'DOUBLE' | 'SINGLE'
  | 'WALK' | 'STRIKEOUT' | 'GROUNDOUT' | 'FLYOUT'

export type AtBatResult = {
  outcome: Outcome
  die1: number
  die2: number
  adjusted: number
  net: number
}

const OUTCOME_TABLE: Record<number, Outcome> = {
  2:  'STRIKEOUT',
  3:  'STRIKEOUT',
  4:  'GROUNDOUT',
  5:  'GROUNDOUT',
  6:  'FLYOUT',
  7:  'GROUNDOUT',
  8:  'SINGLE',
  9:  'TRIPLE',
  10: 'DOUBLE',
  11: 'WALK',
  12: 'HR',
}

function rollDice(): [number, number] {
  const die1 = Math.floor(Math.random() * 6) + 1
  const die2 = Math.floor(Math.random() * 6) + 1
  return [die1, die2]
}

function contactBonus(contact: number): number {
  return Math.round((contact - 5.5) / 2.25)
}

function powerBonus(power: number): number {
  return Math.round((power - 5.5) / 4.5)
}

function pitcherPenalty(pitching: number): number {
  return Math.round((pitching - 1) / 4.5)
}

export function resolveAtBat(
  batter: { contact: number; power: number },
  pitcher: { pitching: number }
): AtBatResult {
  const [die1, die2] = rollDice()
  const roll = die1 + die2
  const net =
    contactBonus(batter.contact) +
    powerBonus(batter.power) -
    pitcherPenalty(pitcher.pitching)
  const adjusted = Math.max(2, Math.min(12, roll + net))
  return {
    outcome: OUTCOME_TABLE[adjusted],
    die1,
    die2,
    adjusted,
    net: net + 0,  // normalize -0 to 0 (Math.round can produce -0)
  }
}
