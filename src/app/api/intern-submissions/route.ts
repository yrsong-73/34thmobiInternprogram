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

    // rowIndex → schedule name 맵
    const scheduleMap: Record<number, string> = {}
    scheduleRows.forEach(r => { scheduleMap[r.rowIndex] = r.name })

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
      const scheduleName = scheduleMap[c.scheduleRowIndex] || `항목 #${c.scheduleRowIndex}`
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
