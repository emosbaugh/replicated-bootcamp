'use client'

import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'

type BundleStatus = 'idle' | 'loading' | 'success' | 'error'

export default function SupportPage() {
  const { status } = useSession()
  const router = useRouter()
  const [bundleStatus, setBundleStatus] = useState<BundleStatus>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/')
  }, [status, router])

  async function handleGenerateBundle() {
    setBundleStatus('loading')
    setErrorMessage('')
    try {
      const res = await fetch('/api/support-bundle', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        setErrorMessage(data.error ?? 'Failed to generate bundle. Check SDK connectivity.')
        setBundleStatus('error')
        return
      }
      setBundleStatus('success')
    } catch {
      setErrorMessage('Failed to generate bundle. Check SDK connectivity.')
      setBundleStatus('error')
    }
  }

  return (
    <div>
      <div className="flex justify-between p-4">
        <button
          onClick={() => router.push('/game')}
          className="font-mono text-xs text-green-600 hover:text-green-400"
        >
          &lt;- BACK TO GAME
        </button>
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          className="font-mono text-xs text-green-600 hover:text-green-400"
        >
          LOGOUT
        </button>
      </div>
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-6">
        <pre className="font-mono text-green-400 text-center">{[
          '╔══════════════════════════════════════╗',
          '║             [ SUPPORT ]              ║',
          '╚══════════════════════════════════════╝',
        ].join('\n')}</pre>
        <button
          onClick={handleGenerateBundle}
          disabled={bundleStatus === 'loading'}
          className="border border-green-400 text-green-400 font-mono px-8 py-3 text-sm hover:bg-green-400 hover:text-black disabled:opacity-50"
        >
          {bundleStatus === 'loading' ? '  COLLECTING...  ' : '  GENERATE SUPPORT BUNDLE  '}
        </button>
        {bundleStatus === 'success' && (
          <pre className="font-mono text-green-400 text-xs">
            Support bundle uploaded to Vendor Portal.
          </pre>
        )}
        {bundleStatus === 'error' && (
          <pre className="font-mono text-yellow-400 text-xs">
            {errorMessage || 'Failed to generate bundle. Check SDK connectivity.'}
          </pre>
        )}
      </div>
    </div>
  )
}
