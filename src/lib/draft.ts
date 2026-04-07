import { prisma } from '@/lib/db'
import { Prisma } from '@/generated/prisma'

// Assign a random MLB team's roster to a new user.
// Creates Player records (one per MlbPlayer) and PlayerSeason records.
// Returns the created Team.
export async function draftTeam(
  userId: string,
  tx: Prisma.TransactionClient = prisma,
): Promise<{ mlbTeamName: string; mlbTeamAbbr: string }> {
  // Pick a random MLB team
  const teams = await tx.mlbTeam.findMany({ select: { id: true, name: true, abbr: true } })
  if (teams.length === 0) {
    throw new Error('No MLB teams found — database may not be seeded')
  }
  const mlbTeam = teams[Math.floor(Math.random() * teams.length)]

  const mlbPlayers = await tx.mlbPlayer.findMany({
    where: { mlbTeamId: mlbTeam.id },
  })

  // Create the user's Team
  const team = await tx.team.create({
    data: {
      userId,
      mlbTeamId: mlbTeam.id,
    },
  })

  // Clone each MlbPlayer into a Player for this team
  for (const mlbPlayer of mlbPlayers) {
    const player = await tx.player.create({
      data: {
        teamId: team.id,
        mlbPlayerId: mlbPlayer.id,
      },
    })
    await tx.playerSeason.create({
      data: {
        playerId: player.id,
        userId,
      },
    })
  }

  return { mlbTeamName: mlbTeam.name, mlbTeamAbbr: mlbTeam.abbr }
}
