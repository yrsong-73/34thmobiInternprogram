'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import Nav from '@/components/Nav'
import { usePreview } from '@/context/PreviewContext'
import type { Intern, Record as InternRecord } from '@/types'

function showToast(msg: string) {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = msg
  el.classList.add('show')
  setTimeout(() => el.classList.remove('show'), 2200)
}

const JOB_FILTER = [
  { key: 'all',       label: '전체' },
  { key: 'marketing', label: '마케팅' },
  { key: 'aiax',      label: 'AI·AX' },
  { key: 'biz',       label: '사업기획·전략' },
]

const JOB_COLOR: Record<string, string> = {
  marketing: '#FF6B2B',
  aiax:      '#3B82F6',
  biz:       '#8B5CF6',
}
const JOB_BG: Record<string, string> = {
  marketing: 'rgba(255,107,43,0.1)',
  aiax:      'rgba(59,130,246,0.1)',
  biz:       'rgba(139,92,246,0.1)',
}


function scoreColor(score: number, max: number) {
  if (score === 0) return 'var(--text-muted)'
  const pct = score / max
  if (pct >= 0.8) return '#059669'
  if (pct >= 0.6) return '#F59E0B'
  return '#EF4444'
}

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const role  = (session?.user as any)?.role as string | undefined
  const { effectiveRole, isCO1Real, previewMode } = usePreview()
  const isCO1 = effectiveRole === 'CO1'           // 편집 권한: 실제 CO1 + 미리보기 꺼진 상태
  const canEdit = role === 'CO1' && previewMode === 'off'

  const [interns, setInterns]             = useState<Intern[]>([])
  const [records, setRecords]             = useState<InternRecord[]>([])
  const [loading, setLoading]             = useState(true)
  const [filter, setFilter]               = useState('all')
  const [selectedName, setSelectedName]   = useState<string | null>(null)
  const [editingName, setEditingName]     = useState<string | null>(null)
  const [editData, setEditData]           = useState<Partial<Intern>>({})
  const [saving, setSaving]               = useState(false)
  // 지각/결석 메모: { 인턴명: 텍스트 } — Sheets attend_note 컬럼 연동 전 세션 내 유지
  const [attendNotes, setAttendNotes]     = useState<Record<string, string>>({})
  const [attendRates, setAttendRates]     = useState<Record<string, number>>({})
  const [submissions, setSubmissions]     = useState<Record<string, { rowIndex: number; scheduleName: string; submissionUrl: string }[]>>({})

  const tableRef = useRef<HTMLDivElement>(null)
  const rowRefs  = useRef<Record<string, HTMLTableRowElement | null>>({})

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login')
    // 실제 인턴은 리다이렉트 (미리보기 중인 CO1은 유지)
    if (status === 'authenticated' && role === 'Intern') router.replace('/schedule')
  }, [status, role, router])

  async function fetchInterns(): Promise<Intern[]> {
    try {
      const res = await fetch('/api/interns')
      if (res.ok) {
        const data = await res.json()
        return data.interns ?? []
      }
    } catch {}
    return []
  }

  async function fetchRecords(): Promise<InternRecord[]> {
    try {
      const res = await fetch('/api/records')
      if (res.ok) { const data = await res.json(); return data.records ?? [] }
    } catch {}
    return []
  }

  async function fetchSubmissions(): Promise<Record<string, { rowIndex: number; scheduleName: string; submissionUrl: string }[]>> {
    try {
      const res = await fetch('/api/intern-submissions')
      if (res.ok) { const data = await res.json(); return data.submissions ?? {} }
    } catch {}
    return {}
  }

  async function fetchAttendRates(): Promise<Record<string, number>> {
    try {
      const res = await fetch('/api/attend-rate')
      if (res.ok) { const data = await res.json(); return data.rates ?? {} }
    } catch {}
    return {}
  }

  async function loadAll() {
    setLoading(true)
    const [internsData, recordsData, ratesData, subsData] = await Promise.all([fetchInterns(), fetchRecords(), fetchAttendRates(), fetchSubmissions()])
    setInterns(internsData)
    setRecords(recordsData)
    setAttendRates(ratesData)
    setSubmissions(subsData)
    setLoading(false)
  }

  useEffect(() => { if (status === 'authenticated' && role !== 'Intern') loadAll() }, [status, role])

  const filtered = filter === 'all' ? interns : interns.filter(i => i.type === filter)

  function getInternRecords(name: string): InternRecord[] {
    return records.filter(r => r.intern === name).sort((a, b) => b.date.localeCompare(a.date))
  }

  // 카드 클릭 → 테이블 해당 행으로 스크롤 + 강조
  function handleCardClick(name: string) {
    const next = selectedName === name ? null : name
    setSelectedName(next)
    if (next) {
      setTimeout(() => {
        const row = rowRefs.current[next]
        if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 50)
    }
  }

  function startEdit(intern: Intern) {
    setEditingName(intern.name)
    setEditData({ ...intern })
  }

  async function saveEdit() {
    if (!editingName) return
    const intern = interns.find(i => i.name === editingName)
    if (!intern) return
    setSaving(true)
    const res = await fetch('/api/interns', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rowIndex: intern.rowIndex, ...editData }),
    })
    if (res.ok) { showToast('✅ 저장됐습니다'); await loadAll() }
    else showToast('❌ 저장 실패')
    setSaving(false)
    setEditingName(null)
  }

  // 인턴 미리보기 중: 인턴은 대시보드 접근 불가 안내
  if (status === 'authenticated' && effectiveRole === 'Intern') return (
    <>
      <Nav />
      <main style={{ padding: '60px 32px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '40px', marginBottom: '16px' }}>🔒</div>
        <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-primary)' }}>인턴은 이 페이지에 접근할 수 없습니다</div>
        <div style={{ fontSize: '13px', marginBottom: '20px' }}>인턴 시점 미리보기 중입니다. 인턴은 시간표 페이지만 접근 가능합니다.</div>
        <a href="/schedule" style={{ display: 'inline-block', padding: '8px 20px', background: 'var(--mobi-orange)', color: '#fff', borderRadius: '8px', fontWeight: 700, fontSize: '13px', textDecoration: 'none' }}>시간표로 이동</a>
      </main>
    </>
  )

  if (status === 'loading' || loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ width: '32px', height: '32px', border: '3px solid var(--border)', borderTopColor: 'var(--mobi-orange)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
        불러오는 중...
      </div>
    </div>
  )

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .intern-card:hover { transform: translateY(-2px); box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        .intern-card { transition: transform 0.15s, box-shadow 0.15s; }
        .table-row-selected { background: #FFD6C2 !important; }
      `}</style>
      <Nav />
      <main style={{ padding: '32px', maxWidth: '1400px', margin: '0 auto' }}>

        {/* 헤더 */}
        <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.5px', marginBottom: '6px' }}>📊 인턴 대시보드</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13.5px' }}>
              34기 인턴 {interns.length}명 · 점수 및 평가 현황
            </p>
          </div>
          {isCO1Real && previewMode !== 'off' && (
            <span style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', color: '#818CF8', fontSize: '12px', fontWeight: 700, padding: '4px 12px', borderRadius: '20px' }}>
              👁️ {previewMode === 'member' ? '멤버' : 'Intern'} 시점 미리보기
            </span>
          )}
        </div>

        {/* 직무 필터 탭 */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          {JOB_FILTER.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              style={{ padding: '7px 18px', borderRadius: '20px', border: `1.5px solid ${filter === f.key ? 'var(--mobi-dark)' : 'var(--border-strong)'}`, background: filter === f.key ? 'var(--mobi-dark)' : '#fff', color: filter === f.key ? '#fff' : 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
              {f.label}
            </button>
          ))}
        </div>

        {/* ── 인턴 카드 그리드 ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '12px', marginBottom: '36px' }}>
          {filtered.map(intern => {
            const jobColor  = JOB_COLOR[intern.type] || '#FF6B2B'
            const jobBg     = JOB_BG[intern.type]    || 'rgba(255,107,43,0.1)'
            const isSelected = selectedName === intern.name

            return (
              <div
                key={intern.name}
                className="card intern-card"
                onClick={() => handleCardClick(intern.name)}
                style={{
                  padding: '14px 16px', cursor: 'pointer',
                  borderTop: `3px solid ${jobColor}`,
                  outline: isSelected ? `2px solid ${jobColor}` : 'none',
                  outlineOffset: '2px',
                }}
              >
                {/* 직무 배지 + 이름 */}
                <div style={{ marginBottom: '10px' }}>
                  <span style={{ display: 'inline-block', fontSize: '10.5px', fontWeight: 700, color: jobColor, background: jobBg, padding: '2px 8px', borderRadius: '20px', marginBottom: '5px' }}>
                    {intern.job}
                  </span>
                  <div style={{ fontWeight: 700, fontSize: '15px' }}>{intern.name}</div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>{intern.mbti} · {intern.age}</div>
                </div>

                {/* 2×2 스탯 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
                  {[
                    { label: '수강체크율', val: attendRates[intern.name] ?? intern.attend_rate, unit: '%', max: 100 },
                    { label: '과제제출',   val: intern.assign_rate, unit: '%', max: 100 },
                    { label: '미니테스트', val: intern.score_mini,  unit: '점', max: 100 },
                    { label: '공통테스트', val: intern.score_test,  unit: '점', max: 100 },
                  ].map(s => (
                    <div key={s.label} style={{ background: '#F8F7F4', borderRadius: '7px', padding: '7px', textAlign: 'center' }}>
                      <div style={{ fontSize: '9.5px', color: 'var(--text-muted)', marginBottom: '2px' }}>{s.label}</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: scoreColor(s.val, s.max) }}>
                        {s.val}{s.unit}
                      </div>
                    </div>
                  ))}
                </div>

                {/* 제출 링크 패널 (CO1 + 카드 선택 시) */}
                {isCO1 && isSelected && (
                  <div style={{ marginTop: '10px', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                    <div style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>📎 과제 제출 링크</div>
                    {(submissions[intern.name] ?? []).length === 0 ? (
                      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontStyle: 'italic' }}>제출 없음</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {(submissions[intern.name] ?? []).map((s, i) => (
                          <a key={i} href={s.submissionUrl} target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            style={{ fontSize: '11.5px', color: 'var(--mobi-orange)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}
                            title={s.scheduleName}>
                            📄 {s.scheduleName}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '36px', opacity: 0.35, marginBottom: '12px' }}>📋</div>
            해당 직무의 인턴이 없습니다.
          </div>
        )}

        {/* ── 평가 통합표 ── */}
        <div ref={tableRef} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>📋 평가 통합표</h2>
            {canEdit && (
              <span style={{ fontSize: '12px', color: 'var(--mobi-orange)', background: 'rgba(255,107,43,0.07)', border: '1px solid var(--mobi-orange-border)', padding: '3px 10px', borderRadius: '6px' }}>
                ✏️ 각 행의 수정 버튼을 클릭하면 편집 가능합니다
              </span>
            )}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#F8F7F4' }}>
                  {(['직무','이름','MBTI / 나이','학교','경력','수강체크율','미니테스트','공통테스트','태도평가','TEST 상위 2과목','TEST 하위 2과목','과제 제출링크','지각/결석','태도 요약'] as const).map((h, i) => {
                    const FREEZE_LEFT = [0, 110, 200, 310, 420] as const
                    const FREEZE_MW   = [110, 90, 110, 110, 260] as const
                    const frozen = i < 5
                    return (
                      <th key={h} style={{
                        padding: '10px 8px', textAlign: 'left', fontWeight: 600,
                        color: 'var(--text-secondary)', fontSize: '11.5px',
                        borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap',
                        ...(frozen ? {
                          position: 'sticky' as const, left: FREEZE_LEFT[i], zIndex: 2,
                          background: '#F8F7F4', minWidth: FREEZE_MW[i],
                          ...(i === 4 ? { boxShadow: '3px 0 6px rgba(0,0,0,0.07)' } : {}),
                        } : {}),
                      }}>{h}</th>
                    )
                  })}
                  {canEdit && <th style={{ padding: '10px 8px', borderBottom: '2px solid var(--border)', width: '60px' }} />}
                </tr>
              </thead>
              <tbody>
                {filtered.map(intern => {
                  const isSelected  = selectedName   === intern.name
                  const isEditing   = editingName    === intern.name && canEdit
                  const internRecs  = getInternRecords(intern.name)
                  const attendNote  = attendNotes[intern.name] ?? (intern as any).attend_note ?? ''
                  const jobColor    = JOB_COLOR[intern.type] || '#FF6B2B'

                  return (
                    <tr
                      key={intern.name}
                      ref={el => { rowRefs.current[intern.name] = el }}
                      className={isSelected ? 'table-row-selected' : ''}
                      style={{
                        background: isSelected ? '#FFD6C2' : 'transparent',
                        borderBottom: '1px solid var(--border)',
                        transition: 'background 0.15s',
                      }}
                    >
                      {/* 직무 — frozen col 0 */}
                      <td style={{ padding: '12px 8px', whiteSpace: 'nowrap', position: 'sticky', left: 0, zIndex: 1, background: isSelected ? '#FFD6C2' : 'var(--bg-card)', minWidth: 110 }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: jobColor, background: jobColor + '18', padding: '2px 8px', borderRadius: '20px' }}>{intern.job}</span>
                      </td>

                      {/* 이름 — frozen col 1 */}
                      <td style={{ padding: '12px 8px', whiteSpace: 'nowrap', position: 'sticky', left: 110, zIndex: 1, background: isSelected ? '#FFD6C2' : 'var(--bg-card)', minWidth: 90 }}>
                        <span style={{ fontWeight: 700, fontSize: '14px' }}>{intern.name}</span>
                      </td>

                      {/* MBTI / 나이 — frozen col 2 */}
                      <td style={{ padding: '12px 8px', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: '12.5px', position: 'sticky', left: 200, zIndex: 1, background: isSelected ? '#FFD6C2' : 'var(--bg-card)', minWidth: 110 }}>
                        {intern.mbti && <span style={{ fontWeight: 600, color: '#6366F1' }}>{intern.mbti}</span>}
                        {intern.mbti && intern.age && <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>·</span>}
                        {intern.age && <span>{intern.age}</span>}
                        {!intern.mbti && !intern.age && <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>

                      {/* 학교 — frozen col 3 */}
                      <td style={{ padding: '12px 8px', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: '12.5px', position: 'sticky', left: 310, zIndex: 1, background: isSelected ? '#FFD6C2' : 'var(--bg-card)', minWidth: 110 }}>{intern.school}</td>

                      {/* 경력 — frozen col 4 (마지막 고정 + 그림자 구분선) */}
                      <td style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontSize: '12px', minWidth: 260, maxWidth: 400, position: 'sticky', left: 420, zIndex: 1, background: isSelected ? '#FFD6C2' : 'var(--bg-card)', boxShadow: '3px 0 6px rgba(0,0,0,0.07)' }}>
                        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{intern.career || '—'}</div>
                      </td>

                      {/* 수강체크율 */}
                      <td style={{ padding: '12px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {isEditing ? (
                          <input type="number" value={editData.attend_rate ?? intern.attend_rate}
                            onClick={e => e.stopPropagation()}
                            onChange={e => setEditData(p => ({ ...p, attend_rate: Number(e.target.value) }))}
                            style={cellInputStyle} />
                        ) : (
                          <span style={{ fontWeight: 600, color: scoreColor(attendRates[intern.name] ?? intern.attend_rate, 100) }}>{attendRates[intern.name] ?? intern.attend_rate}%</span>
                        )}
                      </td>

                      {/* 미니테스트 */}
                      <td style={{ padding: '12px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {isEditing ? (
                          <input type="number" value={editData.score_mini ?? intern.score_mini}
                            onClick={e => e.stopPropagation()}
                            onChange={e => setEditData(p => ({ ...p, score_mini: Number(e.target.value) }))}
                            style={cellInputStyle} />
                        ) : (
                          <span style={{ fontWeight: 600, color: scoreColor(intern.score_mini, 100) }}>{intern.score_mini} 점</span>
                        )}
                      </td>

                      {/* 공통테스트 */}
                      <td style={{ padding: '12px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {isEditing ? (
                          <input type="number" value={editData.score_test ?? intern.score_test}
                            onClick={e => e.stopPropagation()}
                            onChange={e => setEditData(p => ({ ...p, score_test: Number(e.target.value) }))}
                            style={cellInputStyle} />
                        ) : (
                          <span style={{ fontWeight: 600, color: scoreColor(intern.score_test, 100) }}>{intern.score_test} 점</span>
                        )}
                      </td>

                      {/* 태도평가 */}
                      <td style={{ padding: '12px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {isEditing ? (
                          <input type="number" min={0} max={5} value={editData.score_attitude ?? intern.score_attitude}
                            onClick={e => e.stopPropagation()}
                            onChange={e => setEditData(p => ({ ...p, score_attitude: Number(e.target.value) }))}
                            style={{ ...cellInputStyle, width: '52px' }} />
                        ) : (
                          <span style={{ fontWeight: 600, color: scoreColor(intern.score_attitude, 5) }}>{intern.score_attitude} / 5</span>
                        )}
                      </td>

                      {/* TEST 상위 2과목 */}
                      <td style={{ padding: '12px 8px', minWidth: '120px', fontSize: '12.5px', color: 'var(--text-primary)' }}>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editData.test_top ?? intern.test_top ?? ''}
                            placeholder="예: 퍼포먼스마케팅, SEO"
                            onClick={e => e.stopPropagation()}
                            onChange={e => setEditData(p => ({ ...p, test_top: e.target.value }))}
                            style={{ width: '100%', padding: '4px 8px', border: '1px solid var(--mobi-orange)', borderRadius: '5px', fontSize: '12px', fontFamily: 'inherit', boxSizing: 'border-box' as const }}
                          />
                        ) : (
                          <span style={{ color: editData.test_top || intern.test_top ? '#059669' : 'var(--text-muted)', fontStyle: editData.test_top || intern.test_top ? 'normal' : 'italic' }}>
                            {intern.test_top || '—'}
                          </span>
                        )}
                      </td>

                      {/* TEST 하위 2과목 */}
                      <td style={{ padding: '12px 8px', minWidth: '120px', fontSize: '12.5px', color: 'var(--text-primary)' }}>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editData.test_bottom ?? intern.test_bottom ?? ''}
                            placeholder="예: GA4, 데이터분석"
                            onClick={e => e.stopPropagation()}
                            onChange={e => setEditData(p => ({ ...p, test_bottom: e.target.value }))}
                            style={{ width: '100%', padding: '4px 8px', border: '1px solid var(--mobi-orange)', borderRadius: '5px', fontSize: '12px', fontFamily: 'inherit', boxSizing: 'border-box' as const }}
                          />
                        ) : (
                          <span style={{ color: editData.test_bottom || intern.test_bottom ? '#EF4444' : 'var(--text-muted)', fontStyle: editData.test_bottom || intern.test_bottom ? 'normal' : 'italic' }}>
                            {intern.test_bottom || '—'}
                          </span>
                        )}
                      </td>

                      {/* 과제 제출링크 */}
                      <td style={{ padding: '12px 8px', minWidth: '140px' }}>
                        {(submissions[intern.name] ?? []).length === 0 ? (
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>없음</span>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            {(submissions[intern.name] ?? []).map((s, i) => (
                              <a key={i} href={s.submissionUrl} target="_blank" rel="noopener noreferrer"
                                style={{ fontSize: '11.5px', color: 'var(--mobi-orange)', textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: '160px' }}
                                title={s.scheduleName}>
                                📎 {s.scheduleName}
                              </a>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* 지각/결석 */}
                      <td style={{ padding: '12px 8px', minWidth: '120px' }} onClick={e => e.stopPropagation()}>
                        {isEditing ? (
                          <input
                            type="text"
                            value={attendNotes[intern.name] ?? (intern as any).attend_note ?? ''}
                            placeholder="예) 지각 1회/병원"
                            onChange={e => setAttendNotes(prev => ({ ...prev, [intern.name]: e.target.value }))}
                            style={{ width: '100%', padding: '4px 8px', border: '1px solid var(--mobi-orange)', borderRadius: '5px', fontSize: '12px', fontFamily: 'inherit', boxSizing: 'border-box' }}
                          />
                        ) : (
                          <span style={{ fontSize: '12.5px', color: attendNote ? 'var(--text-primary)' : 'var(--text-muted)', fontStyle: attendNote ? 'normal' : 'italic' }}>
                            {attendNote || '—'}
                          </span>
                        )}
                      </td>

                      {/* 태도 요약 (기록 내용 전체 + summary 필드) */}
                      <td style={{ padding: '12px 8px', minWidth: '200px', maxWidth: '320px' }}>
                        {isEditing ? (
                          <textarea
                            value={editData.summary ?? intern.summary ?? ''}
                            onClick={e => e.stopPropagation()}
                            onChange={e => setEditData(p => ({ ...p, summary: e.target.value }))}
                            rows={3}
                            placeholder="종합 코멘트 입력..."
                            style={{ width: '100%', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 8px', fontSize: '12px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
                          />
                        ) : (
                          <div>
                            {/* CO1이 직접 작성한 summary */}
                            {intern.summary && (
                              <p style={{ fontSize: '12.5px', color: 'var(--text-primary)', lineHeight: 1.6, margin: '0 0 6px 0' }}>{intern.summary}</p>
                            )}
                            {/* 기록표에서 작성된 기록들 (작성자 구분 없이 내용만) */}
                            {internRecs.length > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {internRecs.map((r, i) => (
                                  <div key={i} style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap', borderLeft: '2px solid var(--border)', paddingLeft: '8px' }}>
                                    {r.content}
                                  </div>
                                ))}
                              </div>
                            )}
                            {!intern.summary && internRecs.length === 0 && (
                              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>—</span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* 수정/저장/취소 버튼 (실제 CO1 + 미리보기 꺼진 상태) */}
                      {canEdit && (
                        <td style={{ padding: '12px 8px', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                          {isEditing ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <button onClick={saveEdit} disabled={saving}
                                style={{ border: 'none', borderRadius: '5px', padding: '4px 10px', fontSize: '11px', color: '#fff', cursor: 'pointer', background: 'var(--mobi-orange)', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>저장</button>
                              <button onClick={() => setEditingName(null)}
                                style={{ border: '1px solid var(--border)', borderRadius: '5px', padding: '4px 10px', fontSize: '11px', color: 'var(--text-secondary)', cursor: 'pointer', background: '#fff', fontFamily: 'inherit' }}>취소</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => startEdit(intern)}
                              disabled={!!editingName}
                              style={{ border: '1px solid var(--border)', borderRadius: '5px', padding: '4px 10px', fontSize: '11px', color: editingName ? 'var(--text-muted)' : 'var(--text-secondary)', cursor: editingName ? 'default' : 'pointer', background: '#fff', fontFamily: 'inherit', opacity: editingName ? 0.5 : 1 }}>
                              ✏️ 수정
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </>
  )
}

const cellInputStyle: React.CSSProperties = {
  width: '64px', textAlign: 'center',
  border: '1px solid var(--mobi-orange)', borderRadius: '5px',
  padding: '3px 4px', fontSize: '13px', fontFamily: 'inherit',
}
