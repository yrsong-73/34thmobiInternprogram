export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getCohorts, addCohort, setActiveCohort } from '@/lib/sheets'

function extractSheetId(input: string): string {
  const trimmed = input.trim()
  const match = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : trimmed
}

async function requireCO1() {
  const session = await getServerSession(authOptions)
  if (!session) return null
  if ((session.user as any).role !== 'CO1') return null
  return session
}

// GET — 등록된 기수 목록
export async function GET() {
  if (!await requireCO1()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const cohorts = await getCohorts()
  return NextResponse.json({ cohorts })
}

// POST — 새 기수 등록
export async function POST(req: Request) {
  if (!await requireCO1()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { batch, label, sheetId } = await req.json()
  if (!batch || !sheetId) return NextResponse.json({ error: 'batch, sheetId 필수' }, { status: 400 })
  await addCohort(String(batch).trim(), (label || `${batch}기`).trim(), extractSheetId(sheetId))
  return NextResponse.json({ success: true })
}

// PUT — 활성 기수 전환
export async function PUT(req: Request) {
  if (!await requireCO1()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { batch } = await req.json()
  if (!batch) return NextResponse.json({ error: 'batch 필수' }, { status: 400 })
  await setActiveCohort(String(batch).trim())
  return NextResponse.json({ success: true })
}
