/**
 * GET /api/intern-submissions
 * CO1 전용 — 인턴별 과제 제출 링크 반환
 * 반환: { submissions: { [name]: { rowIndex, scheduleName, submissionUrl }[] } }
 */

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getScheduleRows, getAllCompletions, getUserPermissions } from '@/lib/sheets'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (session.user as any)?.role
  if (role === 'Intern') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const [scheduleRows, allCompletions, permissions] = await Promise.all([
      getScheduleRows(),
      getAllCompletions(),
      getUserPermissions(),
    ])

    // rowIndex → schedule name 맵 — 실제 "과제"(단독 task 또는 has_assignment 강의)만 대상으로 삼는다.
    // 웰컴런치처럼 완료 체크는 되어있어도 과제가 아닌 강의가 섞여 나오는 걸 막기 위함
    // (다른 곳의 taskRows 정의: /api/completions와 동일한 기준)
    const scheduleMap: Record<number, string> = {}
    scheduleRows
      .filter(r => r.type === 'task' || r.has_assignment)
      .forEach(r => { scheduleMap[r.rowIndex] = r.name })

    // email → name 맵 (Intern만)
    const emailToName: Record<string, string> = {}
    permissions.forEach(p => {
      if (p.role === 'Intern') emailToName[p.email.toLowerCase()] = p.name
    })

    // 인턴별 제출 링크 집계
    const submissions: Record<string, { rowIndex: number; scheduleName: string; submissionUrl: string }[]> = {}

    for (const c of allCompletions) {
      if (!c.submissionUrl) continue
      const name = emailToName[c.email.toLowerCase()]
      if (!name) continue
      const scheduleName = scheduleMap[c.scheduleRowIndex]
      if (!scheduleName) continue // 과제가 아닌 강의(웰컴런치 등)이거나 삭제된 강의 — 제출 링크 목록에서 제외
      if (!submissions[name]) submissions[name] = []
      submissions[name].push({
        rowIndex:      c.scheduleRowIndex,
        scheduleName,
        submissionUrl: c.submissionUrl,
      })
    }

    return NextResponse.json({ submissions })
  } catch (err: any) {
    console.error('[intern-submissions]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
