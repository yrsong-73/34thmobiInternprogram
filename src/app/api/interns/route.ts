export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getInterns, updateIntern } from '@/lib/sheets'

function getRole(session: any) {
  return session?.user?.role as string | undefined
}

// GET — 인턴 목록 조회 (CO1·Member만)
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = getRole(session)
  if (role === 'Intern') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const interns = await getInterns()
  return NextResponse.json({ interns })
}

// PUT — 인턴 정보 수정 (CO1만)
export async function PUT(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (getRole(session) !== 'CO1') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { rowIndex, ...data } = body
  if (!rowIndex) return NextResponse.json({ error: 'rowIndex 필수' }, { status: 400 })

  await updateIntern(rowIndex, data)
  return NextResponse.json({ success: true })
}
