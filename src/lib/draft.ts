import { prisma } from '@/lib/db'

// Assign a random MLB team's roster to a new user.
// Creates Player records (one per MlbPlayer) and PlayerSeason records.
// Returns the created Team.
export async function draftTeam(userId: string): Promise<{ mlbTeamName: string; mlbTeamAbbr: string }> {
  // Pick a random MLB team
  const teams = await prisma.mlbTeam.findMany({ select: { id: true, name: true, abbr: true } })
  const mlbTeam = teams[Math.floor(Math.random() * teams.length)]

  const mlbPlayers = await prisma.mlbPlayer.findMany({
    where: { mlbTeamId: mlbTeam.id },
  })

  // Create the user's Team
  const team = await prisma.team.create({
    data: {
      userId,
      mlbTeamId: mlbTeam.id,
    },
  })

  // Clone each MlbPlayer into a Player for this team
  for (const mlbPlayer of mlbPlayers) {
    const player = await prisma.player.create({
      data: {
        teamId: team.id,
        mlbPlayerId: mlbPlayer.id,
      },
    })
    await prisma.playerSeason.create({
      data: {
        playerId: player.id,
        userId,
      },
    })
  }

  return { mlbTeamName: mlbTeam.name, mlbTeamAbbr: mlbTeam.abbr }
}
