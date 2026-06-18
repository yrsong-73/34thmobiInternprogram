'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Nav from '@/components/Nav'
import type { UserPermission, UserRole } from '@/types'

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
            {([
              { label: '인턴십 구글 시트',       href: 'https://docs.google.com/spreadsheets/d/1fk-BF_q5YOeQ-UsWiZUNIZmWBY2AFZyyihhiBFG9RpE/edit?usp=sharing' },
              { label: '인턴 페이지 관리용 시트', href: 'https://docs.google.com/spreadsheets/d/1KnZ-lI6AI5ssZSuDlHjBUuuS-qjcJ6On9sEXGnF12nE/edit?gid=0#gid=0' },
            ] as { label: string; href: string }[]).map(({ label, href }) => (
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
