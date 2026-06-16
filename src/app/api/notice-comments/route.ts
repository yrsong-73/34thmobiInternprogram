export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getNoticeComments, addNoticeComment, deleteNoticeComment } from '@/lib/sheets'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const noticeId = Number(searchParams.get('noticeId'))
  if (!noticeId) return NextResponse.json({ error: 'noticeId 필수' }, { status: 400 })
  const comments = await getNoticeComments(noticeId)
  return NextResponse.json({ comments })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { noticeId, content } = await req.json()
  if (!noticeId || !content?.trim()) return NextResponse.json({ error: '필수값 누락' }, { status: 400 })
  const author = (session.user as any).userName || session.user.name || ''
  const role   = (session.user as any).role || 'Intern'
  const created_at = new Date().toISOString().replace('T', ' ').slice(0, 16)
  await addNoticeComment({ notice_id: noticeId, author, content: content.trim(), created_at, role })
  return NextResponse.json({ success: true })
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'CO1') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { rowIndex } = await req.json()
  if (!rowIndex) return NextResponse.json({ error: 'rowIndex 필수' }, { status: 400 })
  await deleteNoticeComment(rowIndex)
  return NextResponse.json({ success: true })
}
