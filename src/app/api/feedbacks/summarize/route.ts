export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'

/**
 * 강의 피드백(주관식 응답)을 AI로 요약. 특정 강의 하나 또는 "전체 강의" 둘 다
 * 같은 엔드포인트로 처리 — title에 뭐가 오든 프롬프트가 자연스럽게 대응한다.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any)?.role !== 'CO1') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { title, records } = await req.json()
  if (!title || !records?.length) {
    return NextResponse.json({ error: '제목과 피드백 기록이 필요합니다' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다' }, { status: 500 })

  const client = new Anthropic({ apiKey })

  const recordText = (records as string[]).join('\n')

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 700,
    messages: [{
      role: 'user',
      content: `다음은 "${title}"에 대한 인턴 피드백 주관식 응답들입니다:\n\n${recordText}\n\n위 응답들을 바탕으로 자주 언급된 좋았던 점, 어려웠던 점, 개선 요청 사항을 항목별로 간결하게 요약해주세요. 한국어로 작성하고, 여러 강의를 아우르는 내용이면 강의별로 구분해서 정리해주세요. 제목이나 마크다운 헤더(#) 없이 바로 내용만 작성해주세요.`,
    }],
  })

  const block = message.content[0]
  if (!block || block.type !== 'text') {
    return NextResponse.json({ error: 'AI 응답 형식 오류' }, { status: 500 })
  }
  const summary = (block as { type: string; text: string }).text ?? ''
  return NextResponse.json({ summary })
}
