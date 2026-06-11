export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSettings, updateSettingKey } from '@/lib/sheets'

function getRole(session: any) {
  return session?.user?.role as string | undefined
}

// GET — 앱 설정 조회 (로그인 필요)
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await getSettings()
  return NextResponse.json({ settings })
}

// PUT — 설정 키 업데이트 (CO1만)
export async function PUT(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (getRole(session) !== 'CO1') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as Record<string, string>
  await Promise.all(
    Object.entries(body).map(([key, value]) => updateSettingKey(key, value))
  )
  return NextResponse.json({ success: true })
}
