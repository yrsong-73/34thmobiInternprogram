'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'

const DEPARTMENTS = ['마케팅1팀','마케팅2팀','마케팅3팀','마케팅4팀','마케팅5팀','마케팅6팀','PM','CC','HRBP']

// 30분 단위 그리드 (schedule 페이지와 동일한 기준 — 10:00~19:00)
const GRID_TIMES = [
  '10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30',
  '15:00','15:30','16:00','16:30','17:00','17:30','18:00','18:30','19:00',
]
const TIME_INDEX: Record<string, number> = {}
GRID_TIMES.forEach((t, i) => { TIME_INDEX[t] = i })

function isMonOrTue(dateLabel: string): boolean {
  return dateLabel.endsWith('월') || dateLabel.endsWith('화')
}

function dateSortKey(label: string): number {
  const m = label.match(/(\d+)\/(\d+)/)
  return m ? Number(m[1]) * 100 + Number(m[2]) : 0
}

interface ScheduleRowLite {
  date_label: string
  time: string
  type: string
  job_types: string[]
}

/** 시간표에서 "온라인" 또는 "자기주도" 강의가 있는 시간대를 면담 가능 슬롯으로 계산 (월/화 제외, 마케팅 대상 강의만) */
function computeDateSlots(rows: ScheduleRowLite[]): Record<string, string[]> {
  const byDate: Record<string, Set<string>> = {}
  for (const r of rows) {
    if (r.type !== 'online' && r.type !== 'self') continue
    if (isMonOrTue(r.date_label)) continue
    if (!r.job_types.includes('all') && !r.job_types.includes('marketing')) continue
    const [start, end] = (r.time || '').split('~').map(s => s.trim())
    const si = TIME_INDEX[start]
    const ei = TIME_INDEX[end]
    if (si === undefined || ei === undefined || ei <= si) continue
    if (!byDate[r.date_label]) byDate[r.date_label] = new Set()
    for (let i = si; i < ei; i++) {
      byDate[r.date_label].add(`${GRID_TIMES[i]}~${GRID_TIMES[i + 1]}`)
    }
  }
  const result: Record<string, string[]> = {}
  for (const [date, slotSet] of Object.entries(byDate)) {
    result[date] = Array.from(slotSet).sort()
  }
  return result
}

interface Interview {
  rowIndex: number
  intern_name: string
  date: string
  time_slot: string
  booked_by: string
}

export default function InterviewPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const role = (session?.user as any)?.role as string | undefined

  const [interviews, setInterviews] = useState<Interview[]>([])
  const [allInternsMkt, setAllInternsMkt] = useState<{ name: string; is_active: boolean }[]>([])
  const [dateSlots, setDateSlots] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'intern' | 'leader'>('intern')
  const [selectedDept, setSelectedDept] = useState(DEPARTMENTS[0])

  // CO1: 전체 마케팅 인턴. Member: 활성 인턴만
  const internNames = allInternsMkt
    .filter(i => role === 'CO1' || i.is_active)
    .map(i => i.name)

  const activeDates = Object.keys(dateSlots).sort((a, b) => dateSortKey(a) - dateSortKey(b))

  // 면담 신청 폼
  const [fDept, setFDept] = useState(DEPARTMENTS[0])
  const [fInterns, setFInterns] = useState<string[]>([])
  const [fDate, setFDate] = useState('')
  const [fTime, setFTime] = useState('')
  const [booking, setBooking] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [ivRes, intRes, schedRes] = await Promise.all([
        fetch('/api/interviews'),
        fetch('/api/interns'),
        fetch('/api/schedule'),
      ])
      const ivData = await ivRes.json()
      const intData = await intRes.json()
      const schedData = await schedRes.json()
      setInterviews(ivData.interviews || [])
      const mktAll = (intData.interns || [])
        .filter((i: any) => i.type === 'marketing')
        .map((i: any) => ({ name: i.name as string, is_active: i.is_active !== false }))
      setAllInternsMkt(mktAll)

      const slots = computeDateSlots(schedData.rows || [])
      setDateSlots(slots)
      const sortedDates = Object.keys(slots).sort((a, b) => dateSortKey(a) - dateSortKey(b))
      setFDate(prev => (prev && slots[prev]) ? prev : (sortedDates[0] || ''))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status === 'loading') return
    // 인턴 접근 완전 차단 (previewMode 관계없이 실제 세션 role 기준)
    if (role === 'Intern') { router.push('/schedule'); return }
    fetchData()
  }, [status, role]) // eslint-disable-line

  const canEdit = role === 'CO1' || role === 'Member'

  // 인턴 한 명 예약 (기존 슬롯 있으면 PATCH, 없으면 생성 후 PATCH) — 그룹 신청 시 선택된 인턴마다 반복 호출
  async function bookOne(internName: string): Promise<boolean> {
    const record = interviews.find(iv =>
      iv.intern_name === internName && iv.date === fDate && iv.time_slot === fTime
    )
    if (record) {
      const res = await fetch('/api/interviews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowIndex: record.rowIndex, booked_by: fDept }),
      })
      return res.ok
    }
    await fetch('/api/interviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intern_name: internName, date: fDate, time_slot: fTime }),
    })
    const all = await (await fetch('/api/interviews')).json()
    const newRec = (all.interviews as Interview[]).find(iv =>
      iv.intern_name === internName && iv.date === fDate && iv.time_slot === fTime
    )
    if (!newRec) return false
    const res = await fetch('/api/interviews', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rowIndex: newRec.rowIndex, booked_by: fDept }),
    })
    return res.ok
  }

  // 면담 신청 폼 제출 — 선택된 인턴 전원에게 같은 날짜/시간으로 그룹 면담 예약
  async function submitBook() {
    if (!fDept || !fDate || !fTime || fInterns.length === 0) return
    setBooking(true)
    const failed: string[] = []
    for (const name of fInterns) {
      const ok = await bookOne(name)
      if (!ok) failed.push(name)
    }
    if (failed.length > 0) {
      alert(`다음 인턴은 예약에 실패했습니다 (다른 리더가 먼저 예약했을 수 있어요): ${failed.join(', ')}`)
    }
    setFInterns([])
    await fetchData()
    setBooking(false)
  }

  async function deleteSlot(rowIndex: number) {
    if (!confirm('삭제하시겠습니까?')) return
    await fetch('/api/interviews', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rowIndex }),
    })
    await fetchData()
  }

  // fDate 변경 시 fTime/선택 인턴 초기화
  useEffect(() => { setFTime(''); setFInterns([]) }, [fDate])
  useEffect(() => { setFInterns([]) }, [fTime])

  function toggleFIntern(name: string) {
    setFInterns(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name])
  }

  if (status === 'loading' || loading) {
    return (
      <>
        <Nav />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'60vh', color:'var(--text-muted)', fontSize:'14px' }}>
          불러오는 중...
        </div>
      </>
    )
  }

  // ── 마케팅 인턴 기준 표 ──
  const InternTable = () => (
    <div>
      {activeDates.map(date => {
        const slots = dateSlots[date]
        return (
          <div key={date} style={{ marginBottom: '28px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>{date}</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'var(--mobi-dark)' }}>
                    <th style={{ ...th, color: 'rgba(255,255,255,0.7)', width: '120px' }}>시간</th>
                    {internNames.map(name => (
                      <th key={name} style={{ ...th, color: '#fff' }}>{name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {slots.map((slot, si) => (
                    <tr key={slot} style={{ background: si % 2 === 0 ? '#fff' : '#f9fafb' }}>
                      <td style={{ ...td, fontWeight: 600, color: 'var(--text-secondary)', background: si % 2 === 0 ? 'var(--bg-subtle)' : '#f0f1f3' }}>{slot}</td>
                      {internNames.map(intern => {
                        const rec = interviews.find(iv => iv.intern_name === intern && iv.date === date && iv.time_slot === slot)
                        return (
                          <td key={intern} style={{ ...td }}>
                            {rec?.booked_by ? (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                <span style={{ padding: '2px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: 'rgba(34,197,94,0.12)', color: '#15803D', border: '1px solid rgba(34,197,94,0.3)', whiteSpace: 'nowrap' }}>
                                  {rec.booked_by}
                                </span>
                                {canEdit && (
                                  <button onClick={() => deleteSlot(rec.rowIndex)} style={miniBtn('delete')}>삭제</button>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
      {internNames.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '14px' }}>마케팅 인턴이 등록되지 않았습니다</div>
      )}
      {activeDates.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '14px' }}>
          시간표에 온라인/자기주도 강의(월·화 제외)가 없어 면담 가능한 날짜가 없습니다
        </div>
      )}
    </div>
  )

  // ── 팀 리더 기준 표 ──
  const LeaderTable = () => {
    const deptSlots = interviews
      .filter(iv => iv.booked_by === selectedDept)
      .sort((a, b) => a.date.localeCompare(b.date) || a.time_slot.localeCompare(b.time_slot))
    return (
      <div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
          {DEPARTMENTS.map(dept => (
            <button key={dept} onClick={() => setSelectedDept(dept)} style={{
              padding: '5px 14px', borderRadius: '20px', fontSize: '12.5px', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
              background: selectedDept === dept ? 'var(--primary)' : '#fff',
              color: selectedDept === dept ? '#fff' : 'var(--text-secondary)',
              border: selectedDept === dept ? 'none' : '1px solid var(--border)',
            }}>{dept}</button>
          ))}
        </div>
        {deptSlots.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '14px' }}>
            {selectedDept} 예약 내역 없음
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
              <thead>
                <tr style={{ background: 'var(--mobi-dark)' }}>
                  {['인턴','날짜','시간',''].map(h => (
                    <th key={h} style={{ ...th, color: h ? '#fff' : 'rgba(255,255,255,0.7)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deptSlots.map((s, i) => (
                  <tr key={s.rowIndex} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb', borderBottom: '1px solid var(--border)' }}>
                    <td style={{ ...td, fontWeight: 600 }}>{s.intern_name}</td>
                    <td style={td}>{s.date}</td>
                    <td style={td}>{s.time_slot}</td>
                    <td style={td}>
                      {canEdit && (
                        <button onClick={() => deleteSlot(s.rowIndex)} style={miniBtn('delete')}>삭제</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <Nav />
      <main style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 20px' }}>
        {/* 타이틀 */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>면담 신청</h1>
        </div>

        {/* 면담 신청 폼 */}
        {canEdit && (
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow)', padding: '16px 20px', marginBottom: '16px',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
              📅 면담 신청
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '14px' }}>
              <div>
                <label style={labelSt}>신청 부서</label>
                <select value={fDept} onChange={e => setFDept(e.target.value)} style={selSt}>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={labelSt}>날짜</label>
                <select value={fDate} onChange={e => setFDate(e.target.value)} style={selSt}>
                  {activeDates.length === 0
                    ? <option value="">가능한 날짜 없음</option>
                    : activeDates.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={labelSt}>시간</label>
                <select
                  value={fTime}
                  onChange={e => setFTime(e.target.value)}
                  style={{ ...selSt, color: fTime ? 'var(--text-primary)' : 'var(--text-muted)' }}
                  disabled={!fDate || (dateSlots[fDate]?.length ?? 0) === 0}
                >
                  <option value="">{!fDate ? '날짜를 먼저 선택' : '시간 선택'}</option>
                  {(dateSlots[fDate] ?? []).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <button
                onClick={submitBook}
                disabled={!fTime || fInterns.length === 0 || booking}
                style={{
                  padding: '8px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                  cursor: fTime && fInterns.length > 0 && !booking ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit', border: 'none', transition: 'all 0.15s',
                  background: fTime && fInterns.length > 0 && !booking ? 'var(--primary)' : '#e5e7eb',
                  color: fTime && fInterns.length > 0 && !booking ? '#fff' : '#9ca3af',
                }}
              >
                {booking ? '신청 중...' : fInterns.length > 1 ? `${fInterns.length}명 그룹 신청하기` : '신청하기'}
              </button>
            </div>

            {/* 인턴 선택 — 날짜/시간을 고른 뒤에만 표시 */}
            {!fDate || !fTime ? (
              <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                날짜·시간을 먼저 선택하면 예약 가능한 인턴 목록이 표시됩니다
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary)', marginBottom: '8px' }}>
                  👥 인턴 선택 (복수 선택 가능 · 여러 명 선택 시 그룹 면담으로 함께 진행됩니다)
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {internNames.map(name => {
                    const rec = interviews.find(iv => iv.intern_name === name && iv.date === fDate && iv.time_slot === fTime && iv.booked_by)
                    const taken = !!rec
                    const checked = fInterns.includes(name)
                    return (
                      <label key={name} style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        padding: '6px 12px', borderRadius: '20px', fontSize: '12.5px', fontWeight: 600,
                        cursor: taken ? 'not-allowed' : 'pointer',
                        border: `1.5px solid ${taken ? 'var(--border)' : checked ? 'var(--primary)' : 'var(--border-strong)'}`,
                        background: taken ? 'var(--bg-hover)' : checked ? 'rgba(29,68,144,0.08)' : '#fff',
                        color: taken ? 'var(--text-muted)' : checked ? 'var(--primary)' : 'var(--text-secondary)',
                        opacity: taken ? 0.7 : 1,
                      }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={taken}
                          onChange={() => toggleFIntern(name)}
                          style={{ cursor: taken ? 'not-allowed' : 'pointer' }}
                        />
                        {name}
                        {taken && <span style={{ fontSize: '10.5px', fontWeight: 700 }}>· 이미 예약됨 ({rec!.booked_by})</span>}
                      </label>
                    )
                  })}
                  {internNames.length === 0 && (
                    <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>마케팅 인턴이 등록되지 않았습니다</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 뷰 탭 */}
        <div style={{ display: 'flex', gap: '2px', marginBottom: '16px', background: 'var(--bg-subtle)', padding: '4px', borderRadius: '10px', width: 'fit-content' }}>
          {(['intern', 'leader'] as const).map(m => (
            <button key={m} onClick={() => setViewMode(m)} style={{
              padding: '7px 20px', borderRadius: '7px', fontSize: '13px', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', border: 'none',
              background: viewMode === m ? '#fff' : 'transparent',
              color: viewMode === m ? 'var(--primary)' : 'var(--text-muted)',
              boxShadow: viewMode === m ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            }}>
              {m === 'intern' ? '마케팅 인턴 기준' : '팀 리더 기준'}
            </button>
          ))}
        </div>

        {/* 뷰 */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '20px 24px' }}>
          {viewMode === 'intern' ? <InternTable /> : <LeaderTable />}
        </div>
      </main>
    </>
  )
}

const th: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'left', fontWeight: 700,
  borderBottom: '2px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = {
  padding: '10px 14px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle',
}
const labelSt: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px',
}
const selSt: React.CSSProperties = {
  padding: '7px 10px', borderRadius: '7px', border: '1px solid var(--border)',
  fontSize: '13px', fontFamily: 'inherit', background: '#fff', color: 'var(--text-primary)',
}

function miniBtn(type: string): React.CSSProperties {
  const base: React.CSSProperties = { padding: '3px 8px', borderRadius: '5px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none' }
  if (type === 'cancel') return { ...base, background: 'rgba(234,179,8,0.1)', color: '#A16207', border: '1px solid rgba(234,179,8,0.3)' }
  if (type === 'delete') return { ...base, background: 'rgba(239,68,68,0.08)', color: '#DC2626', border: '1px solid rgba(239,68,68,0.2)' }
  return base
}
