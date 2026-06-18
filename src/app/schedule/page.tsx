'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import Nav from '@/components/Nav'
import { usePreview } from '@/context/PreviewContext'
import type { ScheduleRow, DayGroup, LectureType } from '@/types'

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
]

const GRID_SLOTS = [
  '10:00','10:30','11:00','11:30',
  '12:00','12:30',
  '13:00','13:30','14:00','14:30','15:00','15:30',
  '16:00','16:30','17:00','17:30','18:00','18:30',
]
const SLOT_ROW: Record<string, number> = {}
GRID_SLOTS.forEach((t, i) => { SLOT_ROW[t] = i + 1 })
SLOT_ROW['19:00'] = 19

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
    eval_label: evalLabel,
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
    duration:   row.duration   ?? '',
    lunch_with: row.lunch_with ?? '',
    note:       row.note       ?? '',
  })
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
      duration:    form.duration,
      link_labels: validLinks.map(r => r.label.trim()),
      link_urls:   validLinks.map(r => r.url.trim()),
      lunch_with:  form.lunch_with,
      note:        form.note,
      job_types:      jobTypes.length > 0 ? jobTypes : ['all'],
      count_for_rate: row.count_for_rate ?? false,
      flow_stage:     row.flow_stage ?? '',
      week_variant:   row.week_variant ?? '',
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
            <input style={inputStyle} value={form.time} onChange={e => set('time', e.target.value)} placeholder="예: 10:00~11:00" />
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
            <label style={labelStyle}>소요시간</label>
            <input style={inputStyle} value={form.duration} onChange={e => set('duration', e.target.value)} placeholder="예: 1h" />
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
            <div style={{
              width: '180px', position: 'relative', marginTop: '16px',
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
                ) : group.allDone ? (
                  <div key="done" style={{ fontSize: '11px', marginTop: '3px', fontWeight: 800, color: '#BBF7D0', animation: 'done-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    ✨ DONE!
                  </div>
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
            {/* 화살표 */}
            {idx < stageGroups.length - 1 && (
              <div style={{ padding: '0 5px', fontSize: '18px', color: 'var(--border-strong)', flexShrink: 0, alignSelf: 'flex-start', marginTop: '46px' }}>
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
  const [completedRows, setCompletedRows] = useState<Set<number>>(new Set())
  const [submissionsMap, setSubmissionsMap] = useState<Record<number, string>>({})
  const [submitTarget, setSubmitTarget]   = useState<ScheduleRow | null>(null)
  const [internJob, setInternJob]         = useState<string>('')
  const [jobVisible, setJobVisible]       = useState({ marketing: true, aiax: true, biz: true })
  const [week2Visible, setWeek2Visible]   = useState(true)
  const [week2Variant, setWeek2Variant]   = useState<'A' | 'B'>('A')
  const [hoveredFlowRow, setHoveredFlowRow] = useState<number | null>(null)

  // ── 미리보기 모드: 전역 컨텍스트에서 읽기 ──────────────────
  const { previewMode, previewInternName, internsList: previewInternsList } = usePreview()
  const [previewCompletedRows, setPreviewCompletedRows] = useState<Set<number>>(new Set())
  const [previewSubmissionsMap, setPreviewSubmissionsMap] = useState<Record<number, string>>({})

  // 파생: 실제 렌더링에 사용하는 effective 값
  const internPreviewActive = (previewMode === 'intern' || previewMode === 'intern-test') && !!previewInternName
  const effectiveIsCO1      = isCO1 && previewMode === 'off'
  const effectiveIsIntern   = isIntern || internPreviewActive
  const effectiveCanCheck   = effectiveIsCO1 || effectiveIsIntern
  const effectiveCompleted  = previewMode === 'member' ? new Set<number>() :
                              internPreviewActive ? previewCompletedRows : completedRows
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
      })
      setWeek2Visible(settings?.week_2_visible !== false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (status === 'authenticated') fetchAll() }, [status, fetchAll])

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

  useEffect(() => {
    if (hoveredFlowRow === null) return
    const el = document.querySelector<HTMLElement>(`[data-row-index="${hoveredFlowRow}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [hoveredFlowRow])

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
          lectures:   [],
        })
      }
      map.get(r.day_num)!.lectures.push(r)
    })
    map.forEach(g => g.lectures.sort((a, b) => a.time.localeCompare(b.time)))
    return Array.from(map.values()).sort((a, b) => a.day_num - b.day_num)
  })()

  // 일반 체크박스 토글 (task 제외)
  async function toggleComplete(rowIndex: number, e: { stopPropagation(): void }) {
    e.stopPropagation()
    const isTestMode = previewMode === 'intern-test' && !!previewInternName
    if (previewMode !== 'off' && !isTestMode) return
    const targetSet = isTestMode ? previewCompletedRows : completedRows
    const setFn     = isTestMode ? setPreviewCompletedRows : setCompletedRows
    const wasChecked = targetSet.has(rowIndex)
    setFn(prev => {
      const next = new Set(prev)
      if (next.has(rowIndex)) { next.delete(rowIndex) } else { next.add(rowIndex) }
      return next
    })
    try {
      const body: Record<string, unknown> = { scheduleRowIndex: rowIndex, checked: !wasChecked }
      if (isTestMode) body.viewAsName = previewInternName
      const res = await fetch('/api/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
    } catch {
      setFn(prev => {
        const next = new Set(prev)
        if (wasChecked) { next.add(rowIndex) } else { next.delete(rowIndex) }
        return next
      })
      showToast('⚠️ 저장 실패. 다시 시도해주세요.')
    }
  }

  // 과제 URL 제출
  async function handleTaskSubmit(rowIndex: number, url: string) {
    const isTestMode = previewMode === 'intern-test' && !!previewInternName
    if (previewMode !== 'off' && !isTestMode) return
    try {
      const body: Record<string, unknown> = { scheduleRowIndex: rowIndex, checked: true, submissionUrl: url }
      if (isTestMode) body.viewAsName = previewInternName
      const res = await fetch('/api/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      if (isTestMode) {
        setPreviewCompletedRows(prev => new Set([...prev, rowIndex]))
        setPreviewSubmissionsMap(prev => ({ ...prev, [rowIndex]: url }))
      } else {
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
      await fetch('/api/schedule', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rowIndex: editRow.rowIndex, ...data }) })
      showToast('✅ 수정됐습니다')
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
          <p style={{ color: 'var(--text-secondary)', fontSize: '13.5px' }}>34기 인턴십 | 직무별 시간표 선택 후 자료 링크를 활용하세요</p>
        </div>

        <div className="no-print" style={{ background: 'var(--mobi-dark)', borderRadius: 'var(--radius)', padding: '16px 20px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          {driveUrl && (
            <a href={driveUrl} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,107,43,0.15)', border: '1px solid rgba(255,107,43,0.3)', borderRadius: '8px', padding: '9px 16px', color: '#FF9469', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>
              <i className="fa-brands fa-google-drive" /> 34기 인턴십 마스터 폴더
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
              Week 2 · 6/29~7/3
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
            if (w === 2 && !week2Visible && !effectiveIsCO1) return null
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
                {w === 1 ? 'Week 1 · 6/22~6/26 공통+직무별 교육' : 'Week 2 · 6/29~7/3 과제 수행 및 최종 발표'}
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
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#1D4490' }}>📅 34기 인턴십 교육 시간표</div>
          <div style={{ fontSize: '12px', color: '#444', marginTop: '3px' }}>
            {currentWeek === 1 ? 'Week 1 · 6/22~6/26' : 'Week 2 · 6/29~7/3'}
            {' · '}
            {JOB_TABS.find(t => t.key === currentJob)?.label ?? currentJob}
          </div>
        </div>

        {dayGroups.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
            {isCO1 ? '아직 강의가 없습니다. 헤더의 + 강의 추가 버튼을 사용하세요.' : '시간표 준비 중입니다.'}
          </div>
        ) : (
          <div className="schedule-card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', overflowX: 'auto', maxWidth: `${70 + dayGroups.length * 200}px` }}>

            {/* 헤더 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: `70px repeat(${dayGroups.length}, 1fr)`,
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
              gridTemplateColumns: `70px repeat(${dayGroups.length}, 1fr)`,
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
                  return (
                    <div key={`bg-${di}-${i}`} style={{
                      gridColumn: di + 2, gridRow: i + 1,
                      borderBottom: '1px dashed var(--border)',
                      borderLeft: '1px solid var(--border)',
                      background: isLunch ? '#FFFDF5' : undefined,
                      boxSizing: 'border-box' as const,
                    }} />
                  )
                })
              )}

              {/* 웰컴런치 셀 */}
              {dayGroups.map((day, di) => {
                const lunchLec = day.lectures.find(lec => lec.type === 'lunch')
                return (
                  <div
                    key={`lunch-${di}`}
                    style={{
                      gridColumn: di + 2,
                      gridRow: `${LUNCH_SR} / ${LUNCH_ER}`,
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
              {dayGroups.flatMap((day, di) =>
                day.lectures
                  .filter(lec => lec.type !== 'lunch' && !(lec.type === 'task' && !lec.time))
                  .map(lec => {
                    const rows = parseRows(lec.time)
                    if (!rows) return null
                    const { sr, er }   = rows
                    const color        = TYPE_COLOR[lec.type] || '#888'
                    const bg           = TYPE_BG[lec.type]    || '#F9FAFB'
                    const borderColor  = color + '88'
                    const badgeBg      = bg
                    const isCompleted  = lec.rowIndex !== undefined && effectiveCompleted.has(lec.rowIndex)
                    const isTask       = lec.type === 'task'
                    const submittedUrl = lec.rowIndex !== undefined ? effectiveSubs[lec.rowIndex] : undefined

                    return (
                      <div
                        key={lec.rowIndex}
                        data-row-index={lec.rowIndex}
                        style={{
                          gridColumn: di + 2,
                          gridRow: `${sr} / ${er}`,
                          margin: '2px 3px',
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
              )}
            </div>

            {/* 하단 행: 강의평가 + 과제제출 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: `70px repeat(${dayGroups.length}, 1fr)`,
              minWidth: `${70 + dayGroups.length * 160}px`,
              borderTop: '2px solid var(--mobi-orange)',
              background: '#FFFAF7',
            }}>
              {/* 시간 레이블 */}
              <div style={{
                padding: '10px 8px 10px 4px', textAlign: 'right',
                fontSize: '9.5px', fontWeight: 700, color: 'var(--mobi-orange)',
                borderRight: '2px solid var(--border)',
                position: 'sticky', left: 0, background: '#FFFAF7', zIndex: 2,
                display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
              }}>
                평가·<br/>과제
              </div>
              {dayGroups.map(day => {
                const evalRowIndex = 10000 + day.day_num
                const isEvalDone = effectiveCompleted.has(evalRowIndex)
                const taskLecs = day.lectures.filter(l => l.type === 'task')
                return (
                  <div key={day.day_num} style={{
                    borderLeft: '1px solid var(--border)',
                    padding: '8px 10px',
                    display: 'flex', flexDirection: 'column', gap: '5px',
                  }}>
                    {/* 강의평가 */}
                    {day.eval_label && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: canCheckHere ? 'pointer' : 'default' }}>
                        {effectiveCanCheck && (
                          <input
                            type="checkbox"
                            checked={isEvalDone}
                            onChange={e => toggleComplete(evalRowIndex, e)}
                            disabled={!canCheckHere}
                            title={!canCheckHere && isRealIntern ? '본인 직무 탭에서만 체크 가능' : undefined}
                            style={{ width: '13px', height: '13px', cursor: canCheckHere ? 'pointer' : 'not-allowed', accentColor: 'var(--mobi-orange)', flexShrink: 0, opacity: canCheckHere ? 1 : 0.4 }}
                          />
                        )}
                        <span style={{
                          fontSize: '11px', fontWeight: 700,
                          color: isEvalDone ? '#9CA3AF' : 'var(--mobi-orange)',
                          textDecoration: isEvalDone ? 'line-through' : 'none',
                        }}>
                          📝 강의평가
                        </span>
                      </label>
                    )}
                    {/* 과제폴더 링크 */}
                    {submitUrl && taskLecs.length > 0 && (
                      <a href={submitUrl} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: '10px', color: '#059669', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        📁 과제폴더
                      </a>
                    )}
                    {/* 과제 항목들 */}
                    {taskLecs.map(lec => {
                      const hasUrl = lec.link_urls.length > 0 && !!lec.link_urls[0]
                      const submitted = lec.rowIndex !== undefined ? effectiveSubs[lec.rowIndex] : undefined
                      if (!hasUrl) {
                        // URL 없는 task → 마감 안내 텍스트만 표시
                        return (
                          <div key={lec.rowIndex} style={{ fontSize: '11px', fontWeight: 600, color: '#F59E0B' }}>
                            📋 {lec.name}{lec.note ? ` · ${lec.note}` : ''}
                          </div>
                        )
                      }
                      return (
                        <div key={lec.rowIndex} style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                          {effectiveCanCheck && lec.rowIndex !== undefined && (
                            <input
                              type="checkbox"
                              checked={effectiveCompleted.has(lec.rowIndex)}
                              onChange={e => toggleComplete(lec.rowIndex!, e)}
                              disabled={!canCheckHere}
                              title={!canCheckHere && isRealIntern ? '본인 직무 탭에서만 체크 가능' : undefined}
                              style={{ width: '13px', height: '13px', cursor: canCheckHere ? 'pointer' : 'not-allowed', accentColor: '#F59E0B', flexShrink: 0, opacity: canCheckHere ? 1 : 0.4 }}
                            />
                          )}
                          {submitted ? (
                            <a href={submitted} target="_blank" rel="noopener noreferrer"
                              style={{ fontSize: '10.5px', color: '#059669', fontWeight: 600, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '110px' }}
                              title={lec.name}>
                              ✅ {lec.link_labels[0] || lec.name}
                            </a>
                          ) : canCheckHere ? (
                            <button
                              onClick={() => setSubmitTarget(lec)}
                              style={{
                                fontSize: '10px', fontWeight: 700,
                                padding: '2px 7px', borderRadius: '5px',
                                background: '#F59E0B', color: '#fff',
                                border: 'none', cursor: 'pointer',
                                fontFamily: 'inherit',
                              }}>
                              📎 {lec.link_labels[0] || '과제제출'}
                            </button>
                          ) : effectiveCanCheck ? (
                            <span style={{ fontSize: '10px', color: '#9CA3AF', fontStyle: 'italic' }}>미제출</span>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
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
    </>
  )
}
