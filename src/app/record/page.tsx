'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Nav from '@/components/Nav'
import type { Record as InternRecord } from '@/types'

function showToast(msg: string) {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = msg
  el.classList.add('show')
  setTimeout(() => el.classList.remove('show'), 2200)
}


const JOB_COLOR: Record<string, string> = {
  marketing:    '#FF6B2B',
  marketing_pm: '#FF8C42',
  aiax:         '#3B82F6',
  biz:          '#8B5CF6',
}

const DATE_FILTERS = [
  { key: 'all',   label: '전체' },
  { key: 'week',  label: '이번 주' },
  { key: 'month', label: '이번 달' },
]

function isThisWeek(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  const day = now.getDay() || 7
  const mon = new Date(now)
  mon.setDate(now.getDate() - day + 1)
  mon.setHours(0, 0, 0, 0)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  sun.setHours(23, 59, 59, 999)
  return d >= mon && d <= sun
}

function isThisMonth(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

export default function RecordPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const role     = (session?.user as any)?.role as string | undefined
  const userName = (session?.user as any)?.userName as string || ''
  const isCO1    = role === 'CO1'

  const [internsList, setInternsList]   = useState<{ name: string; job: string; type: string }[]>([])
  const [internsData, setInternsData]   = useState<{ name: string; rowIndex: number; summary: string }[]>([])
  const [records, setRecords]           = useState<InternRecord[]>([])
  const [loading, setLoading]           = useState(true)
  const [saving, setSaving]             = useState(false)
  const [internSummaries, setInternSummaries] = useState<Record<string, string>>({})
  const [savingSum, setSavingSum]       = useState<Record<string, boolean>>({})
  const [aiLoading, setAiLoading]       = useState<Record<string, boolean>>({})
  // 작성자 뷰 (기본: 본인)
  const [viewAuthor, setViewAuthor]     = useState('')
  // 새 기록 초안 { 인턴명: 내용 }
  const [drafts, setDrafts]             = useState<Record<string, string>>({})
  // 기록 조회 필터
  const [viewIntern, setViewIntern]     = useState('all')
  const [viewDate, setViewDate]         = useState('all')
  const [viewByAuthor, setViewByAuthor] = useState('all')

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login')
    if (status === 'authenticated' && role !== 'CO1') router.replace('/schedule')
  }, [status, role, router])

  useEffect(() => {
    if (userName && !viewAuthor) setViewAuthor(userName)
  }, [userName])

  async function fetchAll() {
    setLoading(true)
    const [recordsRes, internsRes] = await Promise.all([
      fetch('/api/records'),
      fetch('/api/interns'),
    ])
    if (recordsRes.ok) {
      const data = await recordsRes.json()
      setRecords(data.records ?? [])
    }
    if (internsRes.ok) {
      const data = await internsRes.json()
      const interns = data.interns ?? []
      setInternsList(interns.map((i: any) => ({ name: i.name, job: i.job, type: i.type })))
      setInternsData(interns.map((i: any) => ({ name: i.name, rowIndex: i.rowIndex, summary: i.summary ?? '' })))
      const sumMap: Record<string, string> = {}
      interns.forEach((i: any) => { sumMap[i.name] = i.summary ?? '' })
      setInternSummaries(sumMap)
    }
    setLoading(false)
  }
  useEffect(() => {
    if (status === 'authenticated' && role === 'CO1') fetchAll()
  }, [status, role])

  // 작성자 목록
  const authorList = [...new Set([
    userName,
    ...records.map(r => r.author).filter(Boolean),
  ])].filter(Boolean).sort()

  // 기존 기록 (특정 인턴 + 작성자)
  function getPrevRecords(internName: string, author: string): InternRecord[] {
    return records
      .filter(r => r.intern === internName && r.author === author)
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  // 전체 저장
  async function saveAll() {
    const entries = Object.entries(drafts).filter(([_, v]) => v.trim())
    if (entries.length === 0) { showToast('⚠️ 작성된 내용이 없습니다'); return }
    setSaving(true)
    const today = new Date().toISOString().split('T')[0]
    let success = 0
    for (const [internName, content] of entries) {
      const res = await fetch('/api/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intern: internName, author: userName, date: today, content: content.trim() }),
      })
      if (res.ok) success++
    }
    if (success > 0) {
      showToast(`✅ ${success}건 저장되었습니다`)
      setDrafts({})
      await fetchAll()
    } else {
      showToast('❌ 저장 실패. 다시 시도해주세요.')
    }
    setSaving(false)
  }

  async function saveSummary(internName: string) {
    const intern = internsData.find(i => i.name === internName)
    if (!intern?.rowIndex) return
    setSavingSum(p => ({ ...p, [internName]: true }))
    await fetch('/api/interns', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rowIndex: intern.rowIndex, summary: internSummaries[internName] ?? '' }),
    })
    showToast('✅ 요약이 저장됐습니다')
    setSavingSum(p => ({ ...p, [internName]: false }))
  }

  async function generateAiSummary(internName: string) {
    const recs = records.filter(r => r.intern === internName)
    if (recs.length === 0) { showToast('⚠️ 기록이 없어 요약할 내용이 없습니다'); return }
    setAiLoading(p => ({ ...p, [internName]: true }))
    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internName, records: recs.map(r => ({ date: r.date, author: r.author, content: r.content })) }),
      })
      if (res.ok) {
        const data = await res.json()
        const cleaned = (data.summary ?? '')
          .split('\n')
          .filter((line: string) => !line.trimStart().startsWith('#'))
          .join('\n')
          .trimStart()
        setInternSummaries(p => ({ ...p, [internName]: cleaned }))
        showToast('✨ AI 요약이 완성됐습니다')
      } else {
        showToast('❌ AI 요약 실패. ANTHROPIC_API_KEY를 확인해주세요.')
      }
    } catch {
      showToast('❌ AI 요약 중 오류가 발생했습니다')
    }
    setAiLoading(p => ({ ...p, [internName]: false }))
  }

  async function deleteRecord(r: InternRecord) {
    if (r.rowIndex == null) return
    if (!confirm(`"${r.intern}" 기록을 삭제할까요?`)) return
    const res = await fetch('/api/records', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rowIndex: r.rowIndex }),
    })
    if (res.ok) { showToast('🗑️ 기록이 삭제되었습니다'); await fetchAll() }
    else showToast('❌ 삭제 실패')
  }

  // ── 기록 조회 섹션 필터 ──
  const filteredRecords = records.filter(r => {
    if (viewIntern !== 'all' && r.intern !== viewIntern) return false
    if (viewDate === 'week'  && !isThisWeek(r.date))    return false
    if (viewDate === 'month' && !isThisMonth(r.date))   return false
    if (viewByAuthor !== 'all' && r.author !== viewByAuthor) return false
    return true
  })

  // 인턴별 그룹화 (internsList 순서 유지)
  const grouped = internsList.reduce<Record<string, InternRecord[]>>((acc, intern) => {
    const recs = filteredRecords
      .filter(r => r.intern === intern.name)
      .sort((a, b) => b.date.localeCompare(a.date))
    if (recs.length > 0 || viewIntern === intern.name) acc[intern.name] = recs
    return acc
  }, {})

  const hasDrafts = Object.values(drafts).some(v => v.trim())

  if (status === 'loading' || loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{
          width: '32px', height: '32px',
          border: '3px solid var(--border)', borderTopColor: 'var(--mobi-orange)',
          borderRadius: '50%', animation: 'spin 0.8s linear infinite',
          margin: '0 auto 12px',
        }} />
        불러오는 중...
      </div>
    </div>
  )

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <Nav />
      <main style={{ padding: '32px', maxWidth: '1400px', margin: '0 auto' }}>

        {/* 헤더 */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.5px', marginBottom: '6px' }}>📋 인턴 기록표</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13.5px' }}>인턴 관찰 기록을 작성하고 확인합니다</p>
        </div>

        {/* ── 작성 영역 ── */}
        {/* 작성자 선택 바 */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '16px 20px',
          marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '14px',
        }}>
          <span style={{ fontSize: '14px', fontWeight: 700, whiteSpace: 'nowrap' }}>🔥 작성자 선택</span>
          <select
            value={viewAuthor}
            onChange={e => setViewAuthor(e.target.value)}
            style={selectStyle}
          >
            {authorList.length > 0
              ? authorList.map(a => <option key={a} value={a}>{a}</option>)
              : <option value={userName}>{userName || '—'}</option>
            }
          </select>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            작성자를 선택하면 인턴별 기록란이 펼쳐집니다.
          </span>
        </div>

        {/* 인턴 카드 그리드 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}>
          {internsList.map(intern => {
            const prevRecs  = getPrevRecords(intern.name, viewAuthor)
            const jobColor  = JOB_COLOR[intern.type] || '#FF6B2B'
            const draftVal  = drafts[intern.name] || ''
            const isMyIntern = viewAuthor === userName

            return (
              <div
                key={intern.name}
                className="card"
                style={{ padding: '16px 18px', borderTop: `3px solid ${jobColor}`, display: 'flex', flexDirection: 'column', gap: '10px' }}
              >
                {/* 카드 헤더 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '14px', color: 'var(--mobi-orange)' }}>👤</span>
                  <span style={{ fontWeight: 700, fontSize: '15px' }}>{intern.name}</span>
                  <span style={{
                    fontSize: '10.5px', fontWeight: 700, color: jobColor,
                    background: jobColor + '18', padding: '2px 8px', borderRadius: '20px',
                  }}>{intern.job}</span>
                </div>

                {/* 기존 기록 */}
                {prevRecs.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {prevRecs.map((r, i) => (
                      <div key={i} style={{ background: 'var(--bg-main)', borderRadius: '6px', padding: '8px 10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{r.date}</span>
                          {isCO1 && (
                            <button
                              onClick={() => deleteRecord(r)}
                              style={{ background: 'none', border: 'none', fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}
                              onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                              title="삭제">✕</button>
                          )}
                        </div>
                        <p style={{ fontSize: '12.5px', color: 'var(--text-primary)', lineHeight: 1.65, margin: 0, whiteSpace: 'pre-wrap' }}>{r.content}</p>
                      </div>
                    ))}
                    <div style={{ borderTop: '1px dashed var(--border)', margin: '2px 0' }} />
                  </div>
                )}

                {/* 새 기록 입력 */}
                <textarea
                  value={draftVal}
                  onChange={e => isMyIntern
                    ? setDrafts(prev => ({ ...prev, [intern.name]: e.target.value }))
                    : undefined
                  }
                  readOnly={!isMyIntern}
                  placeholder={isMyIntern
                    ? `${intern.name}에 대한 기록 (교육 태도, 면담 내용, 특이사항 등)...`
                    : '본인 작성자 탭에서 입력하세요'
                  }
                  rows={4}
                  style={{
                    width: '100%', padding: '9px 10px',
                    border: `1px solid ${draftVal.trim() ? 'var(--mobi-orange)' : 'var(--border)'}`,
                    borderRadius: '8px', fontSize: '12.5px', fontFamily: 'inherit',
                    background: isMyIntern ? '#fff' : '#F8F7F4',
                    color: isMyIntern ? 'var(--text-primary)' : 'var(--text-muted)',
                    resize: 'vertical', lineHeight: 1.65,
                    boxSizing: 'border-box', outline: 'none', transition: 'border-color 0.15s',
                  }}
                  onFocus={e => { if (isMyIntern) e.target.style.boxShadow = '0 0 0 2px rgba(255,107,43,0.15)' }}
                  onBlur={e => { e.target.style.boxShadow = 'none' }}
                />
              </div>
            )
          })}
        </div>

        {/* 전체 저장 */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <button
            onClick={saveAll}
            disabled={saving || !hasDrafts}
            style={{
              padding: '14px 40px', borderRadius: '12px', border: 'none',
              background: hasDrafts ? 'var(--mobi-orange)' : '#D1CFC8',
              color: '#fff', fontSize: '15px', fontWeight: 700,
              cursor: saving || !hasDrafts ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', opacity: saving ? 0.7 : 1, transition: 'background 0.2s',
            }}>
            🔒 {saving ? '저장 중...' : '전체 저장'}
          </button>
        </div>

        {/* ── 기록 조회 섹션 ── */}
        <div style={{ borderTop: '2px solid var(--border)', paddingTop: '32px' }}>
          <h2 style={{ fontSize: '17px', fontWeight: 700, marginBottom: '16px' }}>🔍 기록 조회</h2>

          {/* 조회 필터 */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap' }}>
            {/* 인턴 필터 */}
            <select
              value={viewIntern}
              onChange={e => setViewIntern(e.target.value)}
              style={{ ...selectStyle, minWidth: '130px' }}>
              <option value="all">전체 인턴</option>
              {internsList.map(i => (
                <option key={i.name} value={i.name}>
                  {i.name} ({records.filter(r => r.intern === i.name).length})
                </option>
              ))}
            </select>

            {/* 날짜 필터 */}
            <div style={{ display: 'flex', gap: '6px' }}>
              {DATE_FILTERS.map(f => (
                <button key={f.key} onClick={() => setViewDate(f.key)}
                  style={{
                    padding: '7px 14px', borderRadius: '20px',
                    border: `1.5px solid ${viewDate === f.key ? 'var(--mobi-dark)' : 'var(--border-strong)'}`,
                    background: viewDate === f.key ? 'var(--mobi-dark)' : '#fff',
                    color: viewDate === f.key ? '#fff' : 'var(--text-secondary)',
                    fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                  }}>
                  {f.label}
                </button>
              ))}
            </div>

            {/* 작성자 필터 */}
            {authorList.length > 1 && (
              <select
                value={viewByAuthor}
                onChange={e => setViewByAuthor(e.target.value)}
                style={{ ...selectStyle, minWidth: '120px' }}>
                <option value="all">작성자 전체</option>
                {authorList.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            )}

            <span style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
              {filteredRecords.length}건
            </span>
          </div>

          {/* 기록 목록 (인턴별 그룹) */}
          {filteredRecords.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)', background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '32px', opacity: 0.4, marginBottom: '10px' }}>📝</div>
              아직 작성된 기록이 없습니다
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {Object.entries(grouped).map(([internName, recs]) => {
                if (recs.length === 0) return null
                const internInfo = internsList.find(i => i.name === internName)
                const jobColor   = JOB_COLOR[internInfo?.type || 'marketing'] || '#FF6B2B'
                return (
                  <div key={internName}>
                    {/* 섹션 헤더 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                      <span style={{ color: 'var(--mobi-orange)', fontSize: '14px' }}>👤</span>
                      <span style={{ fontWeight: 700, fontSize: '14px' }}>{internName}</span>
                      <span style={{ fontSize: '10.5px', fontWeight: 700, color: jobColor, background: jobColor + '18', padding: '2px 8px', borderRadius: '20px' }}>
                        {internInfo?.job}
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', background: '#F8F7F4', padding: '1px 8px', borderRadius: '20px' }}>
                        {recs.length}건
                      </span>
                    </div>

                    {/* 인턴 요약 입력 */}
                    <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '10px', padding: '12px 14px', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#92400E' }}>📝 인턴 요약</span>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={() => generateAiSummary(internName)}
                            disabled={!!aiLoading[internName]}
                            style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '6px', border: '1px solid #C084FC', background: aiLoading[internName] ? '#F3E8FF' : '#FAF5FF', color: '#7C3AED', cursor: aiLoading[internName] ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                            {aiLoading[internName] ? '⏳ 요약 중...' : '✨ AI 요약'}
                          </button>
                          <button
                            onClick={() => saveSummary(internName)}
                            disabled={!!savingSum[internName]}
                            style={{ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '6px', border: 'none', background: savingSum[internName] ? '#FDE68A' : '#F59E0B', color: '#fff', cursor: savingSum[internName] ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                            {savingSum[internName] ? '저장 중...' : '저장'}
                          </button>
                        </div>
                      </div>
                      <textarea
                        value={internSummaries[internName] ?? ''}
                        onChange={e => setInternSummaries(p => ({ ...p, [internName]: e.target.value }))}
                        rows={3}
                        placeholder="인턴에 대한 종합 요약을 입력하세요..."
                        style={{ width: '100%', border: '1px solid #FDE68A', borderRadius: '6px', padding: '8px 10px', fontSize: '12.5px', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', background: '#fff' }}
                      />
                    </div>

                    {/* 기록 카드 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {recs.map((r, i) => (
                        <div key={i} className="card" style={{ padding: '14px 18px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span style={{ fontWeight: 700, fontSize: '12.5px', color: 'var(--mobi-orange)' }}>{r.author}</span>
                              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{r.date}</span>
                            </div>
                            {isCO1 && (
                              <button
                                onClick={() => deleteRecord(r)}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '13px', padding: '2px 6px', borderRadius: '4px', fontFamily: 'inherit' }}
                                onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                                title="삭제">✕</button>
                            )}
                          </div>
                          <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0, background: 'var(--bg-main)', padding: '10px 12px', borderRadius: '6px' }}>{r.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </>
  )
}

const selectStyle: React.CSSProperties = {
  padding: '8px 12px', border: '1px solid var(--border)',
  borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit',
  background: '#fff', color: 'var(--text-primary)', cursor: 'pointer',
}
