export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getRecords, addRecord, deleteRecord } from '@/lib/sheets'

function getRole(session: any) {
  return session?.user?.role as string | undefined
}

// GET — 기록 조회 (CO1·Member만)
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = getRole(session)
  if (role === 'Intern') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const records = await getRecords()
  return NextResponse.json({ records })
}

// POST — 기록 작성 (CO1만)
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (getRole(session) !== 'CO1') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { intern, author, date, content } = body
  if (!intern || !author || !date || !content) {
    return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
  }

  await addRecord({ intern, author, date, content })
  return NextResponse.json({ success: true })
}

// DELETE — 기록 삭제 (CO1만)
export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (getRole(session) !== 'CO1') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { rowIndex } = await req.json()
  if (!rowIndex) return NextResponse.json({ error: 'rowIndex 필수' }, { status: 400 })

  await deleteRecord(rowIndex)
  return NextResponse.json({ success: true })
}
