export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getInterviews, addInterview, updateInterviewBooking, deleteInterview } from '@/lib/sheets'

function isCoOrMember(role: string) {
  return role === 'CO1' || role === 'Member'
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const internName = searchParams.get('internName')

  const all = await getInterviews()
  const filtered = internName ? all.filter(r => r.intern_name === internName) : all
  return NextResponse.json({ interviews: filtered })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as any)?.role as string
  if (role !== 'CO1') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { intern_name, date, time_slot } = await req.json()
  if (!intern_name || !date || !time_slot) {
    return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 })
  }

  await addInterview({ intern_name, date, time_slot, booked_by: '' })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as any)?.role as string
  if (!isCoOrMember(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { rowIndex, booked_by } = await req.json()
  if (!rowIndex) return NextResponse.json({ error: 'rowIndex 필요' }, { status: 400 })

  // 예약 시 중복 체크: 같은 인턴 + 같은 날짜 + 같은 시간에 이미 예약자가 있으면 409
  if (booked_by) {
    const all = await getInterviews()
    const target = all.find(r => r.rowIndex === rowIndex)
    if (target) {
      const conflict = all.find(
        r => r.rowIndex !== rowIndex &&
          r.intern_name === target.intern_name &&
          r.date === target.date &&
          r.time_slot === target.time_slot &&
          r.booked_by
      )
      if (conflict) {
        return NextResponse.json({ error: '해당 인턴의 이 시간대에 이미 예약이 있습니다' }, { status: 409 })
      }
    }
  }

  await updateInterviewBooking(rowIndex, booked_by ?? '')
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as any)?.role as string
  if (!isCoOrMember(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { rowIndex } = await req.json()
  if (!rowIndex) return NextResponse.json({ error: 'rowIndex 필요' }, { status: 400 })

  await deleteInterview(rowIndex)
  return NextResponse.json({ ok: true })
}
