'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'

const DEPARTMENTS = ['마케팅1팀','마케팅2팀','마케팅3팀','마케팅4팀','마케팅5팀','마케팅6팀','PM','CC']

// 날짜별 면담 가능 슬롯 (30분 단위)
const DATE_SLOTS: Record<string, string[]> = {
  '6/22 월': [],
  '6/23 화': ['13:30~14:00','14:00~14:30','14:30~15:00','15:00~15:30','17:30~18:00','18:00~18:30','18:30~19:00'],
  '6/24 수': ['10:30~11:00','11:00~11:30','11:30~12:00','14:30~15:00','15:00~15:30'],
  '6/25 목': ['14:00~14:30','14:30~15:00'],
  '6/26 금': [],
}

const WEEK_DATES = Object.keys(DATE_SLOTS)

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
  const [selectedIntern, setSelectedIntern] = useState<string>('')
  const [selectedDept, setSelectedDept] = useState<string>(DEPARTMENTS[0])
  const [internNames, setInternNames] = useState<string[]>([])

  // 슬롯 추가 상태
  const [addingFor, setAddingFor] = useState<{ intern: string; date: string } | null>(null)
  const [newSlotTime, setNewSlotTime] = useState<string>('')

  // 예약 상태
  const [bookingRow, setBookingRow] = useState<number | null>(null)
  const [bookingDept, setBookingDept] = useState<Record<number, string>>({})

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
      // type === 'marketing' 인 인턴만
      const mkt = (intData.interns || [])
        .filter((i: any) => i.type === 'marketing')
        .map((i: any) => i.name as string)
      setInternNames(mkt)
      if (mkt.length > 0 && !selectedIntern) setSelectedIntern(mkt[0])
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status === 'loading') return
    if (role === 'Intern') { router.push('/schedule'); return }
    fetchData()
  }, [status, role]) // eslint-disable-line

  const canEdit = role === 'CO1' || role === 'Member'

  async function addSlot() {
    if (!addingFor || !newSlotTime) return
    await fetch('/api/interviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intern_name: addingFor.intern, date: addingFor.date, time_slot: newSlotTime }),
    })
    setAddingFor(null)
    await fetchData()
  }

  async function bookSlot(rowIndex: number) {
    const dept = bookingDept[rowIndex]
    if (!dept) return
    const res = await fetch('/api/interviews', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rowIndex, booked_by: dept }),
    })
    if (!res.ok) {
      const d = await res.json()
      alert(d.error || '예약 실패')
      return
    }
    setBookingRow(null)
    await fetchData()
  }

  async function cancelSlot(rowIndex: number) {
    await fetch('/api/interviews', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rowIndex, booked_by: '' }),
    })
    await fetchData()
  }

  async function deleteSlot(rowIndex: number) {
    if (!confirm('슬롯을 삭제하시겠습니까?')) return
    await fetch('/api/interviews', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rowIndex }),
    })
    await fetchData()
  }

  if (status === 'loading' || loading) {
    return (
      <>
        <Nav />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: 'var(--text-muted)', fontSize: '14px' }}>
          불러오는 중...
        </div>
      </>
    )
  }

  // ── 슬롯 카드 ──
  const SlotCard = ({ slot }: { slot: Interview }) => {
    const isBooked = !!slot.booked_by
    const isBookingThis = bookingRow === slot.rowIndex
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
        borderRadius: '8px', flexWrap: 'wrap',
        background: isBooked ? 'rgba(34,197,94,0.06)' : '#fafafa',
        border: `1px solid ${isBooked ? 'rgba(34,197,94,0.25)' : 'var(--border)'}`,
      }}>
        <span style={{ fontWeight: 600, fontSize: '13px', minWidth: '115px', color: 'var(--text-primary)' }}>{slot.time_slot}</span>

        {isBooked && (
          <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, background: 'rgba(34,197,94,0.12)', color: '#15803D', border: '1px solid rgba(34,197,94,0.3)' }}>
            {slot.booked_by}
          </span>
        )}
        {!isBooked && !isBookingThis && (
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>예약 가능</span>
        )}

        {/* 예약 드롭다운 */}
        {canEdit && !isBooked && !isBookingThis && (
          <button
            onClick={() => { setBookingRow(slot.rowIndex); setBookingDept(p => ({ ...p, [slot.rowIndex]: DEPARTMENTS[0] })) }}
            style={{ marginLeft: 'auto', ...btn('book') }}
          >예약</button>
        )}
        {canEdit && isBookingThis && (
          <>
            <select
              value={bookingDept[slot.rowIndex] || DEPARTMENTS[0]}
              onChange={e => setBookingDept(p => ({ ...p, [slot.rowIndex]: e.target.value }))}
              style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', marginLeft: 'auto' }}
            >
              {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <button onClick={() => bookSlot(slot.rowIndex)} style={btn('confirm')}>확인</button>
            <button onClick={() => setBookingRow(null)} style={btn('cancel2')}>취소</button>
          </>
        )}
        {canEdit && (isBooked || (!isBooked && !isBookingThis)) && (
          <div style={{ display: 'flex', gap: '6px', marginLeft: isBooked ? 'auto' : undefined }}>
            {isBooked && <button onClick={() => cancelSlot(slot.rowIndex)} style={btn('cancel')}>예약취소</button>}
            <button onClick={() => deleteSlot(slot.rowIndex)} style={btn('delete')}>삭제</button>
          </div>
        )}
      </div>
    )
  }

  // ── 인턴 뷰 ──
  const InternView = () => {
    const slots = interviews.filter(iv => iv.intern_name === selectedIntern)
    const slotsByDate: Record<string, Interview[]> = {}
    for (const d of WEEK_DATES) {
      slotsByDate[d] = slots.filter(s => s.date === d).sort((a, b) => a.time_slot.localeCompare(b.time_slot))
    }
    const availableDateSlots = addingFor ? (DATE_SLOTS[addingFor.date] || []) : []

    return (
      <div>
        {/* 인턴 탭 */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
          {internNames.map(name => (
            <button key={name} onClick={() => setSelectedIntern(name)} style={{
              padding: '6px 18px', borderRadius: '20px', fontSize: '13px', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
              background: selectedIntern === name ? 'var(--primary)' : '#fff',
              color: selectedIntern === name ? '#fff' : 'var(--text-secondary)',
              border: selectedIntern === name ? 'none' : '1px solid var(--border)',
            }}>{name}</button>
          ))}
          {internNames.length === 0 && (
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>마케팅 인턴이 등록되지 않았습니다</span>
          )}
        </div>

        {selectedIntern && WEEK_DATES.map(dateVal => {
          const daySlots = slotsByDate[dateVal] || []
          const availSlots = DATE_SLOTS[dateVal] || []
          const isAddingHere = addingFor?.intern === selectedIntern && addingFor.date === dateVal

          return (
            <div key={dateVal} style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{dateVal}</h3>
                {availSlots.length === 0 && (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>면담 없는 날</span>
                )}
                {role === 'CO1' && availSlots.length > 0 && (
                  <button
                    onClick={() => { setAddingFor({ intern: selectedIntern, date: dateVal }); setNewSlotTime(availSlots[0]) }}
                    style={{ ...btn('add'), marginLeft: 'auto' }}
                  >+ 슬롯 추가</button>
                )}
              </div>

              {/* 슬롯 추가 폼 */}
              {isAddingHere && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(29,68,144,0.04)', border: '1px solid rgba(29,68,144,0.15)', marginBottom: '8px' }}>
                  <select
                    value={newSlotTime}
                    onChange={e => setNewSlotTime(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit' }}
                  >
                    {availableDateSlots.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button onClick={addSlot} style={btn('confirm')}>저장</button>
                  <button onClick={() => setAddingFor(null)} style={btn('cancel2')}>취소</button>
                </div>
              )}

              {availSlots.length > 0 && daySlots.length === 0 && !isAddingHere && (
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '6px 0' }}>슬롯 없음</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {daySlots.map(s => <SlotCard key={s.rowIndex} slot={s} />)}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ── 리더 뷰 ──
  const LeaderView = () => {
    const deptSlots = interviews
      .filter(iv => iv.booked_by === selectedDept)
      .sort((a, b) => a.date.localeCompare(b.date) || a.time_slot.localeCompare(b.time_slot))
    return (
      <div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
          {DEPARTMENTS.map(dept => (
            <button key={dept} onClick={() => setSelectedDept(dept)} style={{
              padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
              background: selectedDept === dept ? 'var(--primary)' : '#fff',
              color: selectedDept === dept ? '#fff' : 'var(--text-secondary)',
              border: selectedDept === dept ? 'none' : '1px solid var(--border)',
            }}>{dept}</button>
          ))}
        </div>
        {deptSlots.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center', padding: '60px 0' }}>예약된 면담이 없습니다</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-subtle)' }}>
                  {['인턴','날짜','시간',''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deptSlots.map(s => (
                  <tr key={s.rowIndex} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>{s.intern_name}</td>
                    <td style={{ padding: '10px 14px' }}>{s.date}</td>
                    <td style={{ padding: '10px 14px' }}>{s.time_slot}</td>
                    <td style={{ padding: '10px 14px' }}>
                      {canEdit && (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button onClick={() => cancelSlot(s.rowIndex)} style={btn('cancel')}>예약취소</button>
                          <button onClick={() => deleteSlot(s.rowIndex)} style={btn('delete')}>삭제</button>
                        </div>
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
      <main style={{ maxWidth: '860px', margin: '0 auto', padding: '32px 20px' }}>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>면담 신청</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>마케팅 인턴 1:1 면담 슬롯 관리 · 1주차 (6/22~6/26)</p>
        </div>

        {/* 뷰 탭 */}
        <div style={{ display: 'flex', gap: '2px', marginBottom: '28px', background: 'var(--bg-subtle)', padding: '4px', borderRadius: '10px', width: 'fit-content' }}>
          {(['intern', 'leader'] as const).map(m => (
            <button key={m} onClick={() => setViewMode(m)} style={{
              padding: '7px 20px', borderRadius: '7px', fontSize: '13px', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
              background: viewMode === m ? '#fff' : 'transparent',
              color: viewMode === m ? 'var(--primary)' : 'var(--text-muted)',
              border: 'none',
              boxShadow: viewMode === m ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            }}>
              {m === 'intern' ? '마케팅 인턴 뷰' : '팀 리더 뷰'}
            </button>
          ))}
        </div>

        {viewMode === 'intern' ? <InternView /> : <LeaderView />}
      </main>
    </>
  )
}

function btn(type: string): React.CSSProperties {
  const base: React.CSSProperties = { padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none', transition: 'all 0.15s' }
  if (type === 'add')     return { ...base, background: 'rgba(29,68,144,0.08)', color: '#1D4490', border: '1px solid rgba(29,68,144,0.2)' }
  if (type === 'book')    return { ...base, background: 'rgba(29,68,144,0.1)', color: '#1D4490', border: '1px solid rgba(29,68,144,0.2)' }
  if (type === 'confirm') return { ...base, background: 'var(--primary)', color: '#fff' }
  if (type === 'cancel')  return { ...base, background: 'rgba(234,179,8,0.1)', color: '#A16207', border: '1px solid rgba(234,179,8,0.3)' }
  if (type === 'cancel2') return { ...base, background: '#fff', color: 'var(--text-muted)', border: '1px solid var(--border)' }
  if (type === 'delete')  return { ...base, background: 'rgba(239,68,68,0.08)', color: '#DC2626', border: '1px solid rgba(239,68,68,0.2)' }
  return base
}
