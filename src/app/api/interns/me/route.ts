export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getInterns } from '@/lib/sheets'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role     = (session.user as any)?.role as string
  const userName = (session.user as any)?.userName as string

  if (role !== 'Intern') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!userName)         return NextResponse.json({ error: 'userName missing' }, { status: 400 })

  const interns = await getInterns()
  const me = interns.find(i => i.name === userName)
  if (!me) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ name: me.name, job: me.job, type: me.type })
}
