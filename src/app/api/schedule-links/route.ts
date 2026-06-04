export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getScheduleLinks, upsertScheduleLink } from '@/lib/sheets'

// GET — 강의자료 링크 목록 (로그인 필요)
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const links = await getScheduleLinks()
  return NextResponse.json({ links })
}

// POST — 링크 저장 (CO1만)
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'CO1') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { lectureName, linkUrl, linkLabel } = await req.json()
  if (!lectureName || !linkLabel) {
    return NextResponse.json({ error: 'lectureName, linkLabel 필수' }, { status: 400 })
  }

  await upsertScheduleLink(lectureName, linkUrl || '', linkLabel)
  return NextResponse.json({ success: true })
}
