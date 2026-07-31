'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import Nav from '@/components/Nav'
import { usePreview } from '@/context/PreviewContext'
import type { ScheduleRow, DayGroup, LectureType, LectureFeedback } from '@/types'

const TYPE_LABEL: Record<LectureType, string> = {
  online:  '온라인',
  offline: '오프라인',
  self:    '자기주도',
  exam:    '테스트',
  task:    '과제',
  lunch:   '웰컴런치',
}

const JOB_TABS = [
  { key: 'marketing', label: '📊 마케팅' },
  { key: 'aiax',      label: '🤖 AI·AX' },
  { key: 'biz',       label: '💼 사업기획·전략' },
  { key: 'cc',        label: '🎧 CC' },
]

const GRID_SLOTS = [
  '10:00','10:30','11:00','11:30',
  '12:00','12:30',
  '13:00','13:30','14:00','14:30','15:00','15:30',
  '16:00','16:30','17:00','17:30','18:00','18:30',
]
/** 강의 수정 모달의 시간 드롭다운 옵션 (그리드에 표시 가능한 시간 전부) */
const TIME_SLOT_OPTIONS = [...GRID_SLOTS, '19:00']
const SLOT_ROW: Record<string, number> = {}
GRID_SLOTS.forEach((t, i) => { SLOT_ROW[t] = i + 1 })
SLOT_ROW['19:00'] = 19

/** 시작/종료 시간으로 소요시간 문자열을 계산 (30분 단위 그리드 시간일 때만, 아니면 null) */
function computeDuration(start: string, end: string): string | null {
  const sr = SLOT_ROW[start]
  const er = SLOT_ROW[end]
  if (sr === undefined || er === undefined || er <= sr) return null
  const hours = (er - sr) * 0.5
  return `${hours % 1 === 0 ? hours : hours.toFixed(1)}h`
}

const LUNCH_SR = SLOT_ROW['12:00']
const LUNCH_ER = SLOT_ROW['13:30']

function parseRows(timeStr: string): { sr: number; er: number } | null {
  if (!timeStr || timeStr === '최종') return { sr: 18, er: 19 }
  const parts = timeStr.split('~')
  const t0 = parts[0].trim()
  const t1 = parts.length > 1 && parts[1].trim() ? parts[1].trim() : null
  const sr = SLOT_ROW[t0]
  if (sr === undefined) return null
  const er = t1 ? (SLOT_ROW[t1] ?? sr + 2) : sr + 2
  return { sr, er }
}

/** parseRows()의 역변환 — 그리드 행 번호를 시간 문자열로 (드래그로 시간 재계산할 때 사용) */
function rowToTime(row: number): string {
  return row === 19 ? '19:00' : GRID_SLOTS[row - 1]
}

/** 드래그로 옮길 수 있는 강의인지 (웰컴런치/과제/특수값/파싱 불가 시간은 제외) */
function isDraggableLecture(lec: ScheduleRow): boolean {
  if (lec.type === 'lunch' || lec.type === 'task') return false
  if (lec.time === '최종') return false
  return parseRows(lec.time) !== null
}

/** 같은 요일 안에서 시간이 겹치는 강의들을 구글 캘린더처럼 세로 컬럼으로 나눠 배치하기 위한 계산 */
function layoutOverlaps(items: { rowIndex: number; sr: number; er: number }[]): Map<number, { col: number; cols: number }> {
  const result = new Map<number, { col: number; cols: number }>()
  const sorted = [...items].sort((a, b) => a.sr - b.sr)

  let cluster: typeof sorted = []
  let clusterEnd = -Infinity

  function flush() {
    if (cluster.length === 0) return
    const colEnds: number[] = []
    const colOf = new Map<number, number>()
    for (const item of cluster) {
      let col = colEnds.findIndex(end => end <= item.sr)
      if (col === -1) { col = colEnds.length; colEnds.push(item.er) }
      else { colEnds[col] = item.er }
      colOf.set(item.rowIndex, col)
    }
    const cols = colEnds.length
    cluster.forEach(item => result.set(item.rowIndex, { col: colOf.get(item.rowIndex)!, cols }))
    cluster = []
  }

  for (const item of sorted) {
    if (cluster.length > 0 && item.sr >= clusterEnd) {
      flush()
      clusterEnd = -Infinity
    }
    cluster.push(item)
    clusterEnd = Math.max(clusterEnd, item.er)
  }
  flush()

  return result
}

const TYPE_COLOR: Record<string, string> = {
  online: '#3B82F6', offline: '#059669', self: '#8B5CF6',
  exam: '#E85D75', task: '#F59E0B', lunch: '#B45309',
}
const TYPE_BG: Record<string, string> = {
  online: '#EFF6FF', offline: '#ECFDF5', self: '#F5F3FF',
  exam: '#FFF5F7', task: '#FFFBEB', lunch: '#FFFDF5',
}

function showToast(msg: string) {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = msg
  el.classList.add('show')
  setTimeout(() => el.classList.remove('show'), 2200)
}

function emptyRow(weekNum: number, dayNum: number, dayLabel: string, dateLabel: string, evalLabel: string): Omit<ScheduleRow, 'rowIndex'> {
  return {
    week_num: weekNum, day_num: dayNum,
    day_label: dayLabel, date_label: dateLabel,
    eval_label: evalLabel, eval_link: '',
    time: '', name: '', type: 'offline', teacher: '',
    duration: '', link_labels: [], link_urls: [],
    lunch_with: '', note: '', job_types: ['all'], location: '',
    flow_stage: '', week_variant: '',
  }
}

// ─── EditModal (CO1용 강의 편집) ─────────────────────────────────────────────
const JOB_OPTIONS = [
  { key: 'all',       label: '전체' },
  { key: 'marketing', label: '마케팅' },
  { key: 'aiax',      label: 'AI·AX' },
  { key: 'biz',       label: '사업기획·전략' },
  { key: 'cc',        label: 'CC' },
]

function EditModal({
  row, onSave, onDelete, onClose, isCO1,
}: {
  row: Partial<ScheduleRow> & { isNew?: boolean }
  onSave: (data: Omit<ScheduleRow, 'rowIndex'>) => Promise<void>
  onDelete?: () => Promise<void>
  onClose: () => void
  isCO1: boolean
}) {
  // 기본 필드
  const [form, setForm] = useState({
    time:       row.time       ?? '',
    name:       row.name       ?? '',
    type:       row.type       ?? 'offline' as LectureType,
    teacher:    row.teacher    ?? '',
    location:   row.location   ?? '',
    lunch_with: row.lunch_with ?? '',
    note:       row.note       ?? '',
  })
  // 과제 첨부 — 일반 강의에도 제출 과제를 달아서 "과제 제출" 섹션에서 함께 관리
  const [hasAssignment, setHasAssignment] = useState(row.has_assignment ?? false)
  const [assignmentDeadline, setAssignmentDeadline] = useState(row.assignment_deadline ?? '')
  // 시간 드롭다운 표시용 — form.time("10:00~11:00")을 시작/종료로 분해 (직접입력과 항상 동기화)
  const [timeStart = '', timeEnd = ''] = form.time.split('~').map(s => s.trim())
  // 소요시간은 더 이상 직접 입력받지 않고 시작/종료 시간에서 항상 자동 계산
  // (계산 불가한 특수 시간값이면 기존 값을 그대로 유지)
  const computedDuration = computeDuration(timeStart, timeEnd) ?? row.duration ?? ''
  // 자료 링크: [{label, url}, ...]
  const initLinks = (() => {
    const labels = row.link_labels ?? []
    const urls   = row.link_urls   ?? []
    if (labels.length === 0) return [{ label: '', url: '' }]
    return labels.map((label, i) => ({ label, url: urls[i] ?? '' }))
  })()
  const [linkRows, setLinkRows] = useState<{ label: string; url: string }[]>(initLinks)
  // 대상 직무
  const [jobTypes, setJobTypes] = useState<string[]>(row.job_types ?? ['all'])
  const [saving, setSaving]     = useState(false)

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  function toggleJob(key: string) {
    if (key === 'all') {
      setJobTypes(['all'])
      return
    }
    setJobTypes(prev => {
      const withoutAll = prev.filter(j => j !== 'all')
      if (withoutAll.includes(key)) {
        const next = withoutAll.filter(j => j !== key)
        return next.length === 0 ? ['all'] : next
      }
      return [...withoutAll, key]
    })
  }

  function addLink() {
    setLinkRows(prev => [...prev, { label: '', url: '' }])
  }
  function removeLink(i: number) {
    setLinkRows(prev => prev.filter((_, idx) => idx !== i))
  }
  function setLink(i: number, field: 'label' | 'url', value: string) {
    setLinkRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }

  async function handleSave() {
    if (!form.name) { showToast('⚠️ 강의명을 입력해주세요'); return }
    setSaving(true)
    const validLinks = linkRows.filter(r => r.label.trim() || r.url.trim())
    await onSave({
      week_num:    row.week_num   ?? 1,
      day_num:     row.day_num    ?? 1,
      day_label:   row.day_label  ?? '',
      date_label:  row.date_label ?? '',
      eval_label:  row.eval_label ?? '',
      time:        form.time,
      name:        form.name,
      type:        form.type as LectureType,
      teacher:     form.teacher,
      location:    form.location,
      duration:    computedDuration,
      link_labels: validLinks.map(r => r.label.trim()),
      link_urls:   validLinks.map(r => r.url.trim()),
      lunch_with:  form.lunch_with,
      note:        form.note,
      job_types:      jobTypes.length > 0 ? jobTypes : ['all'],
      count_for_rate: row.count_for_rate ?? false,
      flow_stage:     row.flow_stage ?? '',
      week_variant:   row.week_variant ?? '',
      eval_link:      row.eval_link ?? '',
      has_assignment:      form.type === 'task' ? true : hasAssignment,
      assignment_deadline: (form.type === 'task' ? true : hasAssignment) ? assignmentDeadline : '',
    })
    setSaving(false)
  }

  const inputStyle = {
    width: '100%', padding: '8px 10px', border: '1px solid var(--border)',
    borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit',
    background: '#fff', color: 'var(--text-primary)', boxSizing: 'border-box' as const,
  }
  const labelStyle = {
    fontSize: '12px', fontWeight: 600 as const,
    color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' as const,
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: '#fff', borderRadius: '16px', padding: '28px 32px',
        width: '520px', maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700 }}>
            {row.isNew ? '➕ 강의 추가' : '✏️ 강의 수정'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>강의명 *</label>
            <input style={inputStyle} value={form.name} onChange={e => set('name', e.target.value)} placeholder="예: 퍼포먼스마케팅 기초" />
          </div>
          <div>
            <label style={labelStyle}>시간</label>
            <div style={{ display: 'flex', gap: '5px', alignItems: 'center', marginBottom: '6px' }}>
              <select
                style={{ ...inputStyle, padding: '7px 6px', flex: 1 }}
                value={timeStart}
                onChange={e => {
                  const newStart = e.target.value
                  set('time', newStart ? `${newStart}~${timeEnd}` : (timeEnd ? `~${timeEnd}` : ''))
                }}
              >
                <option value="">시작</option>
                {TIME_SLOT_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>~</span>
              <select
                style={{ ...inputStyle, padding: '7px 6px', flex: 1 }}
                value={timeEnd}
                onChange={e => {
                  const newEnd = e.target.value
                  set('time', `${timeStart}~${newEnd}`)
                }}
              >
                <option value="">종료 없음</option>
                {TIME_SLOT_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <input style={inputStyle} value={form.time} onChange={e => set('time', e.target.value)} placeholder="드롭다운 선택 또는 직접 입력 (예: 최종, 10:00~)" />
          </div>
          <div>
            <label style={labelStyle}>강의 형태</label>
            <select style={inputStyle} value={form.type} onChange={e => set('type', e.target.value)}>
              {(Object.keys(TYPE_LABEL) as LectureType[]).map(t => (
                <option key={t} value={t}>{TYPE_LABEL[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>강사</label>
            <input style={inputStyle} value={form.teacher} onChange={e => set('teacher', e.target.value)} placeholder="예: 송유림" />
          </div>
          <div>
            <label style={labelStyle}>장소</label>
            <input style={inputStyle} value={form.location} onChange={e => set('location', e.target.value)} placeholder="예: 3층 회의실" />
          </div>
          <div>
            <label style={labelStyle}>소요시간 (자동 계산)</label>
            <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', background: 'var(--bg-hover, #F3F4F6)', color: computedDuration ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              {computedDuration || '시간을 선택하면 자동으로 계산돼요'}
            </div>
          </div>
          {form.type === 'lunch' && (
            <div style={{ gridColumn: '1 / -1', background: 'var(--mobi-orange-light)', border: '1px solid var(--mobi-orange-border)', borderRadius: '8px', padding: '12px' }}>
              <label style={{ ...labelStyle, color: 'var(--mobi-orange)' }}>🍽️ 웰컴런치 동행자</label>
              <input style={{ ...inputStyle, border: '1px solid var(--mobi-orange-border)' }} value={form.lunch_with} onChange={e => set('lunch_with', e.target.value)} placeholder="예: 송유림, 김연준" />
            </div>
          )}

          {/* 자료 링크 — 행 단위 입력 */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>자료 링크</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {linkRows.map((lr, i) => (
                <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input
                    style={{ ...inputStyle, flex: '0 0 110px' }}
                    value={lr.label}
                    onChange={e => setLink(i, 'label', e.target.value)}
                    placeholder="레이블 (예: 교안)"
                  />
                  <input
                    style={{ ...inputStyle, flex: 1 }}
                    value={lr.url}
                    onChange={e => setLink(i, 'url', e.target.value)}
                    placeholder="URL (https://...)"
                  />
                  <button
                    onClick={() => removeLink(i)}
                    style={{ flexShrink: 0, width: '28px', height: '28px', borderRadius: '6px', border: '1px solid var(--border)', background: '#fff', color: '#9CA3AF', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}
                    title="삭제"
                  >✕</button>
                </div>
              ))}
              <button
                onClick={addLink}
                style={{ alignSelf: 'flex-start', padding: '5px 12px', borderRadius: '8px', border: '1px dashed var(--border)', background: '#F9FAFB', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                + 링크 추가
              </button>
            </div>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>비고 / 과제 안내</label>
            <input style={inputStyle} value={form.note} onChange={e => set('note', e.target.value)} placeholder="예: K-ITAS 가입 신청서 제출" />
          </div>

          {/* 과제 마감일 — '과제' 형태는 항상 표시, 그 외 형태는 체크박스로 첨부 여부 선택 */}
          <div style={{ gridColumn: '1 / -1' }}>
            {form.type === 'task' ? (
              <div style={{ maxWidth: '200px' }}>
                <label style={labelStyle}>마감일</label>
                <input type="date" style={inputStyle} value={assignmentDeadline} onChange={e => setAssignmentDeadline(e.target.value)} />
              </div>
            ) : (
              <>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: hasAssignment ? '8px' : 0 }}>
                  <input type="checkbox" checked={hasAssignment} onChange={e => setHasAssignment(e.target.checked)} style={{ width: '15px', height: '15px', cursor: 'pointer' }} />
                  📎 이 강의에 제출 과제 있음 (시간표엔 그대로 보이고, 과제 제출 섹션에도 함께 표시)
                </label>
                {hasAssignment && (
                  <div style={{ maxWidth: '200px' }}>
                    <label style={labelStyle}>마감일</label>
                    <input type="date" style={inputStyle} value={assignmentDeadline} onChange={e => setAssignmentDeadline(e.target.value)} />
                  </div>
                )}
              </>
            )}
          </div>

          {/* 대상 직무 — 토글 버튼 */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>대상 직무</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {JOB_OPTIONS.map(opt => {
                const active = jobTypes.includes(opt.key)
                return (
                  <button
                    key={opt.key}
                    onClick={() => toggleJob(opt.key)}
                    style={{
                      padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                      cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                      border: active ? 'none' : '1.5px solid var(--border)',
                      background: active ? 'var(--mobi-dark)' : '#fff',
                      color: active ? '#fff' : 'var(--text-secondary)',
                    }}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
          <div>
            {!row.isNew && onDelete && (
              <button onClick={async () => { if (confirm('이 강의를 삭제할까요?')) await onDelete() }}
                style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #FFCFB8', background: '#FFF0EA', color: '#FF6B2B', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                삭제
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              취소
            </button>
            <button onClick={handleSave} disabled={saving}
              style={{ padding: '9px 22px', borderRadius: '8px', border: 'none', background: 'var(--mobi-orange)', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── FlowChart (교육 흐름 차트) ──────────────────────────────────────────────
const FLOW_STAGES = ['회사의 이해', '일잘러 입문', '직무 기초', '직무 심화', '시험 및 과제']

const STAGE_META: Record<string, { icon: string; color: string; light: string }> = {
  '회사의 이해':  { icon: '🏢', color: '#1D4490', light: '#EEF2FF' },
  '일잘러 입문':  { icon: '💡', color: '#D97706', light: '#FFFBEB' },
  '직무 기초':    { icon: '📖', color: '#0891B2', light: '#ECFEFF' },
  '직무 심화':    { icon: '⚙️',  color: '#7C3AED', light: '#F5F3FF' },
  '시험 및 과제': { icon: '🎯', color: '#DC2626', light: '#FFF1F2' },
}

function FlowChart({
  allRows,
  effectiveCompleted,
  currentJob,
  onHover,
}: {
  allRows: ScheduleRow[]
  effectiveCompleted: Set<number>
  currentJob: string
  onHover: (rowIndex: number | null) => void
}) {
  const [isOpen, setIsOpen] = useState(false)

  if (allRows.length === 0) return null

  const relevantRows = allRows.filter(r =>
    r.flow_stage &&
    (r.job_types.includes('all') || r.job_types.includes(currentJob))
  )
  const hasAnyData = relevantRows.length > 0

  const stageGroups = FLOW_STAGES.map(stage => {
    const meta     = STAGE_META[stage] ?? { icon: '📌', color: '#6B7280', light: '#F9FAFB' }
    const lectures = relevantRows.filter(r => r.flow_stage === stage)
    const completedCount = lectures.filter(r => effectiveCompleted.has(r.rowIndex)).length
    const allDone  = lectures.length > 0 && completedCount === lectures.length
    const pct      = lectures.length > 0 ? Math.round(completedCount / lectures.length * 100) : 0
    return { stage, meta, lectures, completedCount, allDone, pct }
  })

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)',
      padding: '14px 22px', marginBottom: '18px',
    }}>
      <div
        onClick={() => setIsOpen(v => !v)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: isOpen ? '14px' : 0 }}
      >
        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>🗺️ 교육 흐름</span>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', transition: 'transform 0.2s', display: 'inline-block', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
      </div>
      {isOpen && <div style={{ display: 'flex', alignItems: 'flex-start', overflowX: 'auto', paddingBottom: '6px' }}>
        {stageGroups.map((group, idx) => (
          <div key={group.stage} style={{ display: 'flex', alignItems: 'flex-start', flexShrink: 0 }}>
            {/* 스테이지 카드 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
              {/* Completed! 배지 — 카드 위 */}
              {group.allDone ? (
                <div style={{
                  alignSelf: 'center', marginBottom: '4px',
                  background: '#16A34A', color: '#fff',
                  fontSize: '12px', fontWeight: 800,
                  padding: '3px 14px', borderRadius: '20px',
                  animation: 'done-pop 0.5s cubic-bezier(0.34,1.56,0.64,1)',
                  letterSpacing: '0.3px',
                }}>✅ Completed!</div>
              ) : <div style={{ height: '24px' }} />}
            <div style={{
              width: '180px', position: 'relative',
              border: `2px solid ${group.allDone ? '#22C55E' : group.lectures.length > 0 ? group.meta.color + '50' : 'var(--border)'}`,
              borderRadius: '12px', overflow: 'hidden',
              background: group.allDone ? '#F0FDF4' : '#fff',
              transition: 'border-color 0.3s, background 0.3s',
            }}>
              {/* 스테이지 헤더 */}
              <div style={{
                padding: '10px 12px 8px',
                background: group.allDone ? '#16A34A' : group.lectures.length > 0 ? group.meta.color : '#F1F5F9',
                transition: 'background 0.4s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px' }}>
                  <span style={{ fontSize: '13px' }}>{group.meta.icon}</span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: group.lectures.length > 0 ? '#fff' : 'var(--text-muted)' }}>
                    {group.stage}
                  </span>
                </div>
                {/* 진행 바 */}
                <div style={{ height: '4px', background: 'rgba(255,255,255,0.25)', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: '999px', transition: 'width 0.5s ease',
                    width: `${group.pct}%`,
                    background: group.allDone ? '#BBF7D0' : 'rgba(255,255,255,0.9)',
                  }} />
                </div>
                {/* 완료 상태 텍스트 */}
                {group.lectures.length === 0 ? (
                  <div style={{ fontSize: '10px', marginTop: '3px', fontWeight: 600, color: 'var(--text-muted)' }}>강의 미배정</div>
                ) : (
                  <div style={{ fontSize: '10px', marginTop: '3px', fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
                    {group.completedCount}/{group.lectures.length} 완료
                  </div>
                )}
              </div>
              {/* 강의 목록 */}
              <div style={{ padding: '8px 9px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {group.lectures.length === 0 ? (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', padding: '10px 0', fontStyle: 'italic' }}>—</div>
                ) : group.lectures.map(lec => {
                  const done = effectiveCompleted.has(lec.rowIndex)
                  return (
                    <div
                      key={lec.rowIndex}
                      onMouseEnter={() => onHover(lec.rowIndex)}
                      onMouseLeave={() => onHover(null)}
                      onClick={() => {
                        const el = document.querySelector<HTMLElement>(`[data-row-index="${lec.rowIndex}"]`)
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '5px',
                        padding: '4px 7px', borderRadius: '7px', cursor: 'pointer',
                        background: done ? `${group.meta.color}12` : group.meta.light,
                        border: `1px solid ${done ? group.meta.color + '35' : group.meta.color + '25'}`,
                        transition: 'all 0.15s',
                      }}
                    >
                      <span style={{ fontSize: '10px', flexShrink: 0 }}>{done ? '✅' : '○'}</span>
                      <span style={{
                        fontSize: '11px', fontWeight: done ? 500 : 600,
                        color: done ? group.meta.color : 'var(--text-primary)',
                        textDecoration: done ? 'line-through' : 'none',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {lec.name}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
            </div>{/* 안쪽 flex col 닫기 */}
            {/* 화살표 */}
            {idx < stageGroups.length - 1 && (
              <div style={{ padding: '0 5px', fontSize: '18px', color: 'var(--border-strong)', flexShrink: 0, alignSelf: 'center', marginTop: '12px' }}>
                →
              </div>
            )}
          </div>
        ))}
      </div>}
    </div>
  )
}

// ─── SubmitTaskModal (Intern용 과제 제출) ────────────────────────────────────
function SubmitTaskModal({
  lecture,
  existingUrl,
  onSubmit,
  onClose,
}: {
  lecture: ScheduleRow
  existingUrl?: string
  onSubmit: (url: string) => Promise<void>
  onClose: () => void
}) {
  const [url, setUrl] = useState(existingUrl ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    if (!url.trim()) { showToast('⚠️ 제출할 링크를 입력해주세요'); return }
    setSaving(true)
    await onSubmit(url.trim())
    setSaving(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: '#fff', borderRadius: '16px', padding: '28px 32px',
        width: '480px', boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 700 }}>📎 과제 제출</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
        </div>

        <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '8px', padding: '10px 14px', marginBottom: '18px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#92400E' }}>{lecture.name}</span>
          {lecture.note && <p style={{ fontSize: '12px', color: '#B45309', margin: '4px 0 0', lineHeight: 1.5 }}>{lecture.note}</p>}
        </div>

        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
          제출 링크 {existingUrl ? '(수정)' : '*'}
        </label>
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
          placeholder="https://docs.google.com/... 또는 노션, 피그마 링크 등"
          style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', boxSizing: 'border-box' as const }}
          autoFocus
        />

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '18px' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            취소
          </button>
          <button onClick={handleSubmit} disabled={saving}
            style={{ padding: '9px 22px', borderRadius: '8px', border: 'none', background: '#F59E0B', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
            {saving ? '제출 중...' : (existingUrl ? '링크 수정' : '제출하기')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── FeedbackModal (Intern용 강의 피드백) ────────────────────────────────────
const Q_LABELS = [
  { key: 'q1', label: '전반적으로 강의에 만족하셨나요?' },
  { key: 'q2', label: '교육 구성과 흐름이 적절했나요?' },
  { key: 'q3', label: '내용의 깊이가 적절했나요?' },
  { key: 'q4', label: '강사의 설명과 예시가 이해에 도움됐나요?' },
  { key: 'q5', label: '실무에 활용할 수 있는 내용이었나요?' },
]
const SCORE_LABELS: Record<number, string> = { 1: '매우 아니오', 2: '아니오', 3: '보통', 4: '예', 5: '매우 예' }

function FeedbackModal({
  lecture,
  existing,
  onSubmit,
  onClose,
}: {
  lecture: ScheduleRow
  existing?: LectureFeedback
  onSubmit: (data: Omit<LectureFeedback, 'rowIndex' | 'timestamp' | 'intern_name'>) => Promise<void>
  onClose: () => void
}) {
  const [scores, setScores] = useState<Record<string, number>>({
    q1: existing?.q1_satisfaction ?? 0,
    q2: existing?.q2_structure    ?? 0,
    q3: existing?.q3_depth        ?? 0,
    q4: existing?.q4_explanation  ?? 0,
    q5: existing?.q5_practical    ?? 0,
    q6: existing?.q6_practice     ?? 0,
  })
  const [texts, setTexts] = useState({
    q7: existing?.q7_helpful     ?? '',
    q8: existing?.q8_difficult   ?? '',
    q9: existing?.q9_improvement ?? '',
  })
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    if (scores.q1 === 0 || scores.q2 === 0 || scores.q3 === 0 || scores.q4 === 0 || scores.q5 === 0) {
      showToast('⚠️ Q1~Q5는 모두 답해주세요')
      return
    }
    setSaving(true)
    await onSubmit({
      lecture_name:    lecture.name,
      lecture_date:    lecture.date_label,
      q1_satisfaction: scores.q1,
      q2_structure:    scores.q2,
      q3_depth:        scores.q3,
      q4_explanation:  scores.q4,
      q5_practical:    scores.q5,
      q6_practice:     scores.q6 > 0 ? scores.q6 : undefined,
      q7_helpful:      texts.q7,
      q8_difficult:    texts.q8,
      q9_improvement:  texts.q9,
    })
    setSaving(false)
  }

  const q6Label = lecture.has_practice
    ? '실습이 내용 이해에 도움이 됐나요?'
    : '실습이 필요했나요?'

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
      padding: '16px',
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '560px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.22)',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
      }}>
        {/* 헤더 */}
        <div style={{
          padding: '20px 24px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#059669', background: '#ECFDF5', padding: '2px 8px', borderRadius: '20px', display: 'inline-block', marginBottom: '6px' }}>
              📝 강의 피드백
            </div>
            <h2 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--text-primary)', lineHeight: 1.4 }}>
              {lecture.name}
            </h2>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>
              {lecture.date_label} {lecture.time && `· ${lecture.time}`} {lecture.teacher !== '-' && `· ${lecture.teacher}`}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 0 0 12px', flexShrink: 0 }}>✕</button>
        </div>

        {/* 본문 (스크롤 가능) */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {/* Q1~Q5 정량 */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              정량 평가 (1 = 매우 아니오 · 5 = 매우 예)
            </div>
            {Q_LABELS.map(({ key, label }) => (
              <div key={key} style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  {label}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      onClick={() => setScores(p => ({ ...p, [key]: n }))}
                      title={SCORE_LABELS[n]}
                      style={{
                        width: '40px', height: '40px', borderRadius: '8px', border: '1.5px solid',
                        fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                        transition: 'all 0.1s',
                        borderColor: scores[key] === n ? '#059669' : 'var(--border)',
                        background: scores[key] === n ? '#059669' : '#fff',
                        color: scores[key] === n ? '#fff' : scores[key] > 0 && scores[key] < n ? 'var(--text-muted)' : 'var(--text-primary)',
                      }}
                    >
                      {n}
                    </button>
                  ))}
                  {scores[key] > 0 && (
                    <span style={{ alignSelf: 'center', fontSize: '11.5px', color: '#059669', fontWeight: 600, marginLeft: '4px' }}>
                      {SCORE_LABELS[scores[key]]}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {/* Q6 실습 */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                {q6Label} <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-muted)' }}>(선택)</span>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    onClick={() => setScores(p => ({ ...p, q6: p.q6 === n ? 0 : n }))}
                    title={SCORE_LABELS[n]}
                    style={{
                      width: '40px', height: '40px', borderRadius: '8px', border: '1.5px solid',
                      fontSize: '14px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                      transition: 'all 0.1s',
                      borderColor: scores.q6 === n ? '#3B82F6' : 'var(--border)',
                      background: scores.q6 === n ? '#3B82F6' : '#fff',
                      color: scores.q6 === n ? '#fff' : 'var(--text-primary)',
                    }}
                  >
                    {n}
                  </button>
                ))}
                {scores.q6 > 0 && (
                  <span style={{ alignSelf: 'center', fontSize: '11.5px', color: '#3B82F6', fontWeight: 600, marginLeft: '4px' }}>
                    {SCORE_LABELS[scores.q6]}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Q7~Q9 정성 */}
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              정성 평가 <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(선택 사항)</span>
            </div>
            {([
              { key: 'q7' as const, label: '가장 도움이 되었던 내용', placeholder: '예: 실제 캠페인 사례 분석이 인상적이었습니다' },
              { key: 'q8' as const, label: '이해하기 어려웠던 내용', placeholder: '예: GA4 데이터 해석 방법이 생소했습니다' },
              { key: 'q9' as const, label: '불필요하거나 개선이 필요한 점', placeholder: '예: 이론 설명 시간을 줄이고 실습을 늘렸으면 좋겠습니다' },
            ] as const).map(({ key, label, placeholder }) => (
              <div key={key} style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                  {label}
                </label>
                <textarea
                  value={texts[key]}
                  onChange={e => setTexts(p => ({ ...p, [key]: e.target.value }))}
                  placeholder={placeholder}
                  rows={2}
                  style={{
                    width: '100%', border: '1px solid var(--border)', borderRadius: '8px',
                    padding: '8px 12px', fontSize: '13px', fontFamily: 'inherit',
                    resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.6,
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* 제출 버튼 */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{
              width: '100%', padding: '12px', borderRadius: '10px', border: 'none',
              background: '#059669', color: '#fff', fontSize: '14px', fontWeight: 700,
              cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {saving ? '제출 중...' : (existing ? '✏️ 수정하기' : '✅ 제출하기')}
          </button>
          <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
            이미 제출한 경우 다시 제출하면 수정됩니다
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SchedulePage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const role     = (session?.user as any)?.role as string | undefined
  const isCO1    = role === 'CO1'
  const isIntern = role === 'Intern'
  const canCheck = isCO1 || isIntern

  const [allRows, setAllRows]             = useState<ScheduleRow[]>([])
  const [loading, setLoading]             = useState(true)
  const [currentJob, setCurrentJob]       = useState<string>('marketing')
  const [currentWeek, setCurrentWeek]     = useState<1 | 2>(1)
  const [editRow, setEditRow]             = useState<(Partial<ScheduleRow> & { isNew?: boolean }) | null>(null)
  const [driveUrl, setDriveUrl]           = useState('')
  const [submitUrl, setSubmitUrl]         = useState('')
  const [cohortLabel, setCohortLabel]     = useState('')
  const [completedRows, setCompletedRows] = useState<Set<number>>(new Set())
  const [submissionsMap, setSubmissionsMap] = useState<Record<number, string>>({})
  const [submitTarget, setSubmitTarget]   = useState<ScheduleRow | null>(null)
  const [internJob, setInternJob]         = useState<string>('')
  const [jobVisible, setJobVisible]       = useState({ marketing: true, aiax: true, biz: true, cc: true })
  const [week2Visible, setWeek2Visible]   = useState(false)
  const [week2Variant, setWeek2Variant]   = useState<'A' | 'B'>('A')
  const [hoveredFlowRow, setHoveredFlowRow] = useState<number | null>(null)
  const [myInterviews, setMyInterviews] = useState<{ date: string; time_slot: string; booked_by: string }[]>([])
  const [myFeedbacks, setMyFeedbacks] = useState<Record<string, LectureFeedback>>({}) // key: lecture_name
  const [feedbackTarget, setFeedbackTarget] = useState<ScheduleRow | null>(null)

  // ── 시간표 드래그(요일/시간 이동) ──────────────────────────
  const [dragRowIndex, setDragRowIndex]   = useState<number | null>(null)
  const [dragOverCell, setDragOverCell]   = useState<{ dayNum: number; slotIndex: number } | null>(null)
  const [savingDrag, setSavingDrag]       = useState(false)

  // ── 미리보기 모드: 전역 컨텍스트에서 읽기 ──────────────────
  const { previewMode, previewInternName, internsList: previewInternsList } = usePreview()
  const [previewCompletedRows, setPreviewCompletedRows] = useState<Set<number>>(new Set())
  const [previewSubmissionsMap, setPreviewSubmissionsMap] = useState<Record<number, string>>({})
  const [testCompletedRows,    setTestCompletedRows]    = useState<Set<number>>(new Set())

  // 파생: 실제 렌더링에 사용하는 effective 값
  const internPreviewActive = previewMode === 'intern' && !!previewInternName
  const internTestActive    = previewMode === 'intern-test'
  const effectiveIsCO1      = isCO1 && previewMode === 'off'
  const effectiveIsIntern   = isIntern || internPreviewActive || internTestActive
  const effectiveCanCheck   = effectiveIsCO1 || effectiveIsIntern
  const effectiveCompleted  = previewMode === 'member' ? new Set<number>() :
                              internPreviewActive ? previewCompletedRows :
                              internTestActive    ? testCompletedRows :
                              completedRows
  const effectiveSubs       = previewMode === 'member' ? {} :
                              internPreviewActive ? previewSubmissionsMap : submissionsMap

  // 인턴은 본인 직무 탭에서만 체크/제출 가능 (다른 탭은 읽기 전용)
  const isRealIntern  = isIntern && previewMode === 'off'
  const internJobTab  = internJob
  const canCheckHere  = effectiveCanCheck && (previewMode === 'off' || previewMode === 'intern-test') &&
                        (!isRealIntern || !internJobTab || currentJob === internJobTab)

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login')
  }, [status, router])

  // 인턴 본인 직무 조회 → 해당 탭 자동 선택
  useEffect(() => {
    if (!isIntern || status !== 'authenticated') return
    fetch('/api/interns/me')
      .then(r => r.json())
      .then(d => { if (d.type) { setInternJob(d.type); setCurrentJob(d.type) } })
      .catch(() => {})
  }, [isIntern, status])

  // 인턴 본인 면담 일정 로드
  useEffect(() => {
    if (status !== 'authenticated') return
    // 실제 인턴 또는 인턴 미리보기 모드에서만
    const name = isIntern ? null : (internPreviewActive ? previewInternName : null)
    if (!isIntern && !name) { setMyInterviews([]); return }
    const url = name ? `/api/interviews?internName=${encodeURIComponent(name)}` : '/api/interviews/me'
    if (isIntern) {
      // 인턴 본인: /api/interviews/me 대신 자신의 이름으로 조회하려면 me 엔드포인트 필요
      // 일단 모든 면담 불러와 booked 슬롯만 표시
      fetch('/api/interviews')
        .then(r => r.json())
        .then(d => {
          const booked = (d.interviews || []).filter((iv: any) => iv.booked_by)
          setMyInterviews(booked)
        })
        .catch(() => {})
    } else if (name) {
      fetch(`/api/interviews?internName=${encodeURIComponent(name)}`)
        .then(r => r.json())
        .then(d => {
          const booked = (d.interviews || []).filter((iv: any) => iv.booked_by)
          setMyInterviews(booked)
        })
        .catch(() => {})
    }
  }, [isIntern, status, internPreviewActive, previewInternName])

  // 피드백 로드: 실제 인턴(본인) 또는 CO1 인턴 미리보기(해당 인턴 것)
  useEffect(() => {
    if (status !== 'authenticated') return
    const url = isRealIntern
      ? '/api/feedbacks'
      : (internPreviewActive && previewInternName)
        ? `/api/feedbacks?intern_name=${encodeURIComponent(previewInternName)}`
        : null
    if (!url) { setMyFeedbacks({}); return }
    fetch(url)
      .then(r => r.json())
      .then(d => {
        const map: Record<string, LectureFeedback> = {}
        for (const fb of (d.feedbacks ?? [])) map[fb.lecture_name] = fb
        setMyFeedbacks(map)
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, isRealIntern, internPreviewActive, previewInternName])

  const fetchAll = useCallback(async () => {
    try {
      const [schedRes, settingsRes] = await Promise.all([
        fetch('/api/schedule'),
        fetch('/api/settings'),
      ])
      const { rows }     = await schedRes.json()
      const { settings } = await settingsRes.json()
      setAllRows(rows ?? [])
      setDriveUrl(settings?.drive_folder_url ?? '')
      setSubmitUrl(settings?.submit_folder_url ?? '')
      setJobVisible({
        marketing: settings?.job_visible_marketing !== false,
        aiax:      settings?.job_visible_aiax      !== false,
        biz:       settings?.job_visible_biz       !== false,
        cc:        settings?.job_visible_cc        !== false,
      })
      setWeek2Visible(settings?.week_2_visible !== false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (status === 'authenticated') fetchAll() }, [status, fetchAll])

  useEffect(() => {
    fetch('/api/cohorts/active')
      .then(r => r.json())
      .then(d => { if (d.label) setCohortLabel(d.label) })
      .catch(() => {})
  }, [])

  // 인턴 선택 시 해당 인턴의 완료 현황 로드
  useEffect(() => {
    if (!previewInternName) { setPreviewCompletedRows(new Set()); setPreviewSubmissionsMap({}); return }
    fetch(`/api/completions?viewAsName=${encodeURIComponent(previewInternName)}`)
      .then(r => r.json())
      .then(data => {
        setPreviewCompletedRows(new Set(data.indices ?? []))
        const map: Record<number, string> = {}
        Object.entries(data.submissions ?? {}).forEach(([k, v]) => { map[Number(k)] = v as string })
        setPreviewSubmissionsMap(map)
        // 인턴 직무 탭 자동 선택
        const intern = previewInternsList.find(i => i.name === previewInternName)
        if (intern) setCurrentJob(intern.type)
      })
      .catch(() => {})
  }, [previewInternName, previewInternsList])

  // 내 교육 완료 목록 + 과제 제출 URL 로드
  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/completions')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.indices)) {
          setCompletedRows(new Set(data.indices as number[]))
        }
        if (data.submissions && typeof data.submissions === 'object') {
          const map: Record<number, string> = {}
          Object.entries(data.submissions).forEach(([k, v]) => {
            map[Number(k)] = v as string
          })
          setSubmissionsMap(map)
        }
      })
      .catch(() => {/* 실패 시 빈 상태 유지 */})
  }, [status])

  // hover → 하이라이트만, click → 스크롤 (FlowChart 내부에서 직접 처리)

  const dayGroups: DayGroup[] = (() => {
    const filtered = allRows.filter(r => {
      if (r.week_num !== currentWeek) return false
      if (r.week_num === 2 && r.week_variant && r.week_variant !== week2Variant) return false
      return r.job_types.includes('all') || r.job_types.includes(currentJob)
    })
    const map = new Map<number, DayGroup>()
    filtered.forEach(r => {
      if (!map.has(r.day_num)) {
        map.set(r.day_num, {
          day_num:    r.day_num,
          day_label:  r.day_label,
          date_label: r.date_label,
          eval_label: r.eval_label,
          eval_link:  r.eval_link || '',
          lectures:   [],
        })
      }
      const g = map.get(r.day_num)!
      if (r.eval_link && !g.eval_link) g.eval_link = r.eval_link
      g.lectures.push(r)
    })
    map.forEach(g => g.lectures.sort((a, b) => a.time.localeCompare(b.time)))
    return Array.from(map.values()).sort((a, b) => a.day_num - b.day_num)
  })()

  // 일반 체크박스 토글 (task 제외)
  async function toggleComplete(rowIndex: number, e: { stopPropagation(): void }) {
    e.stopPropagation()
    if (previewMode !== 'off' && !internTestActive) return
    if (internTestActive) {
      setTestCompletedRows(prev => {
        const next = new Set(prev)
        next.has(rowIndex) ? next.delete(rowIndex) : next.add(rowIndex)
        return next
      })
      return
    }
    const wasChecked = completedRows.has(rowIndex)
    setCompletedRows(prev => {
      const next = new Set(prev)
      next.has(rowIndex) ? next.delete(rowIndex) : next.add(rowIndex)
      return next
    })
    try {
      const res = await fetch('/api/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduleRowIndex: rowIndex, checked: !wasChecked }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setCompletedRows(prev => {
        const next = new Set(prev)
        wasChecked ? next.add(rowIndex) : next.delete(rowIndex)
        return next
      })
      showToast('⚠️ 저장 실패. 다시 시도해주세요.')
    }
  }

  // 과제 URL 제출
  async function handleTaskSubmit(rowIndex: number, url: string) {
    if (previewMode !== 'off' && !internTestActive) return
    if (internTestActive) {
      setTestCompletedRows(prev => new Set([...prev, rowIndex]))
      showToast('🧪 테스트 모드 - 저장되지 않습니다')
      return
    }
    try {
      const body: Record<string, unknown> = { scheduleRowIndex: rowIndex, checked: true, submissionUrl: url }
      const res = await fetch('/api/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      {
        setCompletedRows(prev => new Set([...prev, rowIndex]))
        setSubmissionsMap(prev => ({ ...prev, [rowIndex]: url }))
      }
      setSubmitTarget(null)
      showToast('✅ 과제가 제출됐습니다')
    } catch {
      showToast('⚠️ 제출 실패. 다시 시도해주세요.')
    }
  }

  async function handleSave(data: Omit<ScheduleRow, 'rowIndex'>) {
    if (editRow?.rowIndex) {
      const res = await fetch('/api/schedule', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rowIndex: editRow.rowIndex, ...data }) })
      const result = await res.json().catch(() => null)
      const createdRows = result?.createdRows as { jobType: string; rowIndex: number }[] | undefined
      if (createdRows && createdRows.length > 0) {
        const jobLabel: Record<string, string> = { marketing: '마케팅', aiax: 'AI·AX', biz: '사업기획·전략', cc: 'CC' }
        const names = createdRows.map(c => jobLabel[c.jobType] ?? c.jobType).join(', ')
        let msg = `✅ 수정됐습니다 · ${names} 강의는 원래 시간 그대로 따로 분리됐어요`
        if (result?.reassignedCompletions > 0) msg += ` (기존 체크 ${result.reassignedCompletions}건 재배정)`
        showToast(msg)
      } else {
        showToast('✅ 수정됐습니다')
      }
    } else {
      await fetch('/api/schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      showToast('✅ 강의가 추가됐습니다')
    }
    setEditRow(null)
    await fetchAll()
  }

  async function handleDelete() {
    if (!editRow?.rowIndex) return
    await fetch('/api/schedule', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rowIndex: editRow.rowIndex }) })
    showToast('🗑️ 삭제됐습니다')
    setEditRow(null)
    await fetchAll()
  }

  /** 드래그로 강의를 다른 요일/시간 칸에 떨어뜨렸을 때 — rowIndex는 절대 바꾸지 않고
   *  같은 행의 day_num/day_label/date_label/eval_label/time 값만 갱신한다 */
  function handleReschedule(targetDayNum: number, targetSlotIndex: number) {
    if (!effectiveIsCO1 || savingDrag || dragRowIndex == null) return
    const draggedRowIndex = dragRowIndex
    setDragRowIndex(null)
    setDragOverCell(null)

    const lec = allRows.find(r => r.rowIndex === draggedRowIndex)
    const targetDay = dayGroups.find(d => d.day_num === targetDayNum)
    if (!lec || !targetDay) return

    const rows = parseRows(lec.time)
    if (!rows) return
    const span = rows.er - rows.sr
    const newSr = targetSlotIndex + 1
    const newEr = newSr + span
    if (newEr > 19) {
      showToast('⚠️ 이 위치엔 강의를 놓을 수 없어요 (시간표 범위 초과)')
      return
    }

    const newTime = `${rowToTime(newSr)}~${rowToTime(newEr)}`
    if (lec.day_num === targetDay.day_num && lec.time === newTime) return // 제자리 드롭

    const snapshot = allRows
    const updatedLec: ScheduleRow = {
      ...lec,
      day_num:    targetDay.day_num,
      day_label:  targetDay.day_label,
      date_label: targetDay.date_label,
      eval_label: targetDay.eval_label,
      time:       newTime,
    }
    setAllRows(prev => prev.map(r => r.rowIndex === draggedRowIndex ? updatedLec : r))
    setSavingDrag(true)

    const { rowIndex, ...data } = updatedLec
    fetch('/api/schedule', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rowIndex, ...data }),
    })
      .then(res => {
        if (!res.ok) throw new Error('저장 실패')
        showToast('✅ 시간표가 변경됐습니다')
      })
      .catch(() => {
        setAllRows(snapshot)
        showToast('⚠️ 저장 실패. 다시 시도해주세요.')
      })
      .finally(() => setSavingDrag(false))
  }

  async function toggleJobVisible(key: keyof typeof jobVisible) {
    const newVal = !jobVisible[key]
    setJobVisible(prev => ({ ...prev, [key]: newVal }))
    // Off되는 직무가 현재 탭이면 첫 번째 visible 탭으로 이동
    if (!newVal && currentJob === key) {
      const fallback = JOB_TABS.find(t => t.key !== key && jobVisible[t.key as keyof typeof jobVisible])
      if (fallback) setCurrentJob(fallback.key)
    }
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [`job_visible_${key}`]: String(newVal) }),
      })
    } catch {
      setJobVisible(prev => ({ ...prev, [key]: !newVal }))
      showToast('⚠️ 저장 실패. 다시 시도해주세요.')
    }
  }

  async function toggleWeek2Visible() {
    const newVal = !week2Visible
    setWeek2Visible(newVal)
    if (!newVal && currentWeek === 2) setCurrentWeek(1)
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_2_visible: String(newVal) }),
      })
    } catch {
      setWeek2Visible(!newVal)
      showToast('⚠️ 저장 실패. 다시 시도해주세요.')
    }
  }

  if (status === 'loading' || loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>불러오는 중...</div>
    </div>
  )

  return (
    <>
      <Nav />
      <main style={{ padding: '32px', maxWidth: '1400px', margin: '0 auto' }}>
        <div className="no-print" style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.5px', marginBottom: '6px' }}>📅 교육 시간표</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13.5px' }}>{cohortLabel ? `${cohortLabel} ` : ''}인턴십 | 직무별 시간표 선택 후 자료 링크를 활용하세요</p>
        </div>

        <div className="no-print" style={{ background: 'var(--mobi-dark)', borderRadius: 'var(--radius)', padding: '16px 20px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          {driveUrl && (
            <a href={driveUrl} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,107,43,0.15)', border: '1px solid rgba(255,107,43,0.3)', borderRadius: '8px', padding: '9px 16px', color: '#FF9469', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>
              <i className="fa-brands fa-google-drive" /> {cohortLabel ? `${cohortLabel} ` : ''}인턴십 마스터 폴더
            </a>
          )}
          {submitUrl ? (
            <a href={submitUrl} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: '8px', padding: '9px 16px', color: '#FCD34D', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>
              <i className="fa-regular fa-folder-open" /> 과제 제출 폴더
            </a>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(245,158,11,0.08)', border: '1px dashed rgba(245,158,11,0.25)', borderRadius: '8px', padding: '9px 16px', color: 'rgba(252,211,77,0.45)', fontSize: '13px', fontWeight: 600 }}>
              <i className="fa-regular fa-folder-open" /> 과제 제출 폴더
            </span>
          )}
          {isCO1 && previewMode !== 'off' && (
            <span style={{ marginLeft: 'auto', background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', color: '#818CF8', fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px' }}>
              👁️ {previewMode === 'member' ? '멤버' : (previewInternName || '인턴')} 시점 미리보기 — 읽기 전용
            </span>
          )}
        </div>

        {/* CO1 전용: 직무 시간표 On/Off */}
        {effectiveIsCO1 && (
          <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginRight: '2px' }}>
              ⚙️ 직무 시간표 공개
            </span>
            {JOB_TABS.map(tab => {
              const on = jobVisible[tab.key as keyof typeof jobVisible]
              return (
                <button
                  key={tab.key}
                  onClick={() => toggleJobVisible(tab.key as keyof typeof jobVisible)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '7px',
                    padding: '5px 12px', borderRadius: '20px', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: '12px', fontWeight: 600,
                    transition: 'all 0.2s',
                    border: on ? '1.5px solid #22C55E' : '1.5px dashed var(--border-strong)',
                    background: on ? 'rgba(34,197,94,0.08)' : 'var(--bg-hover)',
                    color: on ? '#15803D' : 'var(--text-muted)',
                  }}
                >
                  {/* 토글 스위치 */}
                  <span style={{
                    display: 'inline-block', width: '28px', height: '15px',
                    borderRadius: '999px', background: on ? '#22C55E' : '#CBD5E1',
                    position: 'relative', flexShrink: 0, transition: 'background 0.2s',
                  }}>
                    <span style={{
                      position: 'absolute', width: '11px', height: '11px',
                      borderRadius: '50%', background: '#fff',
                      top: '2px', left: on ? '15px' : '2px',
                      transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                    }} />
                  </span>
                  {tab.label}
                </button>
              )
            })}
          </div>
        )}

        {/* CO1 전용: 2주차 On/Off */}
        {effectiveIsCO1 && (
          <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginRight: '2px' }}>
              📅 2주차 공개
            </span>
            <button
              onClick={toggleWeek2Visible}
              style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                padding: '5px 12px', borderRadius: '20px', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: '12px', fontWeight: 600,
                transition: 'all 0.2s',
                border: week2Visible ? '1.5px solid #22C55E' : '1.5px dashed var(--border-strong)',
                background: week2Visible ? 'rgba(34,197,94,0.08)' : 'var(--bg-hover)',
                color: week2Visible ? '#15803D' : 'var(--text-muted)',
              }}
            >
              <span style={{
                display: 'inline-block', width: '28px', height: '15px',
                borderRadius: '999px', background: week2Visible ? '#22C55E' : '#CBD5E1',
                position: 'relative', flexShrink: 0, transition: 'background 0.2s',
              }}>
                <span style={{
                  position: 'absolute', width: '11px', height: '11px',
                  borderRadius: '50%', background: '#fff',
                  top: '2px', left: week2Visible ? '15px' : '2px',
                  transition: 'left 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                }} />
              </span>
              Week 2
            </button>
          </div>
        )}

        {/* 직무 탭 */}
        <div className="no-print" style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          {JOB_TABS.map(tab => {
            const isVisible  = jobVisible[tab.key as keyof typeof jobVisible]
            const isActive   = currentJob === tab.key
            const isHomeTab  = isRealIntern && !!internJobTab && tab.key === internJobTab
            const isReadOnly = isRealIntern && !!internJobTab && tab.key !== internJobTab

            // 비CO1에게는 Off된 탭 숨기기
            if (!effectiveIsCO1 && !isVisible) return null

            return (
              <button key={tab.key} onClick={() => setCurrentJob(tab.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '8px 18px', borderRadius: '20px',
                  border: `1.5px solid ${isActive ? 'var(--mobi-orange)' : isVisible ? 'var(--border-strong)' : 'var(--border)'}`,
                  borderStyle: !isVisible ? 'dashed' : 'solid',
                  background: isActive ? 'var(--mobi-orange)' : '#fff',
                  color: isActive ? '#fff' : (!isVisible || isReadOnly) ? 'var(--text-muted)' : 'var(--text-secondary)',
                  fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s',
                  opacity: !isVisible ? 0.5 : isReadOnly ? 0.7 : 1,
                }}>
                {tab.label}
                {!isVisible && <span style={{ fontSize: '10px', background: 'rgba(0,0,0,0.08)', borderRadius: '8px', padding: '1px 5px' }}>숨김</span>}
                {isVisible && isHomeTab && <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.3)', borderRadius: '10px', padding: '1px 6px' }}>내 직무</span>}
                {isVisible && isReadOnly && <span style={{ fontSize: '10px', opacity: 0.7 }}>읽기전용</span>}
              </button>
            )
          })}
        </div>

        <div className="no-print" style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          {([1, 2] as const).map(w => {
            if (w === 2 && !week2Visible && !isCO1) return null
            const isHidden = w === 2 && !week2Visible
            return (
              <button key={w} onClick={() => setCurrentWeek(w)}
                style={{
                  padding: '7px 20px', borderRadius: '8px',
                  border: `1.5px solid ${isHidden ? 'var(--border)' : currentWeek === w ? 'var(--mobi-navy)' : 'var(--border)'}`,
                  borderStyle: isHidden ? 'dashed' : 'solid',
                  background: currentWeek === w && !isHidden ? 'var(--mobi-navy)' : '#fff',
                  color: isHidden ? 'var(--text-muted)' : currentWeek === w ? '#fff' : 'var(--text-secondary)',
                  fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all 0.2s', opacity: isHidden ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}>
                {w === 1 ? 'Week 1 · 공통+직무별 교육' : 'Week 2 · 과제 수행 및 최종 발표'}
                {isHidden && <span style={{ fontSize: '10px', background: 'rgba(0,0,0,0.08)', borderRadius: '8px', padding: '1px 5px' }}>숨김</span>}
              </button>
            )
          })}
          {currentWeek === 2 && effectiveIsCO1 && (
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>버전</span>
              {(['A', 'B'] as const).map(v => (
                <button key={v} onClick={() => setWeek2Variant(v)}
                  style={{
                    padding: '6px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                    border: week2Variant === v ? 'none' : '1.5px solid var(--border)',
                    background: week2Variant === v ? 'var(--mobi-orange)' : '#fff',
                    color: week2Variant === v ? '#fff' : 'var(--text-secondary)',
                  }}>
                  {v}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => window.print()}
            style={{ marginLeft: 'auto', padding: '7px 16px', borderRadius: '8px', border: '1.5px solid var(--border)', background: '#fff', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '6px' }}>
            🖨️ 인쇄
          </button>
        </div>

        {/* 면담 일정 메모 (인턴 시점) */}
        {effectiveIsIntern && myInterviews.length > 0 && (
          <div className="no-print" style={{
            display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px',
            padding: '10px 14px',
            background: 'rgba(29,68,144,0.04)', border: '1px solid rgba(29,68,144,0.15)',
            borderRadius: '10px',
          }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#1D4490', marginRight: '2px', alignSelf: 'center' }}>📅 면담 일정</span>
            {myInterviews.map((iv, i) => (
              <span key={i} style={{
                padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                background: 'rgba(29,68,144,0.1)', border: '1px solid rgba(29,68,144,0.2)',
                color: '#1D4490',
              }}>
                {iv.date} {iv.time_slot} · {iv.booked_by}
              </span>
            ))}
          </div>
        )}

        <div className="no-print">
          <FlowChart
            allRows={allRows}
            effectiveCompleted={effectiveCompleted}
            currentJob={currentJob}
            onHover={setHoveredFlowRow}
          />
        </div>

        {/* 인쇄용 헤더 */}
        <div className="print-only" style={{ marginBottom: '10px', paddingBottom: '8px', borderBottom: '2px solid #1D4490' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#1D4490' }}>📅 {cohortLabel ? `${cohortLabel} ` : ''}인턴십 교육 시간표</div>
          <div style={{ fontSize: '12px', color: '#444', marginTop: '3px' }}>
            {currentWeek === 1 ? 'Week 1' : 'Week 2'}
            {' · '}
            {JOB_TABS.find(t => t.key === currentJob)?.label ?? currentJob}
          </div>
        </div>

        {dayGroups.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
            {isCO1 ? '아직 강의가 없습니다. 헤더의 + 강의 추가 버튼을 사용하세요.' : '시간표 준비 중입니다.'}
          </div>
        ) : (
          <>
          <div className="schedule-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', overflowX: 'auto' }}>

            {/* 헤더 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: `70px repeat(${dayGroups.length}, minmax(200px, 1fr))`,
              position: 'sticky', top: 0, zIndex: 10,
              background: 'var(--mobi-dark)',
              borderBottom: '2px solid var(--border)',
              minWidth: `${70 + dayGroups.length * 160}px`,
            }}>
              <div style={{ padding: '10px 6px', textAlign: 'center', fontSize: '10.5px', fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>시간</div>
              {dayGroups.map(day => (
                <div key={day.day_num} style={{ padding: '10px 8px', textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '10px', fontWeight: 500 }}>{day.day_label}</div>
                  <div style={{ color: '#fff', fontSize: '13px', fontWeight: 700, marginTop: '1px' }}>{day.date_label}</div>
                  <div style={{ marginTop: '4px', display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    {effectiveIsCO1 && (
                      <button
                        onClick={() => setEditRow({ isNew: true, ...emptyRow(currentWeek, day.day_num, day.day_label, day.date_label, day.eval_label) })}
                        style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', color: 'rgba(255,255,255,0.8)', fontSize: '9px', fontWeight: 600, padding: '2px 7px', cursor: 'pointer', fontFamily: 'inherit' }}>
                        + 강의 추가
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* 그리드 바디 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: `70px repeat(${dayGroups.length}, minmax(200px, 1fr))`,
              gridTemplateRows: `repeat(${GRID_SLOTS.length}, 100px)`,
              position: 'relative',
              minWidth: `${70 + dayGroups.length * 160}px`,
            }}>

              {/* 시간 레이블 */}
              {GRID_SLOTS.map((t, i) => {
                const isLunch = t === '12:00' || t === '12:30'
                return (
                  <div key={t} style={{
                    gridColumn: 1, gridRow: i + 1,
                    display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
                    padding: '6px 8px 0',
                    fontSize: '10.5px', fontWeight: 600,
                    color: isLunch ? '#B45309' : '#6B7280',
                    background: isLunch ? '#FFFDF5' : 'var(--bg-card)',
                    borderRight: '2px solid var(--border)',
                    borderBottom: '1px solid var(--border)',
                    boxSizing: 'border-box' as const,
                    position: 'sticky' as const, left: 0, zIndex: 2,
                  }}>{t}</div>
                )
              })}

              {/* 배경 셀 */}
              {dayGroups.map((day, di) =>
                GRID_SLOTS.map((t, i) => {
                  const isLunch = t === '12:00' || t === '12:30'
                  const isDragOver = dragRowIndex != null && dragOverCell?.dayNum === day.day_num && dragOverCell?.slotIndex === i
                  return (
                    <div
                      key={`bg-${di}-${i}`}
                      style={{
                        gridColumn: di + 2, gridRow: i + 1,
                        borderBottom: '1px dashed var(--border)',
                        borderLeft: '1px solid var(--border)',
                        background: isDragOver ? 'rgba(29,68,144,0.1)' : (isLunch ? '#FFFDF5' : undefined),
                        outline: isDragOver ? '2px dashed var(--primary)' : undefined,
                        outlineOffset: isDragOver ? '-2px' : undefined,
                        boxSizing: 'border-box' as const,
                      }}
                      onDragOver={e => { if (dragRowIndex != null) { e.preventDefault(); setDragOverCell({ dayNum: day.day_num, slotIndex: i }) } }}
                      onDrop={e => { e.preventDefault(); handleReschedule(day.day_num, i) }}
                    />
                  )
                })
              )}

              {/* 웰컴런치 셀 */}
              {dayGroups.map((day, di) => {
                const lunchLec = day.lectures.find(lec => lec.type === 'lunch')
                const lunchRows = lunchLec?.time ? parseRows(lunchLec.time) : null
                const lSR = lunchRows?.sr ?? LUNCH_SR
                const lER = lunchRows?.er ?? LUNCH_ER
                return (
                  <div
                    key={`lunch-${di}`}
                    style={{
                      gridColumn: di + 2,
                      gridRow: `${lSR} / ${lER}`,
                      background: '#FFFDF5',
                      border: '2px dashed #F59E0B',
                      borderRadius: '6px',
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      zIndex: 4, margin: '2px 3px',
                      gap: '2px',
                      cursor: effectiveIsCO1 ? 'pointer' : 'default',
                      boxSizing: 'border-box' as const,
                    }}
                    onClick={() => {
                      if (!effectiveIsCO1) return
                      if (lunchLec) {
                        setEditRow(lunchLec)
                      } else {
                        setEditRow({
                          isNew: true,
                          ...emptyRow(currentWeek, day.day_num, day.day_label, day.date_label, day.eval_label),
                          type: 'lunch' as LectureType,
                          time: '12:00~13:30',
                          name: '웰컴런치',
                          duration: '1h',
                        })
                      }
                    }}
                  >
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#B45309' }}>🍽️ 웰컴런치 및 간담회</span>
                    {lunchLec?.lunch_with ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                        {lunchLec.lunch_with.split(',').map((p, i) => (
                          <span key={i} style={{ fontSize: '12px', color: '#B45309', fontWeight: 600 }}>{i === 0 ? '👥 ' : ''}{p.trim()}</span>
                        ))}
                      </div>
                    ) : isCO1 ? (
                      <span style={{ fontSize: '9px', color: '#D97706', fontWeight: 400, fontStyle: 'italic' }}>+ 동행자 추가</span>
                    ) : null}
                  </div>
                )
              })}

              {/* 강의 셀 */}
              {dayGroups.flatMap((day, di) => {
                const validLecs = day.lectures
                  .filter(lec => lec.type !== 'lunch' && lec.type !== 'task')
                  .map(lec => ({ lec, rows: parseRows(lec.time) }))
                  .filter((x): x is { lec: ScheduleRow; rows: { sr: number; er: number } } => x.rows !== null)

                // 겹치는 강의는 구글 캘린더처럼 세로 컬럼으로 나눠 배치 (숨겨지는 카드가 없도록)
                const layout = layoutOverlaps(validLecs.map(({ lec, rows }) => ({ rowIndex: lec.rowIndex, sr: rows.sr, er: rows.er })))

                return validLecs.map(({ lec, rows }) => {
                    const { sr, er }   = rows
                    const place        = layout.get(lec.rowIndex) ?? { col: 0, cols: 1 }
                    const color        = TYPE_COLOR[lec.type] || '#888'
                    const bg           = TYPE_BG[lec.type]    || '#F9FAFB'
                    const borderColor  = color + '88'
                    const badgeBg      = bg
                    const isCompleted  = lec.rowIndex !== undefined && effectiveCompleted.has(lec.rowIndex)
                    const isTask       = lec.type === 'task'
                    const submittedUrl = lec.rowIndex !== undefined ? effectiveSubs[lec.rowIndex] : undefined
                    const draggableHere = effectiveIsCO1 && !savingDrag && isDraggableLecture(lec)

                    return (
                      <div
                        key={lec.rowIndex}
                        data-row-index={lec.rowIndex}
                        draggable={draggableHere}
                        onDragStart={e => {
                          if (!draggableHere || lec.rowIndex === undefined) { e.preventDefault(); return }
                          e.stopPropagation()
                          setDragRowIndex(lec.rowIndex)
                        }}
                        onDragEnd={() => { setDragRowIndex(null); setDragOverCell(null) }}
                        onDragOver={e => { if (dragRowIndex != null) { e.preventDefault(); e.stopPropagation(); setDragOverCell({ dayNum: day.day_num, slotIndex: sr - 1 }) } }}
                        onDrop={e => { if (dragRowIndex != null) { e.preventDefault(); e.stopPropagation(); handleReschedule(day.day_num, sr - 1) } }}
                        style={{
                          gridColumn: di + 2,
                          gridRow: `${sr} / ${er}`,
                          marginTop: '2px', marginBottom: '2px',
                          width: place.cols > 1 ? `calc(${100 / place.cols}% - 6px)` : 'calc(100% - 6px)',
                          marginLeft: place.cols > 1 ? `calc(${(100 / place.cols) * place.col}% + 3px)` : '3px',
                          borderRadius: '5px',
                          padding: '5px 7px',
                          background: isCompleted ? '#F3F4F6' : bg,
                          borderLeft: `3px solid ${isCompleted ? '#9CA3AF' : color}`,
                          boxSizing: 'border-box' as const,
                          zIndex: hoveredFlowRow === lec.rowIndex ? 5 : 3,
                          overflow: 'hidden',
                          alignSelf: 'stretch',
                          cursor: effectiveIsCO1 ? 'pointer' : 'default',
                          opacity: isCompleted ? 0.65 : 1,
                          position: 'relative' as const,
                          transition: 'all 0.2s',
                          display: 'flex',
                          flexDirection: 'column' as const,
                          outline: hoveredFlowRow === lec.rowIndex ? '2px solid var(--primary)' : undefined,
                          boxShadow: hoveredFlowRow === lec.rowIndex ? '0 0 0 4px rgba(29,68,144,0.12)' : undefined,
                        }}
                        onClick={() => { if (effectiveIsCO1) setEditRow(lec) }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginBottom: '3px', flexWrap: 'wrap' }}>
                          {draggableHere && (
                            <span
                              title="드래그해서 요일/시간 옮기기"
                              className="no-print"
                              style={{ cursor: 'grab', color: 'var(--text-muted)', fontSize: '12px', marginRight: '1px', flexShrink: 0 }}
                              onClick={e => e.stopPropagation()}
                            >⠿</span>
                          )}
                          <span style={{
                            fontSize: '13px', fontWeight: 700, padding: '1px 5px', borderRadius: '8px',
                            background: badgeBg, color: isCompleted ? '#9CA3AF' : '#000',
                            border: `1px solid ${isCompleted ? '#D1D5DB' : borderColor}`,
                          }}>
                            {TYPE_LABEL[lec.type]}
                          </span>
                          {lec.note?.includes('#시험') && (
                            <span style={{ fontSize: '11px', fontWeight: 700, padding: '1px 5px', borderRadius: '8px', background: 'rgba(251,191,36,0.2)', border: '1px solid rgba(251,191,36,0.6)', color: isCompleted ? '#9CA3AF' : '#B45309' }}>
                              ⭐ 시험과목
                            </span>
                          )}
                          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {lec.location && (
                              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                📍 {lec.location}
                              </span>
                            )}
                            <span style={{ fontSize: '11px', color: '#000', fontWeight: 600 }}>{lec.duration}</span>
                          </div>
                          {effectiveCanCheck && lec.rowIndex !== undefined && (
                            <input
                              type="checkbox"
                              checked={isCompleted}
                              onChange={e => { e.stopPropagation(); toggleComplete(lec.rowIndex!, e) }}
                              onClick={e => e.stopPropagation()}
                              disabled={!canCheckHere}
                              title={!canCheckHere ? (isRealIntern ? '본인 직무 탭에서만 체크 가능' : '읽기 전용') : '교육 완료 체크'}
                              style={{ width: '13px', height: '13px', cursor: canCheckHere ? 'pointer' : 'not-allowed', accentColor: color, flexShrink: 0, opacity: canCheckHere ? 1 : 0.4 }}
                            />
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px', marginBottom: '2px', flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: '13px', fontWeight: 700,
                            color: isCompleted ? '#9CA3AF' : 'var(--text-primary)',
                            lineHeight: 1.25,
                            textDecoration: isCompleted ? 'line-through' : 'none',
                          }}>
                            {lec.name}
                          </span>
                          {lec.teacher && lec.teacher !== '-' && (
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                              👤 {lec.teacher}
                            </span>
                          )}
                        </div>

                        {lec.link_labels.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '3px' }}>
                            {lec.link_labels.map((label, idx) => {
                              const url = lec.link_urls[idx]
                              return url ? (
                                <a key={idx} href={url} target="_blank" rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  style={{ fontSize: '11px', fontWeight: 600, padding: '1px 6px', borderRadius: '10px', background: badgeBg, border: `1px solid ${borderColor}`, color, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                                  🔗 {label}
                                </a>
                              ) : (
                                <span key={idx} style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '10px', background: 'rgba(0,0,0,0.04)', border: '1px solid var(--border)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                  {label}
                                </span>
                              )
                            })}
                          </div>
                        )}

                        {lec.note?.replace(/#시험/g, '').trim() && (
                          <div style={{ fontSize: '11px', color: '#111', marginTop: '3px' }}>✅ {lec.note.replace(/#시험/g, '').trim()}</div>
                        )}


                        {/* Intern: task 타입 제출 영역 */}
                        {effectiveIsIntern && isTask && lec.rowIndex !== undefined && (
                          <div style={{ marginTop: 'auto', paddingTop: '4px' }} onClick={e => e.stopPropagation()}>
                            {submittedUrl ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                <a href={submittedUrl} target="_blank" rel="noopener noreferrer"
                                  style={{ fontSize: '9.5px', fontWeight: 700, color: '#059669', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                  ✅ 제출됨
                                </a>
                                {canCheckHere && (
                                  <button
                                    onClick={() => setSubmitTarget(lec)}
                                    style={{ fontSize: '9px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '0', fontFamily: 'inherit', textDecoration: 'underline' }}>
                                    수정
                                  </button>
                                )}
                              </div>
                            ) : canCheckHere ? (
                              <button
                                onClick={() => setSubmitTarget(lec)}
                                style={{
                                  fontSize: '10px', fontWeight: 700,
                                  padding: '3px 8px', borderRadius: '6px',
                                  background: '#F59E0B', color: '#fff',
                                  border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                                  display: 'flex', alignItems: 'center', gap: '3px',
                                }}>
                                📎 제출하기
                              </button>
                            ) : (
                              <span style={{ fontSize: '9.5px', color: '#9CA3AF', fontStyle: 'italic' }}>미제출</span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })
              })}
            </div>

            {/* 하단 행: 강의평가 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: `70px repeat(${dayGroups.length}, minmax(200px, 1fr))`,
              minWidth: `${70 + dayGroups.length * 160}px`,
              borderTop: '2px solid var(--mobi-orange)',
              background: '#FFFAF7',
            }}>
              <div style={{
                padding: '10px 8px 10px 4px', textAlign: 'right',
                fontSize: '9.5px', fontWeight: 700, color: 'var(--mobi-orange)',
                borderRight: '2px solid var(--border)',
                position: 'sticky', left: 0, background: '#FFFAF7', zIndex: 2,
                display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
              }}>
                강의<br/>평가
              </div>
              {dayGroups.map(day => {
                // 이 일차의 오프라인·온라인 강의 (피드백 대상)
                const offlineLectures = day.lectures.filter(l => (l.type === 'offline' || l.type === 'online') && !l.feedback_exclude)
                const doneFeedbacks   = offlineLectures.filter(l => myFeedbacks[l.name])
                const allFeedbackDone = offlineLectures.length > 0 && doneFeedbacks.length === offlineLectures.length

                return (
                  <div key={day.day_num} style={{
                    borderLeft: '1px solid var(--border)',
                    padding: '8px 10px',
                    display: 'flex', flexDirection: 'column', gap: '5px',
                  }}>
                    {day.eval_label && (
                      effectiveIsIntern ? (
                        /* 실제 인턴: 강의별 피드백 버튼 */
                        offlineLectures.length === 0 ? (
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>—</span>
                        ) : allFeedbackDone ? (
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#059669' }}>✅ 강의평가 완료</span>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {offlineLectures.map(lec => {
                              const done = !!myFeedbacks[lec.name]
                              return (
                                <button
                                  key={lec.rowIndex}
                                  onClick={() => setFeedbackTarget(lec)}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: '4px',
                                    padding: '4px 8px', borderRadius: '7px', cursor: 'pointer',
                                    border: done ? '1px solid #86EFAC' : '1px solid rgba(5,150,105,0.35)',
                                    background: done ? '#F0FDF4' : 'rgba(5,150,105,0.06)',
                                    fontFamily: 'inherit', fontSize: '11px', fontWeight: 600,
                                    color: done ? '#059669' : '#065F46',
                                    textAlign: 'left',
                                    textDecoration: done ? 'line-through' : 'none',
                                  }}
                                >
                                  {done ? '✅' : '📝'}
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '130px' }}>
                                    {lec.name}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        )
                      ) : (
                        /* CO1·Member: 응답 현황 표시 */
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          {day.eval_label}
                        </span>
                      )
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* 과제 제출 섹션 */}
          {(() => {
            const taskRowsForView = allRows.filter(r => {
              if (r.week_num !== currentWeek) return false
              if (r.week_num === 2 && r.week_variant && r.week_variant !== week2Variant) return false
              if (r.type !== 'task' && !r.has_assignment) return false
              return r.job_types.includes('all') || r.job_types.includes(currentJob)
            }).sort((a, b) => {
              // 마감일 이른 순 — 마감일 없는 항목은 뒤로 (모든 직무 탭에 동일하게 적용)
              if (!a.assignment_deadline && !b.assignment_deadline) return 0
              if (!a.assignment_deadline) return 1
              if (!b.assignment_deadline) return -1
              return a.assignment_deadline.localeCompare(b.assignment_deadline)
            })
            if (taskRowsForView.length === 0) return null
            return (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 18px', marginTop: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#92400E', marginBottom: '10px' }}>📎 과제 제출</div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {taskRowsForView.map(lec => {
                    const submitted = effectiveSubs[lec.rowIndex]
                    return (
                      <div key={lec.rowIndex} style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        background: submitted ? '#F0FDF4' : '#FFFBEB',
                        border: `1px solid ${submitted ? '#86EFAC' : '#FDE68A'}`,
                        borderRadius: '10px',
                        padding: '8px 14px',
                      }}>
                        <span style={{ fontSize: '11.5px', fontWeight: 700, color: submitted ? '#059669' : '#92400E' }}>
                          {submitted ? '✅' : '📋'} {lec.name}
                        </span>
                        {lec.assignment_deadline && (
                          <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#B45309', background: 'rgba(245,158,11,0.12)', borderRadius: '8px', padding: '1px 7px' }}>
                            마감 {lec.assignment_deadline}
                          </span>
                        )}
                        {lec.note && (
                          <span style={{ fontSize: '10.5px', color: '#9CA3AF' }}>· {lec.note}</span>
                        )}
                        {submitted ? (
                          <a href={submitted} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: '10.5px', color: '#059669', fontWeight: 600, textDecoration: 'none', background: '#DCFCE7', border: '1px solid #86EFAC', borderRadius: '6px', padding: '2px 8px' }}>
                            링크 보기
                          </a>
                        ) : canCheckHere ? (
                          <button
                            onClick={() => setSubmitTarget(lec)}
                            style={{
                              fontSize: '10.5px', fontWeight: 700,
                              padding: '3px 10px', borderRadius: '6px',
                              background: '#F59E0B', color: '#fff',
                              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                            }}>
                            제출하기
                          </button>
                        ) : (
                          <span style={{ fontSize: '10px', color: '#9CA3AF', fontStyle: 'italic' }}>미제출</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
          </>
        )}
      </main>

      {editRow && isCO1 && (
        <EditModal
          row={editRow}
          onSave={handleSave}
          onDelete={editRow.isNew ? undefined : handleDelete}
          onClose={() => setEditRow(null)}
          isCO1={isCO1}
        />
      )}

      {submitTarget && (
        <SubmitTaskModal
          lecture={submitTarget}
          existingUrl={submitTarget.rowIndex !== undefined ? submissionsMap[submitTarget.rowIndex] : undefined}
          onSubmit={(url) => handleTaskSubmit(submitTarget.rowIndex!, url)}
          onClose={() => setSubmitTarget(null)}
        />
      )}

      {feedbackTarget && (
        <FeedbackModal
          lecture={feedbackTarget}
          existing={myFeedbacks[feedbackTarget.name]}
          onSubmit={async (data) => {
            if (!isRealIntern) {
              showToast('미리보기 모드에서는 제출할 수 없습니다')
              setFeedbackTarget(null)
              return
            }
            const res = await fetch('/api/feedbacks', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data),
            })
            if (res.ok) {
              setMyFeedbacks(prev => ({
                ...prev,
                [feedbackTarget.name]: { ...data, intern_name: '', timestamp: '' },
              }))
              showToast('✅ 피드백이 저장되었습니다')
              setFeedbackTarget(null)
            } else {
              showToast('❌ 저장 실패, 다시 시도해주세요')
            }
          }}
          onClose={() => setFeedbackTarget(null)}
        />
      )}
    </>
  )
}
