export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { updateScheduleFeedbackExclude } from '@/lib/sheets'

// PATCH — 강의평가 대상 온/오프 토글 (CO1만)
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'CO1') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { rowIndex, excluded } = await req.json()
  if (!rowIndex) return NextResponse.json({ error: 'rowIndex 필수' }, { status: 400 })

  await updateScheduleFeedbackExclude(rowIndex, !!excluded)
  return NextResponse.json({ success: true })
}
