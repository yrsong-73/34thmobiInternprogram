'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

const DEPARTMENTS = ['마케팅1팀','마케팅2팀','마케팅3팀','마케팅4팀','마케팅5팀','마케팅6팀','PM','CC']

const WEEK_DATES = [
  { label: '6/22 월', value: '6/22 월' },
  { label: '6/23 화', value: '6/23 화' },
  { label: '6/24 수', value: '6/24 수' },
  { label: '6/25 목', value: '6/25 목' },
  { label: '6/26 금', value: '6/26 금' },
]

const TIME_SLOTS = (() => {
  const slots: string[] = []
  for (let h = 9; h < 18; h++) {
    slots.push(`${String(h).padStart(2,'0')}:00~${String(h).padStart(2,'0')}:30`)
    slots.push(`${String(h).padStart(2,'0')}:30~${String(h+1).padStart(2,'0')}:00`)
  }
  return slots
})()

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

  // 선택된 탭
  const [selectedIntern, setSelectedIntern] = useState<string>('')
  const [selectedDept, setSelectedDept] = useState<string>(DEPARTMENTS[0])

  // 슬롯 추가 (CO1)
  const [addingFor, setAddingFor] = useState<{ intern: string; date: string } | null>(null)
  const [newSlotTime, setNewSlotTime] = useState<string>(TIME_SLOTS[0])

  // 예약 중인 슬롯 상태
  const [bookingRow, setBookingRow] = useState<number | null>(null)
  const [bookingDept, setBookingDept] = useState<Record<number, string>>({})

  const [internNames, setInternNames] = useState<string[]>([])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [ivRes, intRes] = await Promise.all([
        fetch('/api/interviews'),
        fetch('/api/interns'),
      ])
      const ivData = await ivRes.json()
      const intData = await intRes.json()
      const all: Interview[] = ivData.interviews || []
      setInterviews(all)
      const mktInterns = (intData.interns || [])
        .filter((i: any) => i.job === 'marketing')
        .map((i: any) => i.name)
      setInternNames(mktInterns)
      if (!selectedIntern && mktInterns.length > 0) setSelectedIntern(mktInterns[0])
    } finally {
      setLoading(false)
    }
  }, [selectedIntern])

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status === 'loading') return
    if (role === 'Intern') { router.push('/schedule'); return }
    fetchData()
  }, [status, role, router, fetchData])

  async function addSlot() {
    if (!addingFor) return
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
    if (!confirm('슬롯을 삭제하시겠습니까? 예약 정보도 함께 삭제됩니다.')) return
    await fetch('/api/interviews', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rowIndex }),
    })
    await fetchData()
  }

  if (status === 'loading' || loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: 'var(--text-muted)', fontSize: '14px' }}>
        불러오는 중...
      </div>
    )
  }

  const canEdit = role === 'CO1' || role === 'Member'

  // ── 인턴 뷰 ──
  function InternView() {
    const internsForView = internNames
    const slots = interviews.filter(iv => iv.intern_name === selectedIntern)
    const slotsByDate: Record<string, Interview[]> = {}
    for (const d of WEEK_DATES) slotsByDate[d.value] = slots.filter(s => s.date === d.value)

    return (
      <div>
        {/* 인턴 탭 */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {internsForView.map(name => (
            <button
              key={name}
              onClick={() => setSelectedIntern(name)}
              style={{
                padding: '6px 16px', borderRadius: '20px', fontSize: '13px', fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                background: selectedIntern === name ? 'var(--primary)' : '#fff',
                color: selectedIntern === name ? '#fff' : 'var(--text-secondary)',
                border: selectedIntern === name ? 'none' : '1px solid var(--border)',
              }}
            >
              {name}
            </button>
          ))}
        </div>

        {internsForView.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center', padding: '40px' }}>마케팅 인턴이 없습니다</div>
        )}

        {selectedIntern && WEEK_DATES.map(d => {
          const daySlots = slotsByDate[d.value] || []
          daySlots.sort((a, b) => a.time_slot.localeCompare(b.time_slot))
          return (
            <div key={d.value} style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{d.label}</h3>
                {role === 'CO1' && (
                  <button
                    onClick={() => { setAddingFor({ intern: selectedIntern, date: d.value }); setNewSlotTime(TIME_SLOTS[0]) }}
                    style={{
                      padding: '4px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                      cursor: 'pointer', fontFamily: 'inherit',
                      background: 'rgba(29,68,144,0.08)', border: '1px solid rgba(29,68,144,0.2)',
                      color: '#1D4490',
                    }}
                  >
                    + 슬롯 추가
                  </button>
                )}
              </div>

              {/* 슬롯 추가 폼 */}
              {addingFor?.intern === selectedIntern && addingFor.date === d.value && (
                <div style={{
                  background: 'rgba(29,68,144,0.04)', border: '1px solid rgba(29,68,144,0.15)',
                  borderRadius: '8px', padding: '12px', marginBottom: '10px',
                  display: 'flex', alignItems: 'center', gap: '10px',
                }}>
                  <select
                    value={newSlotTime}
                    onChange={e => setNewSlotTime(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit' }}
                  >
                    {TIME_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button onClick={addSlot} style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: 'var(--primary)', color: '#fff', border: 'none' }}>저장</button>
                  <button onClick={() => setAddingFor(null)} style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', background: '#fff', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>취소</button>
                </div>
              )}

              {daySlots.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '8px 0' }}>슬롯 없음</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {daySlots.map(slot => (
                    <SlotRow key={slot.rowIndex} slot={slot} canEdit={canEdit} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // ── 리더 뷰 ──
  function LeaderView() {
    const deptSlots = interviews.filter(iv => iv.booked_by === selectedDept)
    deptSlots.sort((a, b) => {
      const dc = a.date.localeCompare(b.date)
      return dc !== 0 ? dc : a.time_slot.localeCompare(b.time_slot)
    })
    return (
      <div>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {DEPARTMENTS.map(dept => (
            <button
              key={dept}
              onClick={() => setSelectedDept(dept)}
              style={{
                padding: '6px 14px', borderRadius: '20px', fontSize: '13px', fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                background: selectedDept === dept ? 'var(--primary)' : '#fff',
                color: selectedDept === dept ? '#fff' : 'var(--text-secondary)',
                border: selectedDept === dept ? 'none' : '1px solid var(--border)',
              }}
            >
              {dept}
            </button>
          ))}
        </div>
        {deptSlots.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center', padding: '40px' }}>예약된 면담이 없습니다</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-subtle)' }}>
                  {['인턴', '날짜', '시간', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deptSlots.map(slot => (
                  <tr key={slot.rowIndex} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>{slot.intern_name}</td>
                    <td style={{ padding: '10px 14px' }}>{slot.date}</td>
                    <td style={{ padding: '10px 14px' }}>{slot.time_slot}</td>
                    <td style={{ padding: '10px 14px' }}>
                      {canEdit && (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button onClick={() => cancelSlot(slot.rowIndex)} style={btnStyle('cancel')}>취소</button>
                          <button onClick={() => deleteSlot(slot.rowIndex)} style={btnStyle('delete')}>삭제</button>
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

  function SlotRow({ slot, canEdit }: { slot: Interview; canEdit: boolean }) {
    const isBooked = !!slot.booked_by
    const isBookingThis = bookingRow === slot.rowIndex

    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px',
        borderRadius: '8px', background: isBooked ? 'rgba(34,197,94,0.06)' : '#fafafa',
        border: `1px solid ${isBooked ? 'rgba(34,197,94,0.25)' : 'var(--border)'}`,
        flexWrap: 'wrap',
      }}>
        <span style={{ fontWeight: 600, fontSize: '13px', minWidth: '110px', color: 'var(--text-primary)' }}>{slot.time_slot}</span>
        {isBooked ? (
          <span style={{
            padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
            background: 'rgba(34,197,94,0.12)', color: '#15803D', border: '1px solid rgba(34,197,94,0.3)',
          }}>
            {slot.booked_by}
          </span>
        ) : (
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>예약 가능</span>
        )}

        {canEdit && !isBooked && !isBookingThis && (
          <button
            onClick={() => { setBookingRow(slot.rowIndex); setBookingDept(prev => ({ ...prev, [slot.rowIndex]: DEPARTMENTS[0] })) }}
            style={{ ...btnStyle('book'), marginLeft: 'auto' }}
          >
            예약
          </button>
        )}

        {canEdit && isBookingThis && (
          <>
            <select
              value={bookingDept[slot.rowIndex] || DEPARTMENTS[0]}
              onChange={e => setBookingDept(prev => ({ ...prev, [slot.rowIndex]: e.target.value }))}
              style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px', fontFamily: 'inherit', marginLeft: 'auto' }}
            >
              {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <button onClick={() => bookSlot(slot.rowIndex)} style={btnStyle('confirm')}>확인</button>
            <button onClick={() => setBookingRow(null)} style={btnStyle('cancel2')}>취소</button>
          </>
        )}

        {canEdit && isBooked && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
            <button onClick={() => cancelSlot(slot.rowIndex)} style={btnStyle('cancel')}>취소</button>
            <button onClick={() => deleteSlot(slot.rowIndex)} style={btnStyle('delete')}>삭제</button>
          </div>
        )}

        {canEdit && !isBooked && !isBookingThis && (
          <button onClick={() => deleteSlot(slot.rowIndex)} style={btnStyle('delete')}>삭제</button>
        )}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', padding: '32px 20px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>면담 신청</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>마케팅 인턴 1:1 면담 슬롯 관리 · 1주차 (6/22~6/26)</p>
      </div>

      {/* 뷰 탭 */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '28px', background: 'var(--bg-subtle)', padding: '4px', borderRadius: '10px', width: 'fit-content' }}>
        {(['intern', 'leader'] as const).map(m => (
          <button
            key={m}
            onClick={() => setViewMode(m)}
            style={{
              padding: '7px 20px', borderRadius: '7px', fontSize: '13px', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
              background: viewMode === m ? '#fff' : 'transparent',
              color: viewMode === m ? 'var(--primary)' : 'var(--text-muted)',
              border: 'none',
              boxShadow: viewMode === m ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            {m === 'intern' ? '마케팅 인턴 뷰' : '팀 리더 뷰'}
          </button>
        ))}
      </div>

      {viewMode === 'intern' ? <InternView /> : <LeaderView />}
    </div>
  )
}

function btnStyle(type: string): React.CSSProperties {
  const base: React.CSSProperties = { padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', border: 'none' }
  if (type === 'book')    return { ...base, background: 'rgba(29,68,144,0.1)', color: '#1D4490', border: '1px solid rgba(29,68,144,0.2)' }
  if (type === 'confirm') return { ...base, background: 'var(--primary)', color: '#fff' }
  if (type === 'cancel')  return { ...base, background: 'rgba(234,179,8,0.1)', color: '#A16207', border: '1px solid rgba(234,179,8,0.3)' }
  if (type === 'cancel2') return { ...base, background: '#fff', color: 'var(--text-muted)', border: '1px solid var(--border)' }
  if (type === 'delete')  return { ...base, background: 'rgba(239,68,68,0.08)', color: '#DC2626', border: '1px solid rgba(239,68,68,0.2)' }
  return base
}
