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
  getUserPermissions,
  getScheduleRows,
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
  const emailParam    = searchParams.get('email')
  const viewAsName    = searchParams.get('viewAsName')

  // CO1 전용: 인턴 이름으로 조회
  if (role === 'CO1' && viewAsName) {
    const users = await getUserPermissions()
    const user  = users.find(u => u.name === viewAsName)
    if (!user) return NextResponse.json({ indices: [], submissions: {} })
    const [indices, submissions] = await Promise.all([
      getCompletionsByEmail(user.email),
      getSubmissionsByEmail(user.email),
    ])
    return NextResponse.json({ indices, submissions })
  }

  if (role === 'CO1' && !emailParam) {
    const [all, scheduleRows] = await Promise.all([getAllCompletions(), getScheduleRows()])
    const taskRows = scheduleRows
      .filter(r => r.type === 'task' || r.has_assignment)
      .map(r => ({ rowIndex: r.rowIndex, name: r.name, job_types: r.job_types, note: r.note || '' }))
    return NextResponse.json({ all, taskRows })
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
  const { scheduleRowIndex, checked, targetEmail, submissionUrl, viewAsName } = body

  if (!scheduleRowIndex) {
    return NextResponse.json({ error: 'scheduleRowIndex 필수' }, { status: 400 })
  }

  // CO1 테스트 모드: viewAsName으로 인턴 이메일 조회
  let email = session.user.email!
  if (role === 'CO1' && viewAsName) {
    const users = await getUserPermissions()
    const user  = users.find(u => u.name === viewAsName)
    if (user) email = user.email
  } else if (role === 'CO1' && targetEmail) {
    email = targetEmail
  }

  if (checked) {
    await addCompletion(email, scheduleRowIndex, submissionUrl)
  } else {
    await removeCompletion(email, scheduleRowIndex)
  }

  return NextResponse.json({ success: true })
}
