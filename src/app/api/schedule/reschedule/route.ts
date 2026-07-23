export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { rescheduleDates } from '@/lib/sheets'

// POST — 새 시작일 기준으로 전체 시간표 date_label 일괄 재배치 (CO1만)
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'CO1') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { startDate } = await req.json()
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return NextResponse.json({ error: 'startDate 형식이 올바르지 않습니다 (YYYY-MM-DD)' }, { status: 400 })
  }

  const result = await rescheduleDates(startDate)
  return NextResponse.json({ success: true, ...result })
}
