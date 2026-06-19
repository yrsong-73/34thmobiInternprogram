'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Nav from '@/components/Nav'
import type { LectureFeedback, ScheduleRow } from '@/types'

const Q_META = [
  { key: 'q1_satisfaction' as const, label: '전반 만족도' },
  { key: 'q2_structure'    as const, label: '구성·흐름' },
  { key: 'q3_depth'        as const, label: '내용 깊이' },
  { key: 'q4_explanation'  as const, label: '설명·예시' },
  { key: 'q5_practical'    as const, label: '실무활용' },
]

function avg(nums: number[]): number {
  const valid = nums.filter(n => n > 0)
  if (valid.length === 0) return 0
  return valid.reduce((a, b) => a + b, 0) / valid.length
}

function ScoreBar({ score, max = 5 }: { score: number; max?: number }) {
  if (score === 0) return <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>—</span>
  const pct = (score / max) * 100
  const color = pct >= 80 ? '#059669' : pct >= 60 ? '#D97706' : '#EF4444'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ width: '60px', height: '6px', background: 'var(--border)', borderRadius: '999px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '999px', transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: '12px', fontWeight: 700, color }}>{score.toFixed(1)}</span>
    </div>
  )
}

export default function FeedbackAdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const role = (session?.user as any)?.role as string | undefined

  const [feedbacks, setFeedbacks]     = useState<LectureFeedback[]>([])
  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>([])
  const [loading, setLoading]         = useState(true)
  const [expanded, setExpanded]       = useState<string | null>(null)   // lecture_name
  const [filterDay, setFilterDay]     = useState<string>('all')

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login')
    if (status === 'authenticated' && role === 'Intern') router.replace('/schedule')
  }, [status, role, router])

  useEffect(() => {
    if (status !== 'authenticated' || role === 'Intern') return
    Promise.all([
      fetch('/api/feedbacks').then(r => r.json()),
      fetch('/api/schedule').then(r => r.json()),
    ]).then(([fbData, schedData]) => {
      setFeedbacks(fbData.feedbacks ?? [])
      setScheduleRows((schedData.rows ?? []).filter((r: ScheduleRow) => r.type === 'offline'))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [status, role])

  if (status === 'loading' || loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'var(--text-muted)' }}>불러오는 중...</div>
    </div>
  )

  // 강의별 집계
  const lectureMap: Record<string, { row?: ScheduleRow; feedbacks: LectureFeedback[] }> = {}
  for (const fb of feedbacks) {
    if (!lectureMap[fb.lecture_name]) lectureMap[fb.lecture_name] = { feedbacks: [] }
    lectureMap[fb.lecture_name].feedbacks.push(fb)
  }
  for (const row of scheduleRows) {
    if (!lectureMap[row.name]) lectureMap[row.name] = { feedbacks: [] }
    lectureMap[row.name].row = row
  }

  // 날짜 목록 (필터용)
  const allDates = Array.from(new Set(scheduleRows.map(r => r.date_label))).sort()

  const filteredLectures = Object.entries(lectureMap)
    .filter(([, v]) => filterDay === 'all' || v.row?.date_label === filterDay)
    .sort((a, b) => {
      const aDay = a[1].row?.day_num ?? 99
      const bDay = b[1].row?.day_num ?? 99
      if (aDay !== bDay) return aDay - bDay
      return (a[1].row?.time ?? '').localeCompare(b[1].row?.time ?? '')
    })

  const totalResponses = feedbacks.length
  const totalLectures = filteredLectures.length

  return (
    <>
      <Nav />
      <main style={{ padding: '32px', maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.5px', marginBottom: '6px' }}>📊 강의 피드백 집계</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13.5px' }}>
            오프라인 강의 {totalLectures}개 · 총 응답 {totalResponses}건
          </p>
        </div>

        {/* 날짜 필터 */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {(['all', ...allDates] as string[]).map(d => (
            <button key={d} onClick={() => setFilterDay(d)}
              style={{
                padding: '6px 14px', borderRadius: '20px', fontSize: '12.5px', fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                border: `1.5px solid ${filterDay === d ? 'var(--mobi-dark)' : 'var(--border-strong)'}`,
                background: filterDay === d ? 'var(--mobi-dark)' : '#fff',
                color: filterDay === d ? '#fff' : 'var(--text-secondary)',
              }}>
              {d === 'all' ? '전체' : d}
            </button>
          ))}
        </div>

        {filteredLectures.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px', opacity: 0.35 }}>📋</div>
            아직 피드백 데이터가 없습니다
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filteredLectures.map(([lectureName, { row, feedbacks: lFbs }]) => {
              const isExp = expanded === lectureName
              const count = lFbs.length

              const avgs = Q_META.map(q => ({ ...q, score: avg(lFbs.map(f => f[q.key])) }))
              const overallAvg = avg(avgs.map(a => a.score))

              return (
                <div key={lectureName} style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)', overflow: 'hidden',
                  boxShadow: isExp ? 'var(--shadow)' : 'none',
                }}>
                  {/* 헤더 행 */}
                  <div
                    onClick={() => setExpanded(isExp ? null : lectureName)}
                    style={{
                      padding: '14px 18px', cursor: 'pointer', display: 'flex',
                      alignItems: 'center', gap: '12px', flexWrap: 'wrap',
                    }}
                  >
                    {/* 날짜 배지 */}
                    {row && (
                      <span style={{
                        fontSize: '11px', fontWeight: 700, color: '#059669',
                        background: '#ECFDF5', padding: '2px 8px', borderRadius: '20px',
                        whiteSpace: 'nowrap', flexShrink: 0,
                      }}>
                        {row.date_label} {row.time}
                      </span>
                    )}

                    {/* 강의명 */}
                    <span style={{ fontSize: '14px', fontWeight: 700, flex: 1, minWidth: '120px' }}>
                      {lectureName}
                    </span>

                    {/* 강사 */}
                    {row?.teacher && row.teacher !== '-' && (
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{row.teacher}</span>
                    )}

                    {/* 응답 수 */}
                    <span style={{
                      fontSize: '12px', fontWeight: 700, color: count > 0 ? 'var(--primary)' : 'var(--text-muted)',
                      background: count > 0 ? 'rgba(29,68,144,0.08)' : 'var(--bg-hover)',
                      padding: '3px 10px', borderRadius: '20px', whiteSpace: 'nowrap', flexShrink: 0,
                    }}>
                      응답 {count}건
                    </span>

                    {/* 종합 평균 */}
                    {overallAvg > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>종합</span>
                        <span style={{
                          fontSize: '14px', fontWeight: 800,
                          color: overallAvg >= 4 ? '#059669' : overallAvg >= 3 ? '#D97706' : '#EF4444',
                        }}>
                          {overallAvg.toFixed(1)}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>/5</span>
                      </div>
                    )}

                    <span style={{ color: 'var(--text-muted)', fontSize: '13px', flexShrink: 0 }}>
                      {isExp ? '▲' : '▼'}
                    </span>
                  </div>

                  {/* 펼침: 상세 집계 */}
                  {isExp && (
                    <div style={{ borderTop: '1px solid var(--border)', padding: '16px 18px' }}>
                      {count === 0 ? (
                        <div style={{ color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic' }}>
                          아직 응답이 없습니다
                        </div>
                      ) : (
                        <>
                          {/* 정량 평균 바 */}
                          <div style={{
                            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                            gap: '10px', marginBottom: '20px',
                          }}>
                            {avgs.map(a => (
                              <div key={a.key} style={{
                                background: '#F8F7F4', borderRadius: '8px', padding: '10px 12px',
                              }}>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px' }}>{a.label}</div>
                                <ScoreBar score={a.score} />
                              </div>
                            ))}
                            {(() => {
                              const q6s = lFbs.map(f => f.q6_practice ?? 0).filter(n => n > 0)
                              if (q6s.length === 0) return null
                              return (
                                <div style={{ background: '#F8F7F4', borderRadius: '8px', padding: '10px 12px' }}>
                                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '5px' }}>실습</div>
                                  <ScoreBar score={avg(q6s)} />
                                </div>
                              )
                            })()}
                          </div>

                          {/* 정성 답변 */}
                          {(['q7_helpful', 'q8_difficult', 'q9_improvement'] as const).map(qk => {
                            const qLabels: Record<string, string> = {
                              q7_helpful:      '💡 가장 도움이 된 내용',
                              q8_difficult:    '🤔 이해하기 어려웠던 내용',
                              q9_improvement:  '🔧 개선이 필요한 점',
                            }
                            const answers = lFbs.map(f => ({ intern: f.intern_name, text: f[qk] })).filter(a => a.text.trim())
                            if (answers.length === 0) return null
                            return (
                              <div key={qk} style={{ marginBottom: '16px' }}>
                                <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                                  {qLabels[qk]}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  {answers.map((a, i) => (
                                    <div key={i} style={{
                                      background: '#FAFAF8', border: '1px solid var(--border)',
                                      borderRadius: '8px', padding: '8px 12px',
                                    }}>
                                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px', fontWeight: 600 }}>
                                        {a.intern}
                                      </div>
                                      <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                                        {a.text}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )
                          })}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </>
  )
}
