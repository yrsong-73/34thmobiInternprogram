import type { Metadata } from 'next'
import { Providers } from './providers'
import { getActiveCohort } from '@/lib/sheets'
import './globals.css'

export async function generateMetadata(): Promise<Metadata> {
  const cohort = await getActiveCohort().catch(() => null)
  const label = cohort?.label || '인턴십'
  return {
    title: `${label} | Mobidays`,
    description: 'Mobidays 인턴십 교육 관리 페이지',
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/static/pretendard.min.css"
        />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
        <div id="toast" />
      </body>
    </html>
  )
}
