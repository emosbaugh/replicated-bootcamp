import { NextRequest, NextResponse } from 'next/server'
import { checkLicense } from '@/lib/license'

export async function proxy(req: NextRequest) {
  const status = await checkLicense()
  if (status.valid) {
    return NextResponse.next()
  }
  const url = new URL('/license-error', req.url)
  url.searchParams.set('reason', status.reason)
  return NextResponse.rewrite(url)
}

export const config = {
  matcher: ['/((?!license-error|_next|favicon.ico).*)'],
}
