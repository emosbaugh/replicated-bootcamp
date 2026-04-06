import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'playball.exe',
  description: 'Turn-by-turn baseball dice game',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-black text-green-400">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
