export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getFeedbacks, upsertFeedback } from '@/lib/sheets'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role     = (session.user as any)?.role as string
  const userName = (session.user as any)?.userName || session.user?.name || ''

  const { searchParams } = new URL(req.url)
  const internName = searchParams.get('intern_name') || undefined

  if (role === 'Intern') {
    const feedbacks = await getFeedbacks(userName)
    return NextResponse.json({ feedbacks })
  }

  const feedbacks = await getFeedbacks(internName)
  return NextResponse.json({ feedbacks })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role     = (session.user as any)?.role as string
  const userName = (session.user as any)?.userName || session.user?.name || ''

  if (role !== 'Intern') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const {
    lecture_name, lecture_date,
    q1_satisfaction, q2_structure, q3_depth, q4_explanation, q5_practical,
    q6_practice,
    q7_helpful, q8_difficult, q9_improvement,
  } = body

  if (!lecture_name || !q1_satisfaction || !q2_structure || !q3_depth || !q4_explanation || !q5_practical) {
    return NextResponse.json({ error: '필수 항목이 누락되었습니다 (Q1~Q5)' }, { status: 400 })
  }

  await upsertFeedback({
    timestamp:       new Date().toISOString(),
    intern_name:     userName,
    lecture_name,
    lecture_date:    lecture_date || '',
    q1_satisfaction: Number(q1_satisfaction),
    q2_structure:    Number(q2_structure),
    q3_depth:        Number(q3_depth),
    q4_explanation:  Number(q4_explanation),
    q5_practical:    Number(q5_practical),
    q6_practice:     q6_practice ? Number(q6_practice) : undefined,
    q7_helpful:      q7_helpful    || '',
    q8_difficult:    q8_difficult  || '',
    q9_improvement:  q9_improvement || '',
  })

  return NextResponse.json({ ok: true })
}
