import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { resolveAtBat } from '@/lib/game-engine'
import { advanceBases, describePlay, type Bases } from '@/lib/baserunning'
import { runCpuHalfInning, type CpuBatter, type CpuPitcher } from '@/lib/cpu-runner'
import { buildGameState } from '@/lib/game-state'
import { finalizeGame } from '@/lib/game-end'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = session.user.id

    const game = await prisma.game.findFirst({
      where: { userId, status: 'in_progress' },
      orderBy: { createdAt: 'desc' },
    })
    if (!game) {
      return NextResponse.json({ error: 'No active game' }, { status: 404 })
    }

    // Load user's batting lineup
    const team = await prisma.team.findUnique({
      where: { userId },
      include: { mlbTeam: true },
    })
    if (!team) return NextResponse.json({ error: 'No team' }, { status: 400 })

    const batters = await prisma.player.findMany({
      where: { teamId: team.id, mlbPlayer: { lineupOrder: { not: null } } },
      include: { mlbPlayer: true },
      orderBy: { mlbPlayer: { lineupOrder: 'asc' } },
    })

    const currentBatter = batters[game.lineupPosition % batters.length]
    const mlp = currentBatter.mlbPlayer

    // CPU pitcher from JSON
    const cpuPitcher = game.cpuPitcher as unknown as CpuPitcher

    // Resolve the at-bat
    const outcome = resolveAtBat(
      { contact: mlp.contact, power: mlp.power },
      cpuPitcher
    )

    const currentBases = game.runnersOnBase as unknown as Bases
    const basesResult = advanceBases(outcome, currentBases, currentBatter.id)
    const playDesc = describePlay(mlp.name, outcome, basesResult.runsScored)

    // Update game stats
    const gameStats = game.gameStats as unknown as Record<string, { ab: number; h: number; hr: number; rbi: number; bb: number; k: number; doubles: number; triples: number }>
    const myStats = gameStats[currentBatter.id] ?? { ab: 0, h: 0, hr: 0, rbi: 0, bb: 0, k: 0, doubles: 0, triples: 0 }

    const isHit = ['SINGLE', 'DOUBLE', 'TRIPLE', 'HR'].includes(outcome)
    const isAB = !['WALK'].includes(outcome)

    gameStats[currentBatter.id] = {
      ...myStats,
      ab: isAB ? myStats.ab + 1 : myStats.ab,
      h: isHit ? myStats.h + 1 : myStats.h,
      hr: outcome === 'HR' ? myStats.hr + 1 : myStats.hr,
      rbi: myStats.rbi + basesResult.rbi,
      bb: outcome === 'WALK' ? myStats.bb + 1 : myStats.bb,
      k: outcome === 'STRIKEOUT' ? myStats.k + 1 : myStats.k,
      doubles: outcome === 'DOUBLE' ? myStats.doubles + 1 : myStats.doubles,
      triples: outcome === 'TRIPLE' ? myStats.triples + 1 : myStats.triples,
    }

    const newOuts = basesResult.outRecorded ? game.outs + 1 : game.outs
    const newHomeScore = game.homeScore + basesResult.runsScored
    const newLineupPosition = (game.lineupPosition + 1) % batters.length
    const gameLog = [...(game.gameLog as unknown as string[]), playDesc]

    let lastCpuLog: string[] | undefined

    // Check if user's half-inning is over
    if (newOuts >= 3) {
      // End of user's half (bottom). Advance to top of next inning.
      const newInning = game.inning + 1

      // Check game over BEFORE running CPU top-of-inning
      const isGameOver =
        (newInning > 9 && newHomeScore !== game.awayScore) ||
        newInning > 12

      if (isGameOver) {
        const result =
          newHomeScore > game.awayScore ? 'user_win'
          : game.awayScore > newHomeScore ? 'cpu_win'
          : 'tie'

        await prisma.game.update({
          where: { id: game.id },
          data: {
            outs: 3,
            homeScore: newHomeScore,
            lineupPosition: newLineupPosition,
            gameLog,
            gameStats,
            status: 'completed',
            result,
            completedAt: new Date(),
          },
        })

        await finalizeGame(game.id, userId)
        const state = await buildGameState(game.id, userId)
        return NextResponse.json({ ...state, lastCpuLog: [] })
      }

      // Run CPU top of new inning
      const cpuLineup = game.cpuLineup as unknown as CpuBatter[]
      const userPitcherRecord = await prisma.player.findUnique({
        where: { id: game.userPitcherId },
        include: { mlbPlayer: true },
      })
      const userPitcherRating = userPitcherRecord?.mlbPlayer.pitching ?? 5

      const cpuResult = runCpuHalfInning(
        cpuLineup,
        { pitching: userPitcherRating },
        game.cpuLineupPosition
      )

      const newAwayScore = game.awayScore + cpuResult.score
      lastCpuLog = cpuResult.log
      const combinedLog = [...gameLog, ...cpuResult.log]

      // Home team wins if ahead after CPU's top of 9th+
      const homeWinsAfterTop =
        newInning > 9 && newHomeScore > newAwayScore

      if (homeWinsAfterTop) {
        await prisma.game.update({
          where: { id: game.id },
          data: {
            inning: newInning,
            halfInning: 'completed',
            outs: 0,
            homeScore: newHomeScore,
            awayScore: newAwayScore,
            runnersOnBase: { first: null, second: null, third: null },
            lineupPosition: newLineupPosition,
            cpuLineupPosition: cpuResult.newLineupPosition,
            gameLog: combinedLog,
            gameStats,
            status: 'completed',
            result: 'user_win',
            completedAt: new Date(),
          },
        })
        await finalizeGame(game.id, userId)
        const state = await buildGameState(game.id, userId)
        return NextResponse.json({ ...state, lastCpuLog })
      }

      // Continue: bottom of new inning, user bats
      await prisma.game.update({
        where: { id: game.id },
        data: {
          inning: newInning,
          halfInning: 'bot',
          outs: 0,
          homeScore: newHomeScore,
          awayScore: newAwayScore,
          runnersOnBase: { first: null, second: null, third: null },
          lineupPosition: newLineupPosition,
          cpuLineupPosition: cpuResult.newLineupPosition,
          gameLog: combinedLog,
          gameStats,
        },
      })
    } else {
      // Half-inning continues — just update the game state
      await prisma.game.update({
        where: { id: game.id },
        data: {
          outs: newOuts,
          homeScore: newHomeScore,
          runnersOnBase: basesResult.newBases as unknown as Parameters<typeof prisma.game.update>[0]['data']['runnersOnBase'],
          lineupPosition: newLineupPosition,
          gameLog,
          gameStats,
        },
      })
    }

    const state = await buildGameState(game.id, userId)
    return NextResponse.json({ ...state, lastCpuLog })
  } catch (err) {
    console.error('[game/at-bat]', err)
    return NextResponse.json({ error: 'Failed to process at-bat' }, { status: 500 })
  }
}
