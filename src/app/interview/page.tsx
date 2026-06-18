'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'

const DEPARTMENTS = ['마케팅1팀','마케팅2팀','마케팅3팀','마케팅4팀','마케팅5팀','마케팅6팀','PM','CC','HRBP']

// 날짜별 면담 가능 슬롯 (30분 단위)
const DATE_SLOTS: Record<string, string[]> = {
  '6/23 화': ['13:30~14:00','14:00~14:30','14:30~15:00','15:00~15:30','17:30~18:00','18:00~18:30','18:30~19:00'],
  '6/24 수': ['10:30~11:00','11:00~11:30','11:30~12:00','14:30~15:00','15:00~15:30'],
  '6/25 목': ['14:00~14:30','14:30~15:00'],
}
const ACTIVE_DATES = Object.keys(DATE_SLOTS)

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
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'intern' | 'leader'>('intern')
  const [internNames, setInternNames] = useState<string[]>([])
  const [selectedDept, setSelectedDept] = useState(DEPARTMENTS[0])

  // 면담 신청 폼
  const [fDept, setFDept] = useState(DEPARTMENTS[0])
  const [fIntern, setFIntern] = useState('')
  const [fDate, setFDate] = useState(ACTIVE_DATES[0])
  const [fTime, setFTime] = useState('')
  const [booking, setBooking] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [ivRes, intRes] = await Promise.all([
        fetch('/api/interviews'),
        fetch('/api/interns'),
      ])
      const ivData = await ivRes.json()
      const intData = await intRes.json()
      setInterviews(ivData.interviews || [])
      const mkt = (intData.interns || [])
        .filter((i: any) => i.type === 'marketing')
        .map((i: any) => i.name as string)
      setInternNames(mkt)
      setFIntern(prev => prev || mkt[0] || '')
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

  // 슬롯 열기 (CO1만) — 해당 (intern, date, slot) 레코드 생성
  async function openSlot(internName: string, date: string, timeSlot: string) {
    await fetch('/api/interviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intern_name: internName, date, time_slot: timeSlot }),
    })
    await fetchData()
  }

  // 면담 신청 폼 제출
  async function submitBook() {
    if (!fDept || !fIntern || !fDate || !fTime) return
    setBooking(true)
    const record = interviews.find(iv =>
      iv.intern_name === fIntern && iv.date === fDate && iv.time_slot === fTime
    )
    if (record) {
      // 기존 슬롯 예약
      const res = await fetch('/api/interviews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowIndex: record.rowIndex, booked_by: fDept }),
      })
      if (!res.ok) {
        const d = await res.json()
        alert(d.error || '예약 실패')
        setBooking(false)
        return
      }
    } else {
      // 슬롯 없으면 Member는 불가 (CO1은 생성 후 예약)
      if (role !== 'CO1') {
        alert('해당 슬롯이 아직 열리지 않았습니다. CO1에게 문의하세요.')
        setBooking(false)
        return
      }
      await fetch('/api/interviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intern_name: fIntern, date: fDate, time_slot: fTime }),
      })
      const all = await (await fetch('/api/interviews')).json()
      const newRec = (all.interviews as Interview[]).find(iv =>
        iv.intern_name === fIntern && iv.date === fDate && iv.time_slot === fTime
      )
      if (newRec) {
        await fetch('/api/interviews', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rowIndex: newRec.rowIndex, booked_by: fDept }),
        })
      }
    }
    setFTime('')
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

  // fDate 변경 시 fTime 초기화
  useEffect(() => { setFTime('') }, [fDate, fIntern])

  // 선택된 intern+date의 예약 가능 슬롯 (record 있고 booked_by 없는 것)
  const availableTimes = DATE_SLOTS[fDate]?.filter(t => {
    const rec = interviews.find(iv => iv.intern_name === fIntern && iv.date === fDate && iv.time_slot === t)
    if (!rec) return role === 'CO1'  // CO1은 미오픈 슬롯도 바로 신청 가능
    return !rec.booked_by
  }) ?? []

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
      {ACTIVE_DATES.map(date => {
        const slots = DATE_SLOTS[date]
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
                          <td key={intern} style={{ ...td, textAlign: 'center' }}>
                            {!rec ? (
                              // 미오픈
                              role === 'CO1' ? (
                                <button onClick={() => openSlot(intern, date, slot)} style={{
                                  padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                                  cursor: 'pointer', fontFamily: 'inherit',
                                  background: 'rgba(99,102,241,0.08)', border: '1px dashed rgba(99,102,241,0.3)', color: '#6366F1',
                                }}>+ 열기</button>
                              ) : <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>
                            ) : !rec.booked_by ? (
                              // 예약 가능
                              <span style={{ color: '#15803D', fontSize: '12px', fontWeight: 600 }}>예약가능</span>
                            ) : (
                              // 예약됨
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', padding: '0 4px' }}>
                                <span style={{ padding: '2px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: 'rgba(34,197,94,0.12)', color: '#15803D', border: '1px solid rgba(34,197,94,0.3)', whiteSpace: 'nowrap' }}>
                                  {rec.booked_by}
                                </span>
                                {canEdit && (
                                  <button onClick={() => deleteSlot(rec.rowIndex)} style={miniBtn('delete')}>삭제</button>
                                )}
                              </div>
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
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={labelSt}>신청 부서</label>
                <select value={fDept} onChange={e => setFDept(e.target.value)} style={selSt}>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={labelSt}>인턴 선택</label>
                <select value={fIntern} onChange={e => setFIntern(e.target.value)} style={selSt}>
                  {internNames.length === 0
                    ? <option value="">인턴 없음</option>
                    : internNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label style={labelSt}>날짜</label>
                <select value={fDate} onChange={e => setFDate(e.target.value)} style={selSt}>
                  {ACTIVE_DATES.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={labelSt}>시간</label>
                <select
                  value={fTime}
                  onChange={e => setFTime(e.target.value)}
                  style={{ ...selSt, color: fTime ? 'var(--text-primary)' : 'var(--text-muted)' }}
                  disabled={availableTimes.length === 0}
                >
                  <option value="">{availableTimes.length === 0 ? '예약 가능 슬롯 없음' : '시간 선택'}</option>
                  {availableTimes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <button
                onClick={submitBook}
                disabled={!fTime || !fIntern || booking}
                style={{
                  padding: '8px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                  cursor: fTime && fIntern && !booking ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit', border: 'none', transition: 'all 0.15s',
                  background: fTime && fIntern && !booking ? 'var(--primary)' : '#e5e7eb',
                  color: fTime && fIntern && !booking ? '#fff' : '#9ca3af',
                }}
              >
                {booking ? '신청 중...' : '신청하기'}
              </button>
            </div>
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
