export function statBar(v: number): string {
  const clamped = Math.max(0, Math.min(10, v))
  return '█'.repeat(clamped) + '░'.repeat(10 - clamped)
}
