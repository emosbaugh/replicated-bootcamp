import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { draftTeam } from '@/lib/draft'

export async function POST(req: NextRequest) {
  const { email, password, franchiseName } = await req.json()

  if (!email || !password || !franchiseName) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  })
  if (existing) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
      franchiseName,
    },
  })

  const { mlbTeamName, mlbTeamAbbr } = await draftTeam(user.id)

  return NextResponse.json({ success: true, mlbTeamName, mlbTeamAbbr })
}
