export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'
import { getAiSummaries, upsertAiSummary } from '@/lib/sheets'

/** 저장된 AI 요약 전체 조회 — 강의별(key=강의명) + 전체(key='__overall__') */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any)?.role !== 'CO1') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const summaries = await getAiSummaries()
  return NextResponse.json({ summaries })
}

/**
 * 강의 피드백(주관식 응답)을 AI로 요약. 특정 강의 하나 또는 "전체 강의" 둘 다
 * 같은 엔드포인트로 처리 — title에 뭐가 오든 프롬프트가 자연스럽게 대응한다.
 * 생성 결과는 ai_summaries 시트에 저장해서, 매번 다시 열 때마다 API를 또 호출하지 않는다.
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
      content: `다음은 "${title}"에 대한 인턴 피드백 주관식 응답들입니다:\n\n${recordText}\n\n위 응답들을 아래 3개 항목으로 나눠서 정리해줘. 각 항목은 [좋았던 점], [어려웠던 점], [개선 요청 사항]으로 소제목을 달고, 자주 언급된 내용 위주로 간결하게 정리해줘. 여러 강의에 대한 내용이 섞여 있으면 해당 강의명을 괄호로 표시해줘. 특정 항목에 해당하는 응답이 전혀 없으면 "특별한 의견 없음"이라고 명시해줘 — 항목 자체를 빼먹지 마. 한국어로 작성하고, 마크다운 헤더(#)나 별표는 쓰지 말고 대괄호 소제목과 줄바꿈만 사용해줘.`,
    }],
  })

  const block = message.content[0]
  if (!block || block.type !== 'text') {
    return NextResponse.json({ error: 'AI 응답 형식 오류' }, { status: 500 })
  }
  const summary = (block as { type: string; text: string }).text ?? ''

  const key = title === '전체 강의' ? '__overall__' : title
  await upsertAiSummary(key, summary)

  return NextResponse.json({ summary })
}
