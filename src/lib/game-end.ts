import { prisma } from '@/lib/db'

// Called when a game completes.
// Reads game.gameStats and increments PlayerSeason for each user player.
export async function finalizeGame(gameId: string, userId: string): Promise<void> {
  const game = await prisma.game.findUnique({ where: { id: gameId } })
  if (!game) return

  const gameStats = game.gameStats as Record<
    string,
    { ab: number; h: number; hr: number; rbi: number; bb: number; k: number; doubles: number; triples: number }
  >

  for (const [playerId, stats] of Object.entries(gameStats)) {
    const season = await prisma.playerSeason.findUnique({ where: { playerId } })
    if (!season) continue

    await prisma.playerSeason.update({
      where: { playerId },
      data: {
        games: { increment: 1 },
        atBats: { increment: stats.ab },
        hits: { increment: stats.h },
        doubles: { increment: stats.doubles ?? 0 },
        triples: { increment: stats.triples ?? 0 },
        homeRuns: { increment: stats.hr },
        rbi: { increment: stats.rbi },
        walks: { increment: stats.bb ?? 0 },
        strikeouts: { increment: stats.k ?? 0 },
      },
    })
  }

  // Update pitcher stats
  const userPitcher = await prisma.player.findUnique({
    where: { id: game.userPitcherId },
    include: { playerSeason: true },
  })
  if (userPitcher?.playerSeason) {
    await prisma.playerSeason.update({
      where: { playerId: userPitcher.id },
      data: {
        gamesStarted: { increment: 1 },
        inningsPitched: { increment: 9 },
        earnedRuns: { increment: game.awayScore },
      },
    })
  }
}
