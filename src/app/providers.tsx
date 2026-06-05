'use client'

import { SessionProvider } from 'next-auth/react'
import { PreviewProvider } from '@/context/PreviewContext'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <PreviewProvider>{children}</PreviewProvider>
    </SessionProvider>
  )
}
