import { AuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from '@/lib/db'
import { redis } from '@/lib/redis'
import { createRedisSessionAdapter } from '@/lib/redis-session-adapter'
import bcrypt from 'bcryptjs'

export const authOptions: AuthOptions = {
  adapter: createRedisSessionAdapter(redis, prisma),
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        })
        if (!user) return null
        const valid = await bcrypt.compare(credentials.password, user.passwordHash)
        if (!valid) return null
        return { id: user.id, email: user.email, name: user.franchiseName }
      },
    }),
  ],
  session: { strategy: 'database' },
  pages: { signIn: '/' },
  callbacks: {
    session({ session, user }) {
      if (user && session.user) session.user.id = user.id
      return session
    },
  },
}
