'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [franchiseName, setFranchiseName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, franchiseName }),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Registration failed')
      setLoading(false)
      return
    }

    // Auto sign-in after registration
    const signInRes = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    setLoading(false)
    if (signInRes?.error) {
      setError('Account created but login failed. Please log in.')
      router.push('/')
    } else {
      router.push('/game')
    }
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
      <pre className="font-mono text-green-400 text-2xl mb-2">{`⚾  NEW FRANCHISE  ⚾`}</pre>
      <pre className="font-mono text-green-600 text-xs mb-8">{'A random MLB roster will be drafted for you'}</pre>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-xs">
        <input
          type="text"
          placeholder="FRANCHISE NAME (e.g. THE CRUSHERS)"
          value={franchiseName}
          onChange={(e) => setFranchiseName(e.target.value)}
          required
          className="bg-black border border-green-400 text-green-400 font-mono p-2 text-sm focus:outline-none"
        />
        <input
          type="email"
          placeholder="EMAIL"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="bg-black border border-green-400 text-green-400 font-mono p-2 text-sm focus:outline-none"
        />
        <input
          type="password"
          placeholder="PASSWORD"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="bg-black border border-green-400 text-green-400 font-mono p-2 text-sm focus:outline-none"
        />
        {error && <p className="font-mono text-red-400 text-xs">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="border border-green-400 text-green-400 font-mono p-2 text-sm hover:bg-green-400 hover:text-black disabled:opacity-50"
        >
          {loading ? 'DRAFTING YOUR TEAM...' : 'CREATE FRANCHISE + DRAFT TEAM'}
        </button>
      </form>
    </div>
  )
}
