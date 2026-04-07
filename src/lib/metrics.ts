import { prisma } from '@/lib/db'

export async function sendCustomMetrics(): Promise<void> {
  const sdkUrl = process.env.REPLICATED_SDK_URL
  if (!sdkUrl) return

  try {
    const [usersTotal, gameResults] = await Promise.all([
      prisma.user.count(),
      prisma.game.groupBy({
        by: ['result'],
        where: { status: 'completed' },
        _count: { id: true },
      }),
    ])

    const gamesCompleted = gameResults.reduce((sum, r) => sum + r._count.id, 0)
    const gamesWon = gameResults.find((r) => r.result === 'user_win')?._count.id ?? 0
    const gamesLost = gameResults.find((r) => r.result === 'cpu_win')?._count.id ?? 0

    const res = await fetch(`${sdkUrl}/api/v1/app/custom-metrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          users_total: usersTotal,
          games_completed: gamesCompleted,
          games_won: gamesWon,
          games_lost: gamesLost,
        },
      }),
    })
    if (!res.ok) {
      console.error('[metrics] SDK returned', res.status)
    }
  } catch (err) {
    console.error('[metrics] failed to send custom metrics', err)
  }
}
