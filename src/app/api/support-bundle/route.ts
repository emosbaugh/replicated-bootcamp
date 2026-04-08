import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { execFile } from 'child_process'
import { readFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sdkUrl = process.env.REPLICATED_SDK_URL
  if (!sdkUrl) {
    return NextResponse.json({ error: 'SDK not configured' }, { status: 503 })
  }

  const secretName = process.env.SUPPORT_BUNDLE_SECRET_NAME
  if (!secretName) {
    return NextResponse.json({ error: 'Support bundle not configured' }, { status: 503 })
  }

  let namespace: string
  try {
    namespace = (
      await readFile('/var/run/secrets/kubernetes.io/serviceaccount/namespace', 'utf8')
    ).trim()
  } catch {
    return NextResponse.json({ error: 'Not running in Kubernetes' }, { status: 503 })
  }

  const outputPath = join(tmpdir(), `support-bundle-${Date.now()}.tar.gz`)

  try {
    await execFileAsync('/usr/local/bin/support-bundle', [
      `secret/${namespace}/${secretName}/support-bundle-spec`,
      `--output=${outputPath}`,
    ])

    const bundleData = await readFile(outputPath)

    const res = await fetch(`${sdkUrl}/api/v1/supportbundle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Length': String(bundleData.length),
      },
      body: bundleData,
    })

    if (!res.ok) {
      console.error('[support-bundle] SDK upload returned', res.status)
      return NextResponse.json(
        { error: 'Failed to upload support bundle' },
        { status: res.status }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[support-bundle] failed', err)
    return NextResponse.json(
      { error: 'Failed to generate support bundle' },
      { status: 500 }
    )
  } finally {
    await unlink(outputPath).catch(() => {})
  }
}
