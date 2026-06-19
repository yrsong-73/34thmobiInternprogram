'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Nav from '@/components/Nav'
import type { CO1Feedback, Intern, LectureFeedback, ScheduleRow } from '@/types'

// ── 인턴 피드백 집계용 ──────────────────────────────────────────────────────

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

function getTargetCount(row: ScheduleRow, interns: Intern[]): number {
  if (row.job_types.includes('all')) return interns.length
  return interns.filter(i => row.job_types.includes(i.type)).length
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

// ── CO1 강사 평가 모달 ──────────────────────────────────────────────────────

const FORM_TYPES = ['이론 중심', '실습 중심', '이론+실습 혼합']
const MATERIAL_OPTIONS = ['내용 충실', '예시 활용(데이터·프로젝트 등)', '디자인 우수']
const PRACTICE_TYPES = ['실습·발표', '과제', '시험']

function Radio({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', color: checked ? 'var(--mobi-dark)' : 'var(--text-primary)' }}>
      <span style={{
        width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
        border: `2px solid ${checked ? 'var(--mobi-dark)' : 'var(--border-strong)'}`,
        background: checked ? 'var(--mobi-dark)' : '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s',
      }}>
        {checked && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fff' }} />}
      </span>
      {label}
    </label>
  )
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', color: checked ? 'var(--mobi-dark)' : 'var(--text-primary)' }} onClick={onChange}>
      <span style={{
        width: '16px', height: '16px', borderRadius: '4px', flexShrink: 0,
        border: `2px solid ${checked ? 'var(--mobi-dark)' : 'var(--border-strong)'}`,
        background: checked ? 'var(--mobi-dark)' : '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s', fontSize: '10px', color: '#fff',
      }}>
        {checked && '✓'}
      </span>
      {label}
    </label>
  )
}

interface CO1EvalFormState {
  form_type: string
  content_fit: string
  practical: string
  difficulty: string
  time_mgmt: string
  instructor_quality: string
  material_checks: string[]
  opinion_content: string
  opinion_instructor: string
  opinion_qa: string
  practice_type: string
  practice_memo: string
}

function CO1EvalModal({
  row,
  existing,
  onClose,
  onSave,
}: {
  row: ScheduleRow
  existing?: CO1Feedback
  onClose: () => void
  onSave: (form: CO1EvalFormState) => Promise<void>
}) {
  const [form, setForm] = useState<CO1EvalFormState>({
    form_type:           existing?.form_type           || '',
    content_fit:         existing?.content_fit         || '',
    practical:           existing?.practical           || '',
    difficulty:          existing?.difficulty          || '',
    time_mgmt:           existing?.time_mgmt           || '',
    instructor_quality:  existing?.instructor_quality  || '',
    material_checks:     existing?.material_checks ? existing.material_checks.split(',').map(s => s.trim()).filter(Boolean) : [],
    opinion_content:     existing?.opinion_content     || '',
    opinion_instructor:  existing?.opinion_instructor  || '',
    opinion_qa:          existing?.opinion_qa          || '',
    practice_type:       existing?.practice_type       || '',
    practice_memo:       existing?.practice_memo       || '',
  })
  const [saving, setSaving] = useState(false)

  const set = (k: keyof CO1EvalFormState, v: string) => setForm(p => ({ ...p, [k]: v }))
  const toggleMaterial = (opt: string) => setForm(p => {
    const arr = p.material_checks.includes(opt) ? p.material_checks.filter(x => x !== opt) : [...p.material_checks, opt]
    return { ...p, material_checks: arr }
  })

  const hasPractice = form.form_type === '실습 중심' || form.form_type === '이론+실습 혼합'

  const required = [form.form_type, form.content_fit, form.practical, form.difficulty, form.time_mgmt, form.instructor_quality]
  const isValid = required.every(v => v.trim())

  async function handleSave() {
    if (!isValid) return
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  const sectionStyle: React.CSSProperties = {
    marginBottom: '20px',
  }
  const sectionLabel: React.CSSProperties = {
    fontSize: '12px', fontWeight: 700, color: '#1D4490',
    marginBottom: '10px', paddingBottom: '6px',
    borderBottom: '1px solid #DBEAFE',
  }
  const radioGroup = (key: keyof CO1EvalFormState, options: { value: string; sub?: string }[]) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {options.map(opt => (
        <div key={opt.value}>
          <Radio
            label={opt.value}
            checked={form[key] === opt.value}
            onChange={() => set(key, opt.value)}
          />
          {opt.sub && form[key] === opt.value && (
            <div style={{ marginLeft: '22px', fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>{opt.sub}</div>
          )}
        </div>
      ))}
    </div>
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: '16px',
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '560px',
        maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }} onClick={e => e.stopPropagation()}>

        {/* 모달 헤더 */}
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700 }}>✍️ 강사 평가</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>
                {row.date_label} · <strong>{row.name}</strong> · {row.teacher !== '-' ? row.teacher : '강사 미정'}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', color: 'var(--text-muted)', cursor: 'pointer', lineHeight: 1 }}>✕</button>
          </div>
        </div>

        {/* 폼 바디 — 스크롤 */}
        <div style={{ padding: '18px 22px', overflowY: 'auto', flex: 1 }}>

          {/* B. 강의 내용 */}
          <div style={sectionStyle}>
            <div style={sectionLabel}>B. 강의 내용</div>

            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '12.5px', fontWeight: 600, marginBottom: '8px' }}>강의 형태</div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {FORM_TYPES.map(v => (
                  <Radio key={v} label={v} checked={form.form_type === v} onChange={() => set('form_type', v)} />
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '12.5px', fontWeight: 600, marginBottom: '8px' }}>목적·내용 적합성</div>
              {radioGroup('content_fit', [
                { value: '명확·부합', sub: '목적이 명확하고 내용이 목적에 잘 부합' },
                { value: '보통',     sub: '목적은 어느 정도 전달됐으나 불필요한 내용 일부 포함' },
                { value: '미흡',     sub: '목적이 불명확하거나 내용이 목적과 동떨어짐' },
              ])}
            </div>

            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '12.5px', fontWeight: 600, marginBottom: '8px' }}>실무 연계도</div>
              {radioGroup('practical', [
                { value: '높음', sub: '실무 연계가 매우 높고 바로 활용 가능' },
                { value: '보통', sub: '실무와 연결되나 바로 적용은 어려움' },
                { value: '낮음', sub: '실무 연결이 어렵고 이론/형식 위주' },
              ])}
            </div>

            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '12.5px', fontWeight: 600, marginBottom: '8px' }}>세션 난이도</div>
              {radioGroup('difficulty', [
                { value: '쉬움',   sub: '대부분 무리 없이 따라옴' },
                { value: '적당',   sub: '약간의 고민·질문이 생기나 해결 가능' },
                { value: '어려움', sub: '절반 이상이 따라오기 어려움' },
              ])}
            </div>

            <div>
              <div style={{ fontSize: '12.5px', fontWeight: 600, marginBottom: '8px' }}>시간 운영</div>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {['적정', '짧음', '김'].map(v => (
                  <Radio key={v} label={v} checked={form.time_mgmt === v} onChange={() => set('time_mgmt', v)} />
                ))}
              </div>
            </div>
          </div>

          {/* C. 강사 */}
          <div style={sectionStyle}>
            <div style={sectionLabel}>C. 강사</div>

            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '12.5px', fontWeight: 600, marginBottom: '8px' }}>강의력·소통력</div>
              {radioGroup('instructor_quality', [
                { value: '잘함', sub: '핵심을 명확히 전달하고 참여·소통을 잘 이끎' },
                { value: '보통', sub: '전달은 무난하나 소통은 질의응답 중심/다소 일방적' },
                { value: '미흡', sub: '핵심 전달이 약하고 소통이 거의 없음' },
              ])}
            </div>

            <div>
              <div style={{ fontSize: '12.5px', fontWeight: 600, marginBottom: '8px' }}>교안 (복수 선택)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {MATERIAL_OPTIONS.map(opt => (
                  <Checkbox
                    key={opt}
                    label={opt}
                    checked={form.material_checks.includes(opt)}
                    onChange={() => toggleMaterial(opt)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* D. 정성 의견 */}
          <div style={sectionStyle}>
            <div style={sectionLabel}>D. ★ 정성 의견</div>
            {[
              { key: 'opinion_content'    as const, label: '강의 내용·구성 개선 의견' },
              { key: 'opinion_instructor' as const, label: '강사·전달 관련 코멘트' },
              { key: 'opinion_qa'         as const, label: '질문 및 소통 내용 기록' },
            ].map(({ key, label }) => (
              <div key={key} style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '12.5px', fontWeight: 600, marginBottom: '6px' }}>{label}</div>
                <textarea
                  value={form[key]}
                  onChange={e => set(key, e.target.value)}
                  rows={3}
                  placeholder="내용을 입력하세요..."
                  style={{ width: '100%', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 10px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' as const, lineHeight: 1.65 }}
                />
              </div>
            ))}
          </div>

          {/* E. 실습 (조건부) */}
          {hasPractice && (
            <div style={sectionStyle}>
              <div style={{ ...sectionLabel, color: '#6D28D9', borderColor: '#EDE9FE' }}>E. 실습</div>

              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '12.5px', fontWeight: 600, marginBottom: '8px' }}>실습 형태</div>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  {PRACTICE_TYPES.map(v => (
                    <Radio key={v} label={v} checked={form.practice_type === v} onChange={() => set('practice_type', v)} />
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '12.5px', fontWeight: 600, marginBottom: '6px' }}>실습 관련 메모</div>
                <textarea
                  value={form.practice_memo}
                  onChange={e => set('practice_memo', e.target.value)}
                  rows={2}
                  placeholder="실습 진행 상황, 특이사항 등..."
                  style={{ width: '100%', border: '1px solid #DDD6FE', borderRadius: '8px', padding: '8px 10px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' as const }}
                />
              </div>
            </div>
          )}
        </div>

        {/* 하단 버튼 */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', gap: '8px', justifyContent: 'flex-end', background: '#FAFAF8' }}>
          <button onClick={onClose} style={{ padding: '9px 20px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid || saving}
            style={{ padding: '9px 24px', borderRadius: '8px', border: 'none', background: isValid ? 'var(--mobi-orange)' : '#D1CFC8', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: isValid && !saving ? 'pointer' : 'not-allowed', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
            {saving ? '저장 중...' : (existing ? '수정 저장' : '제출')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 메인 페이지 ────────────────────────────────────────────────────────────

export default function FeedbackAdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const role     = (session?.user as any)?.role as string | undefined
  const userName = (session?.user as any)?.userName || session?.user?.name || ''

  const [feedbacks, setFeedbacks]           = useState<LectureFeedback[]>([])
  const [scheduleRows, setScheduleRows]     = useState<ScheduleRow[]>([])
  const [interns, setInterns]               = useState<Intern[]>([])
  const [myCO1Feedbacks, setMyCO1Feedbacks] = useState<Record<string, CO1Feedback>>({})
  const [co1CountMap, setCO1CountMap]       = useState<Record<string, number>>({})
  const [loading, setLoading]               = useState(true)
  const [expanded, setExpanded]             = useState<string | null>(null)
  const [filterDay, setFilterDay]           = useState<string>('all')
  const [co1Target, setCO1Target]           = useState<ScheduleRow | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login')
    if (status === 'authenticated' && role !== 'CO1') router.replace('/schedule')
  }, [status, role, router])

  useEffect(() => {
    if (status !== 'authenticated' || role !== 'CO1') return
    Promise.all([
      fetch('/api/feedbacks').then(r => r.json()),
      fetch('/api/schedule').then(r => r.json()),
      fetch('/api/interns').then(r => r.json()),
      fetch('/api/settings').then(r => r.json()),
      fetch('/api/co1-feedbacks').then(r => r.json()),
    ]).then(([fbData, schedData, internsData, settingsData, co1Data]) => {
      setFeedbacks(fbData.feedbacks ?? [])
      setInterns(internsData.interns ?? [])

      // CO1 강사 평가: 본인 것 + 전체 건수
      const allCO1: CO1Feedback[] = co1Data.feedbacks ?? []
      const co1Map: Record<string, CO1Feedback> = {}
      const countMap: Record<string, number> = {}
      for (const fb of allCO1) {
        if (fb.evaluator === userName) co1Map[fb.lecture_name] = fb
        countMap[fb.lecture_name] = (countMap[fb.lecture_name] ?? 0) + 1
      }
      setMyCO1Feedbacks(co1Map)
      setCO1CountMap(countMap)

      const settings = settingsData.settings
      const jv = settings ?? { job_visible_marketing: true, job_visible_aiax: true, job_visible_biz: true }
      setScheduleRows((schedData.rows ?? []).filter((r: ScheduleRow) => {
        if (r.type !== 'offline') return false
        if (r.feedback_exclude) return false
        if (r.week_num === 2 && !settings?.week_2_visible) return false
        if (r.job_types.includes('all')) return true
        if (r.job_types.includes('marketing') && jv.job_visible_marketing) return true
        if (r.job_types.includes('aiax')      && jv.job_visible_aiax)      return true
        if (r.job_types.includes('biz')       && jv.job_visible_biz)       return true
        return false
      }))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [status, role])

  async function handleCO1Save(form: CO1EvalFormState) {
    if (!co1Target) return
    await fetch('/api/co1-feedbacks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lecture_name:    co1Target.name,
        lecture_teacher: co1Target.teacher,
        lecture_date:    co1Target.date_label,
        ...form,
        material_checks: form.material_checks.join(','),
      }),
    })
    // 로컬 state 업데이트
    setMyCO1Feedbacks(prev => ({
      ...prev,
      [co1Target.name]: {
        evaluator:       userName,
        timestamp:       new Date().toISOString(),
        lecture_name:    co1Target.name,
        lecture_teacher: co1Target.teacher,
        lecture_date:    co1Target.date_label,
        ...form,
        material_checks: form.material_checks.join(','),
      },
    }))
    setCO1Target(null)
  }

  if (status === 'loading' || loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'var(--text-muted)' }}>불러오는 중...</div>
    </div>
  )

  // 강의별 집계
  const lectureMap: Record<string, { row?: ScheduleRow; feedbacks: LectureFeedback[] }> = {}
  for (const row of scheduleRows) {
    if (!lectureMap[row.name]) lectureMap[row.name] = { feedbacks: [] }
    lectureMap[row.name].row = row
  }
  for (const fb of feedbacks) {
    if (!lectureMap[fb.lecture_name]) lectureMap[fb.lecture_name] = { feedbacks: [] }
    lectureMap[fb.lecture_name].feedbacks.push(fb)
  }

  const allDates = Array.from(new Set(scheduleRows.map(r => r.date_label))).sort()

  const filteredLectures = Object.entries(lectureMap)
    .filter(([, v]) => v.row !== undefined)
    .filter(([, v]) => filterDay === 'all' || v.row?.date_label === filterDay)
    .sort((a, b) => {
      const aDay = a[1].row?.day_num ?? 99
      const bDay = b[1].row?.day_num ?? 99
      if (aDay !== bDay) return aDay - bDay
      return (a[1].row?.time ?? '').localeCompare(b[1].row?.time ?? '')
    })

  return (
    <>
      <Nav />
      <main style={{ padding: '32px', maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.5px', marginBottom: '6px' }}>📊 강의 피드백 집계</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13.5px' }}>
            오프라인 강의 {filteredLectures.length}개 · 인턴 응답 {feedbacks.length}건
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
            피드백 대상 강의가 없습니다
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filteredLectures.map(([lectureName, { row, feedbacks: lFbs }]) => {
              const isExp    = expanded === lectureName
              const count    = lFbs.length
              const total    = row ? getTargetCount(row, interns) : 0
              const pct      = total > 0 ? count / total : 0
              const responseColor = pct >= 1 ? '#059669' : pct >= 0.5 ? '#D97706' : count > 0 ? 'var(--primary)' : 'var(--text-muted)'
              const responseBg    = pct >= 1 ? 'rgba(5,150,105,0.1)' : pct >= 0.5 ? 'rgba(217,119,6,0.1)' : count > 0 ? 'rgba(29,68,144,0.08)' : 'var(--bg-hover)'

              const avgs = Q_META.map(q => ({ ...q, score: avg(lFbs.map(f => f[q.key])) }))
              const overallAvg = avg(avgs.map(a => a.score))

              const myC1      = myCO1Feedbacks[lectureName]
              const co1Count  = co1CountMap[lectureName] ?? 0

              return (
                <div key={lectureName} style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)', overflow: 'hidden',
                  boxShadow: isExp ? 'var(--shadow)' : 'none',
                }}>
                  {/* 헤더 행 */}
                  <div
                    onClick={() => setExpanded(isExp ? null : lectureName)}
                    style={{ padding: '12px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}
                  >
                    {/* 날짜 배지 */}
                    {row && (
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#059669', background: '#ECFDF5', padding: '2px 8px', borderRadius: '20px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {row.date_label} {row.time}
                      </span>
                    )}

                    {/* 강의명 */}
                    <span style={{ fontSize: '14px', fontWeight: 700, flex: 1, minWidth: '100px' }}>
                      {lectureName}
                    </span>

                    {/* 강사 */}
                    {row?.teacher && row.teacher !== '-' && (
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{row.teacher}</span>
                    )}

                    {/* 인턴 응답 N/M */}
                    <span style={{ fontSize: '12px', fontWeight: 700, color: responseColor, background: responseBg, padding: '3px 10px', borderRadius: '20px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      인턴 {count} / {total}명
                    </span>

                    {/* 종합 평균 */}
                    {overallAvg > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>종합</span>
                        <span style={{ fontSize: '14px', fontWeight: 800, color: overallAvg >= 4 ? '#059669' : overallAvg >= 3 ? '#D97706' : '#EF4444' }}>
                          {overallAvg.toFixed(1)}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>/5</span>
                      </div>
                    )}

                    {/* CO1 강사 평가 버튼 + 전체 응답 건수 */}
                    {row && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                        {co1Count > 0 && (
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            강사평가 {co1Count}건
                          </span>
                        )}
                        <button
                          onClick={() => setCO1Target(row)}
                          style={{
                            padding: '4px 12px', borderRadius: '20px', fontSize: '11.5px', fontWeight: 700,
                            cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                            border: `1.5px solid ${myC1 ? '#059669' : 'var(--mobi-orange)'}`,
                            background: myC1 ? 'rgba(5,150,105,0.08)' : 'rgba(255,107,43,0.07)',
                            color: myC1 ? '#059669' : 'var(--mobi-orange)',
                          }}>
                          {myC1 ? '✅ 평가 완료' : '✍️ 강사 평가'}
                        </button>
                      </div>
                    )}

                    <span style={{ color: 'var(--text-muted)', fontSize: '13px', flexShrink: 0 }}>
                      {isExp ? '▲' : '▼'}
                    </span>
                  </div>

                  {/* 펼침: 인턴 피드백 집계 */}
                  {isExp && (
                    <div style={{ borderTop: '1px solid var(--border)', padding: '16px 18px' }}>
                      {count === 0 ? (
                        <div style={{ color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic' }}>
                          아직 인턴 응답이 없습니다
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px', marginBottom: '20px' }}>
                            {avgs.map(a => (
                              <div key={a.key} style={{ background: '#F8F7F4', borderRadius: '8px', padding: '10px 12px' }}>
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

                          {(['q7_helpful', 'q8_difficult', 'q9_improvement'] as const).map(qk => {
                            const qLabels: Record<string, string> = {
                              q7_helpful:     '💡 가장 도움이 된 내용',
                              q8_difficult:   '🤔 이해하기 어려웠던 내용',
                              q9_improvement: '🔧 개선이 필요한 점',
                            }
                            const answers = lFbs.map(f => ({ intern: f.intern_name, text: f[qk] })).filter(a => a.text.trim())
                            if (answers.length === 0) return null
                            return (
                              <div key={qk} style={{ marginBottom: '16px' }}>
                                <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>{qLabels[qk]}</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  {answers.map((a, i) => (
                                    <div key={i} style={{ background: '#FAFAF8', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px' }}>
                                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px', fontWeight: 600 }}>{a.intern}</div>
                                      <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{a.text}</div>
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

      {/* CO1 강사 평가 모달 */}
      {co1Target && (
        <CO1EvalModal
          row={co1Target}
          existing={myCO1Feedbacks[co1Target.name]}
          onClose={() => setCO1Target(null)}
          onSave={handleCO1Save}
        />
      )}
    </>
  )
}
