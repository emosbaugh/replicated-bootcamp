export type Outcome =
  | 'HR' | 'TRIPLE' | 'DOUBLE' | 'SINGLE'
  | 'WALK' | 'STRIKEOUT' | 'GROUNDOUT' | 'FLYOUT'

// 2d6 outcome table. Rolls 2-12, mapping to baseball outcomes.
// Higher rolls → hits/extra bases; lower rolls → outs.
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

function rollDice(): number {
  return (
    Math.floor(Math.random() * 6) + 1 +
    Math.floor(Math.random() * 6) + 1
  )
}

// contact 1–10 → adjustment −2 to +2
function contactBonus(contact: number): number {
  return Math.round((contact - 5.5) / 2.25)
}

// power 1–10 → adjustment −1 to +1
function powerBonus(power: number): number {
  return Math.round((power - 5.5) / 4.5)
}

// pitching 1–10 → penalty 0 to 2 (good pitcher lowers roll)
function pitcherPenalty(pitching: number): number {
  return Math.round((pitching - 1) / 4.5)
}

export function resolveAtBat(
  batter: { contact: number; power: number },
  pitcher: { pitching: number }
): Outcome {
  const roll = rollDice()
  const adj =
    contactBonus(batter.contact) +
    powerBonus(batter.power) -
    pitcherPenalty(pitcher.pitching)
  const adjusted = Math.max(2, Math.min(12, roll + adj))
  return OUTCOME_TABLE[adjusted]
}
