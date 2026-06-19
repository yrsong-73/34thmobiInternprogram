export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getCO1Feedbacks, upsertCO1Feedback } from '@/lib/sheets'

function getRole(session: any) {
  return session?.user?.role as string | undefined
}

// GET — CO1만 가능. 전체 평가 반환 (클라이언트에서 본인/전체 분리)
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (getRole(session) !== 'CO1') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const feedbacks = await getCO1Feedbacks()
  return NextResponse.json({ feedbacks })
}

// POST — CO1만 가능. 평가 제출/수정
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (getRole(session) !== 'CO1') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const userName = (session.user as any)?.userName || session.user?.name || ''
  const body = await req.json()

  if (!body.lecture_name) return NextResponse.json({ error: 'lecture_name 필수' }, { status: 400 })

  await upsertCO1Feedback({
    ...body,
    evaluator:  userName,
    timestamp:  new Date().toISOString(),
  })
  return NextResponse.json({ success: true })
}
