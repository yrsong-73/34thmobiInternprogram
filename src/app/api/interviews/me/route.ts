export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getInterviews } from '@/lib/sheets'

/**
 * 인턴 본인의 예약된 면담 일정만 반환 — /api/interviews(CO1·Member 전용 관리 API)와 별개로,
 * 시간표 상단에 본인 면담 일정을 띄우기 위한 조회 전용 엔드포인트. 다른 인턴 이름은 조회 불가.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userName = (session.user as any)?.userName || session.user?.name || ''
  const all = await getInterviews()
  const mine = all.filter(r => r.intern_name === userName && r.booked_by)
  return NextResponse.json({ interviews: mine })
}
