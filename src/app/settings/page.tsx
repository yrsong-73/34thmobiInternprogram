'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Nav from '@/components/Nav'
import type { UserPermission, UserRole, Cohort, AppSettings } from '@/types'

function showToast(msg: string) {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = msg
  el.classList.add('show')
  setTimeout(() => el.classList.remove('show'), 2200)
}

const ROLE_STYLE: Record<UserRole, { bg: string; border: string; color: string }> = {
  CO1:    { bg: 'rgba(255,107,43,0.12)', border: 'rgba(255,107,43,0.35)', color: '#FF6B2B' },
  Member: { bg: 'rgba(59,130,246,0.10)', border: 'rgba(59,130,246,0.3)', color: '#3B82F6' },
  Intern: { bg: 'rgba(139,92,246,0.10)', border: 'rgba(139,92,246,0.3)', color: '#8B5CF6' },
}
const ROLES: UserRole[] = ['CO1', 'Member', 'Intern']

export default function SettingsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const role = (session?.user as any)?.role as string | undefined

  const [users, setUsers]         = useState<UserPermission[]>([])
  const [loading, setLoading]     = useState(true)
  const [showAdd, setShowAdd]     = useState(false)
  const [newEmail, setNewEmail]   = useState('')
  const [newName, setNewName]     = useState('')
  const [newRole, setNewRole]     = useState<UserRole>('Intern')
  const [submitting, setSubmitting] = useState(false)

  const [cohorts, setCohorts]           = useState<Cohort[]>([])
  const [showCohortPanel, setShowCohortPanel] = useState(false)
  const [showAddCohort, setShowAddCohort] = useState(false)
  const [newBatch, setNewBatch]         = useState('')
  const [newBatchLabel, setNewBatchLabel] = useState('')
  const [newSheetId, setNewSheetId]     = useState('')
  const [cohortSubmitting, setCohortSubmitting] = useState(false)

  const [showReschedulePanel, setShowReschedulePanel] = useState(false)
  const [newStartDate, setNewStartDate]   = useState('')
  const [rescheduling, setRescheduling]   = useState(false)

  const [settings, setSettings] = useState<AppSettings | null>(null)

  const [showCopyTrackPanel, setShowCopyTrackPanel] = useState(false)
  const [copyingTrack, setCopyingTrack] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login')
    if (status === 'authenticated' && role !== 'CO1') router.replace('/schedule')
  }, [status, role, router])

  async function fetchUsers() {
    const res = await fetch('/api/admin/users')
    if (res.ok) { const { users } = await res.json(); setUsers(users ?? []) }
    setLoading(false)
  }
  useEffect(() => { if (status === 'authenticated' && role === 'CO1') fetchUsers() }, [status, role])

  useEffect(() => {
    if (status !== 'authenticated' || role !== 'CO1') return
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => setSettings(data.settings ?? null))
      .catch(() => {})
  }, [status, role])

  async function fetchCohorts() {
    const res = await fetch('/api/cohorts')
    if (res.ok) { const { cohorts } = await res.json(); setCohorts(cohorts ?? []) }
  }
  useEffect(() => { if (status === 'authenticated' && role === 'CO1') fetchCohorts() }, [status, role])

  async function addCohort() {
    if (!newBatch.trim() || !newSheetId.trim()) { showToast('⚠️ 기수 번호와 스프레드시트 ID를 입력해주세요'); return }
    setCohortSubmitting(true)
    const res = await fetch('/api/cohorts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batch: newBatch.trim(), label: newBatchLabel.trim(), sheetId: newSheetId.trim() }),
    })
    if (res.ok) {
      showToast(`✅ ${newBatch}기 등록됨`)
      setNewBatch(''); setNewBatchLabel(''); setNewSheetId(''); setShowAddCohort(false)
      await fetchCohorts()
    } else showToast('❌ 등록 실패')
    setCohortSubmitting(false)
  }

  async function switchActiveCohort(cohort: Cohort) {
    if (cohort.isActive) return
    if (!confirm(`활성 기수를 ${cohort.label}(으)로 전환할까요?\n전환 시 대시보드·기록·시간표·과제제출 등 모든 데이터가 이 기수의 스프레드시트 기준으로 바뀝니다.`)) return
    const res = await fetch('/api/cohorts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batch: cohort.batch }),
    })
    if (res.ok) {
      showToast(`✅ ${cohort.label}(으)로 전환됨`)
      await fetchCohorts()
    } else showToast('❌ 전환 실패')
  }

  async function handleReschedule() {
    if (!newStartDate) { showToast('⚠️ 시작일을 입력해주세요'); return }
    if (!confirm(`시작일을 ${newStartDate}로 두고 현재 활성 기수의 시간표 전체 날짜를 다시 계산할까요?\n(day_label의 "N일차" 기준으로 date_label만 새로 계산됩니다. 강의명·시간·링크 등은 그대로 유지됩니다.)`)) return
    setRescheduling(true)
    try {
      const res = await fetch('/api/schedule/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: newStartDate }),
      })
      const result = await res.json().catch(() => null)
      if (res.ok) {
        let msg = `✅ ${result?.updated ?? 0}개 강의 날짜 재배치 완료`
        if (result?.skipped > 0) msg += ` (day_label 파싱 실패 ${result.skipped}건 제외)`
        showToast(msg)
      } else {
        showToast(`❌ 재배치 실패: ${result?.error ?? '알 수 없는 오류'}`)
      }
    } catch {
      showToast('❌ 재배치 실패')
    }
    setRescheduling(false)
  }

  async function handleCopyBizToCC() {
    if (!confirm('사업기획·전략 전용 강의를 그대로 복제해서 CC 전용 강의로 만들까요?\n(전체 공통 강의는 이미 CC에도 적용되므로 복제 대상이 아닙니다. 복제 후 CC 시간표에서 내용을 따로 수정할 수 있습니다.)')) return
    setCopyingTrack(true)
    try {
      const res = await fetch('/api/schedule/copy-job-track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromJob: 'biz', toJob: 'cc' }),
      })
      const result = await res.json().catch(() => null)
      if (res.ok) {
        showToast(`✅ CC 강의 ${result?.created ?? 0}개 생성 완료`)
      } else {
        showToast(`❌ 복사 실패: ${result?.error ?? '알 수 없는 오류'}`)
      }
    } catch {
      showToast('❌ 복사 실패')
    }
    setCopyingTrack(false)
  }

  async function changeRole(user: UserPermission, newRoleVal: UserRole) {
    const res = await fetch('/api/admin/users', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rowIndex: user.rowIndex, email: user.email, name: user.name, role: newRoleVal }),
    })
    if (res.ok) { showToast(`✅ ${user.name} → ${newRoleVal} 변경됨`); await fetchUsers() }
    else showToast('❌ 변경 실패')
  }

  async function removeUser(user: UserPermission) {
    if (!confirm(`${user.name}(${user.email})을 삭제할까요?`)) return
    const res = await fetch('/api/admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rowIndex: user.rowIndex }),
    })
    if (res.ok) { showToast(`🗑️ ${user.name} 삭제됨`); await fetchUsers() }
    else showToast('❌ 삭제 실패')
  }

  async function addUser() {
    if (!newEmail.trim()) { showToast('⚠️ 이메일을 입력해주세요'); return }
    setSubmitting(true)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: newEmail.trim(), name: newName.trim(), role: newRole }),
    })
    if (res.ok) {
      showToast(`✅ ${newName || newEmail} 추가됨 (${newRole})`)
      setNewEmail(''); setNewName(''); setNewRole('Intern'); setShowAdd(false)
      await fetchUsers()
    } else showToast('❌ 추가 실패')
    setSubmitting(false)
  }

  if (status === 'loading' || loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'var(--text-muted)' }}>불러오는 중...</div>
    </div>
  )

  const grouped = ROLES.reduce((acc, r) => {
    acc[r] = users.filter(u => u.role === r)
    return acc
  }, {} as Record<UserRole, UserPermission[]>)

  return (
    <>
      <Nav />
      <main style={{ padding: '32px', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.5px', marginBottom: '6px' }}>⚙️ 관리시트 & 권한관리</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13.5px' }}>
              Google 계정으로 로그인하는 사용자의 역할을 관리합니다
            </p>
          </div>
          <button onClick={() => setShowAdd(p => !p)}
            style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '10px 18px', borderRadius: '10px', border: 'none', background: 'var(--mobi-orange)', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            <i className="fa-solid fa-plus" /> 사용자 추가
          </button>
        </div>

        {/* 관리 시트 링크 — CO1 전용 */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '20px 24px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '14px' }}>📊 관리 시트</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {(settings ? [
              { label: settings.mgmt_link_1_label, href: settings.mgmt_link_1_url },
              { label: settings.mgmt_link_2_label, href: settings.mgmt_link_2_url },
              { label: settings.mgmt_link_3_label, href: settings.mgmt_link_3_url },
              { label: settings.mgmt_link_4_label, href: settings.mgmt_link_4_url },
              { label: settings.mgmt_link_5_label, href: settings.mgmt_link_5_url },
            ] : []).filter(l => l.label && l.href).map(({ label, href }) => (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer" style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 14px', borderRadius: '8px',
                background: 'rgba(29,68,144,0.05)', border: '1px solid rgba(29,68,144,0.15)',
                color: '#1D4490', fontSize: '13.5px', fontWeight: 600, textDecoration: 'none',
                transition: 'all 0.15s',
              }}>
                <i className="fa-brands fa-google-drive" style={{ fontSize: '14px' }} />
                {label}
                <i className="fa-solid fa-arrow-up-right-from-square" style={{ fontSize: '10px', opacity: 0.6, marginLeft: 'auto' }} />
              </a>
            ))}
          </div>
        </div>

        {/* 역할 설명 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', marginBottom: '24px' }}>
          {ROLES.map(r => {
            const s = ROLE_STYLE[r]
            const desc = r === 'CO1' ? '담당자 · 모든 기능 사용 가능 (수정·삭제 포함)' : r === 'Member' ? '직원 참관 · 시간표·대시보드·기록 열람 가능' : '인턴 · 시간표·영상 뷰어만 접근 가능'
            return (
              <div key={r} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: '10px', padding: '14px 16px' }}>
                <div style={{ fontWeight: 700, color: s.color, marginBottom: '5px', fontSize: '14px' }}>{r}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{desc}</div>
                <div style={{ marginTop: '8px', fontWeight: 700, fontSize: '18px', color: s.color }}>{grouped[r]?.length ?? 0}명</div>
              </div>
            )
          })}
        </div>

        {/* 사용자 추가 폼 */}
        {showAdd && (
          <div className="card" style={{ padding: '20px 24px', marginBottom: '20px', border: '2px solid var(--mobi-orange-border)' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '16px', color: 'var(--mobi-orange)' }}>➕ 새 사용자 추가</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr auto', gap: '10px', alignItems: 'end' }}>
              <div>
                <label style={labelStyle}>이메일 (Google 계정) *</label>
                <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="example@mobidays.com"
                  style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>이름</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="홍길동"
                  style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>역할</label>
                <select value={newRole} onChange={e => setNewRole(e.target.value as UserRole)} style={inputStyle}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <button onClick={addUser} disabled={submitting}
                style={{ padding: '9px 18px', borderRadius: '8px', border: 'none', background: 'var(--mobi-orange)', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: submitting ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: submitting ? 0.7 : 1 }}>
                추가
              </button>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '10px' }}>
              ⚠️ 이메일은 반드시 Google 계정 이메일을 입력해야 로그인 가능합니다
            </p>
          </div>
        )}

        {/* 사용자 목록 */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: '#FAFAF8' }}>
                <th style={thStyle}>이름</th>
                <th style={thStyle}>이메일</th>
                <th style={thStyle}>역할 변경</th>
                <th style={thStyle}>등록일</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>등록된 사용자가 없습니다</td></tr>
              ) : (
                users.map(user => {
                  const s = ROLE_STYLE[user.role]
                  return (
                    <tr key={user.rowIndex} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: s.bg, border: `1px solid ${s.border}`, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px', flexShrink: 0 }}>
                            {user.name ? user.name[0] : '?'}
                          </div>
                          <span style={{ fontWeight: 600 }}>{user.name || '—'}</span>
                        </div>
                      </td>
                      <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: '13px' }}>{user.email}</td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: '5px' }}>
                          {ROLES.map(r => (
                            <button key={r} onClick={() => changeRole(user, r)}
                              style={{ padding: '4px 12px', borderRadius: '20px', border: `1.5px solid ${user.role === r ? ROLE_STYLE[r].border : 'var(--border-strong)'}`, background: user.role === r ? ROLE_STYLE[r].bg : '#fff', color: user.role === r ? ROLE_STYLE[r].color : 'var(--text-muted)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
                              {r}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td style={{ ...tdStyle, color: 'var(--text-muted)', fontSize: '12px' }}>
                        {user.created_at ? user.created_at.split('T')[0] : '—'}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <button onClick={() => removeUser(user)}
                          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: 'var(--exam-color)', cursor: 'pointer', fontFamily: 'inherit' }}>
                          삭제
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: '16px', padding: '14px 16px', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '10px', fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          💡 <strong>로그인 방식:</strong> 링크에 접속하면 Google 계정으로 로그인합니다.<br />
          이 목록에 등록된 이메일만 로그인 가능하고, 역할에 따라 볼 수 있는 메뉴가 달라집니다.<br />
          인턴을 추가하려면 인턴의 Google 이메일 주소를 확인 후 역할 <strong>Intern</strong>으로 등록하세요.
        </div>

        {/* 기수 관리 — CO1 전용, 최초 세팅 후엔 잘 안 건드리는 영역이라 하단에 접어둠 */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '20px 24px', marginTop: '24px' }}>
          <div
            onClick={() => setShowCohortPanel(p => !p)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          >
            <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>🎓 기수 관리</h2>
            <i className={`fa-solid ${showCohortPanel ? 'fa-chevron-up' : 'fa-chevron-down'}`} style={{ fontSize: '13px', color: 'var(--text-muted)' }} />
          </div>

          {showCohortPanel && (
            <div style={{ marginTop: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
                <button onClick={() => setShowAddCohort(p => !p)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '8px', border: '1px solid var(--border-strong)', background: '#fff', color: 'var(--text-secondary)', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  <i className="fa-solid fa-plus" /> 새 기수 추가
                </button>
              </div>

              {showAddCohort && (
                <div style={{ padding: '16px', marginBottom: '16px', borderRadius: '10px', border: '2px solid var(--mobi-orange-border)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr auto', gap: '10px', alignItems: 'end' }}>
                    <div>
                      <label style={labelStyle}>기수 번호 *</label>
                      <input value={newBatch} onChange={e => setNewBatch(e.target.value)} placeholder="35" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>표시 이름</label>
                      <input value={newBatchLabel} onChange={e => setNewBatchLabel(e.target.value)} placeholder="35기 (미입력 시 자동)" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>스프레드시트 ID 또는 URL *</label>
                      <input value={newSheetId} onChange={e => setNewSheetId(e.target.value)} placeholder="구글 시트 URL 전체를 붙여넣어도 됩니다" style={inputStyle} />
                    </div>
                    <button onClick={addCohort} disabled={cohortSubmitting}
                      style={{ padding: '9px 18px', borderRadius: '8px', border: 'none', background: 'var(--mobi-orange)', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: cohortSubmitting ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: cohortSubmitting ? 0.7 : 1 }}>
                      등록
                    </button>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '10px' }}>
                    ⚠️ 기존 기수 스프레드시트를 구글 시트에서 "사본 만들기"로 복제한 뒤, 서비스 계정과 공유하고 그 시트의 ID/URL을 입력하세요.
                  </p>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {cohorts.length === 0 ? (
                  <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>등록된 기수가 없습니다</div>
                ) : (
                  cohorts.map(cohort => (
                    <div key={cohort.batch} style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '10px 14px', borderRadius: '8px',
                      background: cohort.isActive ? 'rgba(255,107,43,0.06)' : 'rgba(0,0,0,0.02)',
                      border: `1px solid ${cohort.isActive ? 'var(--mobi-orange-border)' : 'var(--border)'}`,
                    }}>
                      <span style={{
                        fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px',
                        background: cohort.isActive ? 'var(--mobi-orange)' : 'var(--border)',
                        color: cohort.isActive ? '#fff' : 'var(--text-muted)',
                      }}>
                        {cohort.isActive ? '활성' : '비활성'}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: '14px' }}>{cohort.label}</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{cohort.sheetId}</span>
                      <button onClick={() => switchActiveCohort(cohort)} disabled={cohort.isActive}
                        style={{
                          marginLeft: 'auto', padding: '6px 14px', borderRadius: '8px',
                          border: '1px solid var(--border-strong)', background: cohort.isActive ? 'transparent' : '#fff',
                          color: cohort.isActive ? 'var(--text-muted)' : 'var(--text-primary)',
                          fontSize: '12px', fontWeight: 700, fontFamily: 'inherit',
                          cursor: cohort.isActive ? 'default' : 'pointer',
                        }}>
                        {cohort.isActive ? '사용 중' : '이 기수로 전환'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* 시간표 일정 재배치 — CO1 전용, 기수 시작할 때만 한 번 쓰는 영역이라 접어둠 */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '20px 24px', marginTop: '24px' }}>
          <div
            onClick={() => setShowReschedulePanel(p => !p)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          >
            <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>📅 시간표 일정 재배치</h2>
            <i className={`fa-solid ${showReschedulePanel ? 'fa-chevron-up' : 'fa-chevron-down'}`} style={{ fontSize: '13px', color: 'var(--text-muted)' }} />
          </div>

          {showReschedulePanel && (
            <div style={{ marginTop: '14px' }}>
              <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: 1.6 }}>
                현재 활성 기수의 시간표는 이전 기수 시트를 복제해서 만들어진 경우가 많아, 각 강의에 적힌 날짜(예: 6/22 월)가 이전 기수 날짜 그대로 남아있을 수 있습니다.
                아래에 새 시작일을 입력하면 "1일차, 2일차..."라는 순서는 그대로 두고 날짜만 새로 계산해서 한 번에 바꿔줍니다. 강의명·시간·링크 등 다른 내용은 그대로 유지됩니다.
              </p>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'end' }}>
                <div>
                  <label style={labelStyle}>새 시작일 (1일차 날짜)</label>
                  <input type="date" value={newStartDate} onChange={e => setNewStartDate(e.target.value)} style={inputStyle} />
                </div>
                <button onClick={handleReschedule} disabled={rescheduling}
                  style={{ padding: '9px 18px', borderRadius: '8px', border: 'none', background: 'var(--mobi-orange)', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: rescheduling ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: rescheduling ? 0.7 : 1 }}>
                  {rescheduling ? '재배치 중...' : '날짜 재배치'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 직무 트랙 복사 — CO1 전용, 신규 직무 추가 시 한 번 쓰는 영역이라 접어둠 */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '20px 24px', marginTop: '24px' }}>
          <div
            onClick={() => setShowCopyTrackPanel(p => !p)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          >
            <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>🎧 CC 직무 시간표 만들기</h2>
            <i className={`fa-solid ${showCopyTrackPanel ? 'fa-chevron-up' : 'fa-chevron-down'}`} style={{ fontSize: '13px', color: 'var(--text-muted)' }} />
          </div>

          {showCopyTrackPanel && (
            <div style={{ marginTop: '14px' }}>
              <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: 1.6 }}>
                CC 직무 시간표를 처음부터 새로 만드는 대신, 사업기획·전략 전용 강의를 그대로 복제해서 시작할 수 있습니다.
                (전체 공통 강의는 이미 CC에도 적용되어 있어 복제 대상이 아닙니다) 복제 후에는 CC 탭에서 자유롭게 내용을 수정·삭제하면 됩니다.
                한 번 실행하면 되돌릴 수 없으니, 이미 CC 강의를 만들어둔 상태라면 중복 생성에 주의하세요.
              </p>
              <button onClick={handleCopyBizToCC} disabled={copyingTrack}
                style={{ padding: '9px 18px', borderRadius: '8px', border: 'none', background: 'var(--mobi-orange)', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: copyingTrack ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: copyingTrack ? 0.7 : 1 }}>
                {copyingTrack ? '복사 중...' : '사업기획·전략 → CC 복사'}
              </button>
            </div>
          )}
        </div>

      </main>
    </>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: 600,
  color: 'var(--text-secondary)', marginBottom: '4px',
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid var(--border)',
  borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit',
  background: '#fff', color: 'var(--text-primary)',
}
const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '10px 16px', fontSize: '12px',
  fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap',
}
const tdStyle: React.CSSProperties = {
  padding: '12px 16px', fontSize: '13.5px', verticalAlign: 'middle',
}
