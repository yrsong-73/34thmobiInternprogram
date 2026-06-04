export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  getCompletionsByEmail,
  getSubmissionsByEmail,
  getAllCompletions,
  addCompletion,
  removeCompletion,
} from '@/lib/sheets'

/**
 * GET /api/completions
 *   - 인턴: 자기 완료 목록 → { indices: number[], submissions: Record<string, string> }
 *   - CO1 + ?email=xxx: 특정 인턴 조회 → { indices: number[], submissions: Record<string, string> }
 *   - CO1 (파라미터 없음): 전체 조회 → { all: [...] }
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const role = (session.user as any).role as string
  const { searchParams } = new URL(req.url)
  const emailParam = searchParams.get('email')

  if (role === 'CO1' && !emailParam) {
    // 전체 완료 기록 반환
    const all = await getAllCompletions()
    return NextResponse.json({ all })
  }

  const targetEmail = (role === 'CO1' && emailParam) ? emailParam : session.user.email
  const [indices, submissions] = await Promise.all([
    getCompletionsByEmail(targetEmail),
    getSubmissionsByEmail(targetEmail),
  ])
  return NextResponse.json({ indices, submissions })
}

/**
 * POST /api/completions
 * body: { scheduleRowIndex: number, checked: boolean, targetEmail?: string, submissionUrl?: string }
 *   - 인턴: 자신의 체크 토글 또는 과제 URL 제출
 *   - CO1: targetEmail 지정 시 해당 인턴 대신 수정 가능
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const role = (session.user as any).role as string
  if (role !== 'CO1' && role !== 'Intern') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { scheduleRowIndex, checked, targetEmail, submissionUrl } = body

  if (!scheduleRowIndex) {
    return NextResponse.json({ error: 'scheduleRowIndex 필수' }, { status: 400 })
  }

  // CO1은 targetEmail 지정 가능, 아니면 자기 이메일 사용
  const email = (role === 'CO1' && targetEmail) ? targetEmail : session.user.email

  if (checked) {
    await addCompletion(email, scheduleRowIndex, submissionUrl)
  } else {
    await removeCompletion(email, scheduleRowIndex)
  }

  return NextResponse.json({ success: true })
}
