export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { copyJobTrackSchedule } from '@/lib/sheets'

// POST — 특정 직무 전용 강의를 복제해서 새 직무 강의로 만들기 (CO1만)
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'CO1') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { fromJob, toJob } = await req.json()
  if (!fromJob || !toJob) return NextResponse.json({ error: 'fromJob, toJob 필수' }, { status: 400 })

  const result = await copyJobTrackSchedule(fromJob, toJob)
  return NextResponse.json({ success: true, ...result })
}
