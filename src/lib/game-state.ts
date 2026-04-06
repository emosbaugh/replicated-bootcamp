import { prisma } from '@/lib/db'
import type { GameState } from '@/app/api/game/types'

// Build the GameState response shape from a Game row.
// Loads the current batter's player info and season stats.
export async function buildGameState(gameId: string, userId: string): Promise<GameState | null> {
  const game = await prisma.game.findFirst({
    where: { id: gameId, userId },
  })
  if (!game) return null

  // Get user's team info
  const team = await prisma.team.findUnique({
    where: { userId },
    include: { mlbTeam: true },
  })
  if (!team) return null

  // Get batting lineup (players with lineupOrder 1-9, sorted)
  const lineup = await prisma.player.findMany({
    where: { teamId: team.id },
    include: {
      mlbPlayer: true,
      playerSeason: true,
    },
    orderBy: { mlbPlayer: { lineupOrder: 'asc' } },
  })
  const batters = lineup.filter((p) => p.mlbPlayer.lineupOrder !== null)

  const currentPlayer = batters[game.lineupPosition % batters.length]
  if (!currentPlayer) return null

  const mlp = currentPlayer.mlbPlayer
  const season = currentPlayer.playerSeason

  const gameStats = game.gameStats as Record<string, { ab: number; h: number; hr: number; rbi: number }>
  const myGameStats = gameStats[currentPlayer.id] ?? { ab: 0, h: 0, hr: 0, rbi: 0 }

  const avg = season && season.atBats > 0
    ? (season.hits / season.atBats).toFixed(3).replace('0.', '.')
    : '.000'

  const gameLog = game.gameLog as string[]

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { franchiseName: true } })
  if (!user) return null

  return {
    id: game.id,
    inning: game.inning,
    halfInning: game.halfInning as 'top' | 'bot',
    outs: game.outs,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    runnersOnBase: game.runnersOnBase as GameState['runnersOnBase'],
    currentBatter: {
      id: currentPlayer.id,
      name: mlp.name,
      position: mlp.position,
      number: mlp.number,
      contact: mlp.contact,
      power: mlp.power,
      speed: mlp.speed,
      gameStats: myGameStats,
      seasonStats: {
        avg,
        hr: season?.homeRuns ?? 0,
        rbi: season?.rbi ?? 0,
      },
    },
    gameLog: gameLog.slice(-5).reverse(),
    status: game.status as 'in_progress' | 'completed',
    result: game.result as GameState['result'],
    userTeam: {
      name: team.mlbTeam.name,
      abbr: team.mlbTeam.abbr,
      franchiseName: user.franchiseName,
    },
    cpuTeam: {
      name: game.cpuTeamName,
      abbr: game.cpuTeamAbbr,
    },
    lastCpuLog: undefined,
  }
}
