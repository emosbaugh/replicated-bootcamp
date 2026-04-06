import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { runCpuHalfInning } from '@/lib/cpu-runner'
import { buildGameState } from '@/lib/game-state'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = session.user.id

    // Check for existing in-progress game
    const existing = await prisma.game.findFirst({
      where: { userId, status: 'in_progress' },
      orderBy: { createdAt: 'desc' },
    })
    if (existing) {
      const state = await buildGameState(existing.id, userId)
      return NextResponse.json(state)
    }

    // Pick a random CPU team (different from user's team if possible)
    const userTeam = await prisma.team.findUnique({
      where: { userId },
      include: { mlbTeam: true },
    })
    if (!userTeam) {
      return NextResponse.json({ error: 'No team found' }, { status: 400 })
    }

    const allTeams = await prisma.mlbTeam.findMany({
      include: {
        players: {
          where: { isPitcher: false, lineupOrder: { not: null } },
          orderBy: { lineupOrder: 'asc' },
        },
      },
    })
    const cpuOptions = allTeams.filter((t) => t.id !== userTeam.mlbTeamId)
    if (cpuOptions.length === 0) {
      return NextResponse.json({ error: 'No CPU team available' }, { status: 400 })
    }
    const cpuMlbTeam = cpuOptions[Math.floor(Math.random() * cpuOptions.length)]

    // Build CPU lineup JSON (9 batters ordered by lineupOrder)
    // Note: players are already filtered to non-pitchers with lineupOrder by the Prisma query
    const cpuBatters = cpuMlbTeam.players
      .sort((a, b) => (a.lineupOrder ?? 0) - (b.lineupOrder ?? 0))
      .slice(0, 9)
      .map((p) => ({ id: p.id, name: p.name, contact: p.contact, power: p.power }))

    // CPU pitcher is the SP on the team
    const cpuPitcherRecord = await prisma.mlbPlayer.findFirst({
      where: { mlbTeamId: cpuMlbTeam.id, isPitcher: true, position: 'SP' },
    })
    const cpuPitcher = cpuPitcherRecord
      ? { id: cpuPitcherRecord.id, name: cpuPitcherRecord.name, pitching: cpuPitcherRecord.pitching }
      : { id: 'default', name: 'CPU Pitcher', pitching: 5 }

    // User's starting pitcher (first SP in their roster)
    const userPitcherPlayer = await prisma.player.findFirst({
      where: {
        teamId: userTeam.id,
        mlbPlayer: { isPitcher: true, position: 'SP' },
      },
      include: { mlbPlayer: true },
    })

    if (!userPitcherPlayer) {
      return NextResponse.json({ error: 'No pitcher found in roster' }, { status: 400 })
    }

    // Run CPU's top of 1st inning
    const cpuResult = runCpuHalfInning(
      cpuBatters,
      { pitching: userPitcherPlayer.mlbPlayer.pitching },
      0
    )

    // Create the game (starting at bot of 1st after CPU has batted)
    const game = await prisma.game.create({
      data: {
        userId,
        inning: 1,
        halfInning: 'bot',
        outs: 0,
        homeScore: 0,
        awayScore: cpuResult.score,
        runnersOnBase: { first: null, second: null, third: null },
        lineupPosition: 0,
        cpuLineupPosition: cpuResult.newLineupPosition,
        gameLog: cpuResult.log,
        gameStats: {},
        cpuGameStats: {},
        cpuTeamName: cpuMlbTeam.name,
        cpuTeamAbbr: cpuMlbTeam.abbr,
        cpuLineup: cpuBatters,
        cpuPitcher,
        userPitcherId: userPitcherPlayer.id,
      },
    })

    const state = await buildGameState(game.id, userId)
    if (!state) return NextResponse.json({ error: 'Failed to build game state' }, { status: 500 })

    return NextResponse.json({ ...state, lastCpuLog: cpuResult.log })
  } catch (err) {
    console.error('[game/start]', err)
    return NextResponse.json({ error: 'Failed to start game' }, { status: 500 })
  }
}
