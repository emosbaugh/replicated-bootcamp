import type { Metadata } from 'next'
import { Geist_Mono } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const mono = Geist_Mono({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Baseball Game',
  description: 'Turn-by-turn baseball dice game',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${mono.className} bg-black text-green-400`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
