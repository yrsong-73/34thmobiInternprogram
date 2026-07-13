export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getActiveCohort } from '@/lib/sheets'

// GET — 인증 없이 활성 기수 표시 정보만 조회 (로그인 화면 등에서 사용)
export async function GET() {
  const cohort = await getActiveCohort()
  return NextResponse.json({
    batch: cohort?.batch || '',
    label: cohort?.label || '',
  })
}
