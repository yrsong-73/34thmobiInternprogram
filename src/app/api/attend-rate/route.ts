/**
 * GET /api/attend-rate
 * 인턴별 수강체크율을 completions + schedule(count_for_rate=y) 기반으로 자동 계산
 * 반환: { rates: { [name]: number } }  (0~100 정수)
 */

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getScheduleRows, getAllCompletions, getUserPermissions, getSettings, getInterns } from '@/lib/sheets'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (session.user as any)?.role
  if (role === 'Intern') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const [scheduleRows, settings, interns, allCompletions, permissions] = await Promise.all([
      getScheduleRows(), getSettings(), getInterns(), getAllCompletions(), getUserPermissions(),
    ])

    // count_for_rate=y 이면서, 2주차는 실제 진행 중인 버전(week2_active_variant)에 해당하는 행만 후보로 삼는다.
    const candidateRows = scheduleRows.filter(r =>
      r.count_for_rate &&
      (r.week_num !== 2 || !r.week_variant || r.week_variant === settings.week2_active_variant)
    )

    // email → name 매핑 (user_permissions)
    const emailToName: Record<string, string> = {}
    permissions.forEach(p => {
      if (p.role === 'Intern') emailToName[p.email.toLowerCase()] = p.name
    })

    // 완료 기록을 인턴 이름별로 집계
    const completedByName: Record<string, Set<number>> = {}
    for (const c of allCompletions) {
      const name = emailToName[c.email.toLowerCase()]
      if (!name) continue
      if (!completedByName[name]) completedByName[name] = new Set()
      completedByName[name].add(c.scheduleRowIndex)
    }

    // 분모는 인턴마다 다르다 — 자기 직무(job_types에 'all' 또는 본인 type 포함)에 해당하는 강의만 대상으로 삼아야
    // 다른 직무 전용 강의까지 섞여 체크율이 실제보다 낮게 나오는 걸 막을 수 있다.
    const rates: Record<string, number> = {}
    for (const intern of interns) {
      const myRows = candidateRows.filter(r => r.job_types.includes('all') || r.job_types.includes(intern.type))
      if (myRows.length === 0) continue
      const done = completedByName[intern.name] ?? new Set<number>()
      const checkedCount = myRows.filter(r => done.has(r.rowIndex)).length
      rates[intern.name] = Math.round((checkedCount / myRows.length) * 100)
    }

    return NextResponse.json({ rates })
  } catch (err: any) {
    console.error('[attend-rate]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
