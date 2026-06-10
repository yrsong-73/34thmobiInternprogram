export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getNotices, addNotice, updateNotice, deleteNotice } from '@/lib/sheets'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const notices = await getNotices()
  return NextResponse.json({ notices })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'CO1') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { title, content } = await req.json()
  if (!title) return NextResponse.json({ error: 'title 필수' }, { status: 400 })
  const author = (session.user as any).userName || session.user.name || ''
  const created_at = new Date().toISOString().split('T')[0]
  await addNotice({ title, content: content || '', author, created_at })
  return NextResponse.json({ success: true })
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'CO1') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { rowIndex, title, content } = await req.json()
  if (!rowIndex) return NextResponse.json({ error: 'rowIndex 필수' }, { status: 400 })
  await updateNotice(rowIndex, { title, content: content || '' })
  return NextResponse.json({ success: true })
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'CO1') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { rowIndex } = await req.json()
  if (!rowIndex) return NextResponse.json({ error: 'rowIndex 필수' }, { status: 400 })
  await deleteNotice(rowIndex)
  return NextResponse.json({ success: true })
}
