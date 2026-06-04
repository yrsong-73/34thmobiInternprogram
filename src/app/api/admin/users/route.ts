export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  getUserPermissions,
  addUserPermission,
  updateUserPermission,
  deleteUserPermission,
} from '@/lib/sheets'

async function requireCO1() {
  const session = await getServerSession(authOptions)
  if (!session) return null
  if ((session.user as any).role !== 'CO1') return null
  return session
}

// GET — 전체 권한 목록
export async function GET() {
  if (!await requireCO1()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const users = await getUserPermissions()
  return NextResponse.json({ users })
}

// POST — 사용자 추가
export async function POST(req: Request) {
  if (!await requireCO1()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { email, name, role } = await req.json()
  if (!email || !role) return NextResponse.json({ error: 'email, role 필수' }, { status: 400 })
  await addUserPermission({ email: email.trim(), name: name || '', role })
  return NextResponse.json({ success: true })
}

// PUT — 사용자 수정
export async function PUT(req: Request) {
  if (!await requireCO1()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { rowIndex, email, name, role } = await req.json()
  if (!rowIndex) return NextResponse.json({ error: 'rowIndex 필수' }, { status: 400 })
  await updateUserPermission(rowIndex, { email, name, role })
  return NextResponse.json({ success: true })
}

// DELETE — 사용자 삭제
export async function DELETE(req: Request) {
  if (!await requireCO1()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { rowIndex } = await req.json()
  if (!rowIndex) return NextResponse.json({ error: 'rowIndex 필수' }, { status: 400 })
  await deleteUserPermission(rowIndex)
  return NextResponse.json({ success: true })
}
