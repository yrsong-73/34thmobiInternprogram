export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any)?.role !== 'CO1') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { internName, records } = await req.json()
  if (!internName || !records?.length) {
    return NextResponse.json({ error: '인턴명과 기록이 필요합니다' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다' }, { status: 500 })

  const client = new Anthropic({ apiKey })

  const recordText = records
    .map((r: { date: string; author: string; content: string }) => `[${r.date}] ${r.author}: ${r.content}`)
    .join('\n')

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `다음은 인턴 "${internName}"에 대한 관찰 기록들입니다:\n\n${recordText}\n\n위 기록들을 바탕으로 이 인턴의 태도, 강점, 성장포인트를 3~4문장으로 간결하게 요약해주세요. 한국어로 작성하고, 긍정적이고 건설적인 톤으로 써주세요.`,
    }],
  })

  const summary = (message.content[0] as { type: string; text: string }).text ?? ''
  return NextResponse.json({ summary })
}
