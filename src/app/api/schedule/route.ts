export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  getScheduleRows,
  addScheduleRow,
  updateScheduleRowAndSplit,
  deleteScheduleRow,
} from '@/lib/sheets'

// GET — 전체 시간표 (로그인 필요)
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await getScheduleRows()
  return NextResponse.json({ rows })
}

// POST — 강의 추가 (CO1만)
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'CO1') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  if (!body.name || !body.week_num || !body.day_num) {
    return NextResponse.json({ error: 'week_num, day_num, name 필수' }, { status: 400 })
  }
  await addScheduleRow(body)
  return NextResponse.json({ success: true })
}

// PUT — 강의 수정 (CO1만)
export async function PUT(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'CO1') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { rowIndex, ...data } = body
  if (!rowIndex) return NextResponse.json({ error: 'rowIndex 필수' }, { status: 400 })
  const result = await updateScheduleRowAndSplit(rowIndex, data)
  return NextResponse.json({ success: true, ...result })
}

// DELETE — 강의 삭제 (CO1만)
export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'CO1') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { rowIndex } = await req.json()
  if (!rowIndex) return NextResponse.json({ error: 'rowIndex 필수' }, { status: 400 })
  await deleteScheduleRow(rowIndex)
  return NextResponse.json({ success: true })
}
