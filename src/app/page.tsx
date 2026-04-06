'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const res = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })
    setLoading(false)
    if (res?.error) {
      setError('Invalid email or password')
    } else {
      router.push('/game')
    }
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
      <pre className="font-mono text-green-400 text-2xl mb-8">
        {`⚾  BASEBALL DICE GAME  ⚾`}
      </pre>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-xs">
        <input
          type="email"
          placeholder="EMAIL"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="bg-black border border-green-400 text-green-400 font-mono p-2 text-sm focus:outline-none focus:border-green-300"
        />
        <input
          type="password"
          placeholder="PASSWORD"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="bg-black border border-green-400 text-green-400 font-mono p-2 text-sm focus:outline-none focus:border-green-300"
        />
        {error && <p className="font-mono text-red-400 text-xs">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="border border-green-400 text-green-400 font-mono p-2 text-sm hover:bg-green-400 hover:text-black disabled:opacity-50"
        >
          {loading ? 'LOGGING IN...' : 'LOGIN'}
        </button>
        <Link href="/signup" className="font-mono text-xs text-center text-green-600 hover:text-green-400">
          NEW FRANCHISE? SIGN UP →
        </Link>
      </form>
    </div>
  )
}
