/**
 * GET /api/attend-rate
 * 인턴별 수강체크율을 completions + schedule(count_for_rate=y) 기반으로 자동 계산
 * 반환: { rates: { [name]: number } }  (0~100 정수)
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
    // 1. 수강체크율 분모: count_for_rate = y 인 rowIndex 목록
    const scheduleRows = await getScheduleRows()
    const denominatorSet = new Set(
      scheduleRows.filter(r => r.count_for_rate).map(r => r.rowIndex)
    )
    const denominator = denominatorSet.size

    if (denominator === 0) {
      return NextResponse.json({ rates: {}, denominator: 0 })
    }

    // 2. 전체 completions
    const allCompletions = await getAllCompletions()

    // 3. email → name 매핑 (user_permissions)
    const permissions = await getUserPermissions()
    const emailToName: Record<string, string> = {}
    permissions.forEach(p => {
      if (p.role === 'Intern') emailToName[p.email.toLowerCase()] = p.name
    })

    // 4. 인턴별 체크 수 집계 (분모에 해당하는 rowIndex만 카운트)
    const checkedCount: Record<string, number> = {}
    for (const c of allCompletions) {
      const name = emailToName[c.email.toLowerCase()]
      if (!name) continue
      if (!denominatorSet.has(c.scheduleRowIndex)) continue
      checkedCount[name] = (checkedCount[name] || 0) + 1
    }

    // 5. 비율 계산
    const rates: Record<string, number> = {}
    for (const [name, count] of Object.entries(checkedCount)) {
      rates[name] = Math.round((count / denominator) * 100)
    }

    return NextResponse.json({ rates, denominator })
  } catch (err: any) {
    console.error('[attend-rate]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
