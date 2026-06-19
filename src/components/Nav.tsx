'use client'

import { useSession, signOut } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'
import { usePreview } from '@/context/PreviewContext'

const TABS = [
  { id: 'schedule',  href: '/schedule',  icon: 'fa-regular fa-calendar-days', label: '시간표' },
  { id: 'notice',    href: '/notice',    icon: 'fa-regular fa-bell',           label: '공지' },
  { id: 'dashboard', href: '/dashboard', icon: 'fa-solid fa-chart-simple',     label: '인턴 대시보드', roles: ['CO1', 'Member'] },
  { id: 'record',    href: '/record',    icon: 'fa-regular fa-clipboard',       label: '인턴 기록표',  roles: ['CO1'] },
  { id: 'interview', href: '/interview', icon: 'fa-regular fa-handshake',        label: '면담 신청',   roles: ['CO1', 'Member'] },
  { id: 'feedback',  href: '/feedback',  icon: 'fa-regular fa-star',             label: '강의 피드백', roles: ['CO1'] },
  { id: 'settings',  href: '/settings',  icon: 'fa-solid fa-shield-halved',     label: '관리자용',   roles: ['CO1'] },
]

const ROLE_STYLE: Record<string, { bg: string; border: string; color: string }> = {
  CO1:    { bg: 'rgba(255,107,43,0.1)',   border: 'rgba(255,107,43,0.3)',  color: '#C04D15' },
  Member: { bg: 'rgba(29,68,144,0.08)',   border: 'rgba(29,68,144,0.2)',   color: '#1D4490' },
  Intern: { bg: 'rgba(124,58,237,0.08)',  border: 'rgba(124,58,237,0.2)', color: '#6D28D9' },
}

export default function Nav() {
  const { data: session } = useSession()
  const pathname = usePathname()
  const router = useRouter()
  const { previewMode, previewInternName, internsList, setPreviewMode, setPreviewInternName, effectiveRole, isCO1Real } = usePreview()

  const role     = (session?.user as any)?.role as string | undefined
  const userName = (session?.user as any)?.userName || session?.user?.name || ''

  const visibleTabs = TABS.filter(t => !t.roles || (effectiveRole && t.roles.includes(effectiveRole)))

  const displayRole = isCO1Real && previewMode !== 'off'
    ? (previewMode === 'member' ? 'Member 미리보기' : (previewInternName ? `${previewInternName} 미리보기` : 'Intern 미리보기'))
    : (role || 'Intern')
  const roleStyle = isCO1Real && previewMode !== 'off'
    ? { bg: 'rgba(99,102,241,0.1)', border: 'rgba(99,102,241,0.25)', color: '#4F46E5' }
    : (ROLE_STYLE[role || ''] || ROLE_STYLE['Intern'])

  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 100 }}>
      {/* ── 메인 네비 ── */}
      <nav style={{
        background: '#fff',
        padding: '0 32px',
        display: 'flex',
        alignItems: 'center',
        borderBottom: '1px solid var(--border)',
        boxShadow: '0 1px 0 var(--border)',
        height: '56px',
      }}>
        {/* 로고 */}
        <div
          onClick={() => router.push('/schedule')}
          style={{ display: 'flex', alignItems: 'center', gap: '10px', marginRight: '32px', cursor: 'pointer', padding: '16px 0' }}
        >
          <img
            src="/logo.png"
            alt="Mobidays"
            style={{ height: '24px', objectFit: 'contain' }}
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
          <span style={{
            background: 'var(--primary)',
            color: '#fff',
            fontSize: '10px',
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: '20px',
            letterSpacing: '0.2px',
          }}>
            34기 인턴십
          </span>
        </div>

        {/* 탭 */}
        {visibleTabs.map(tab => {
          const isActive = pathname.startsWith(tab.href)
          return (
            <a key={tab.id} href={tab.href} style={{
              color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
              fontSize: '13.5px',
              fontWeight: isActive ? 700 : 500,
              padding: '0 14px',
              height: '56px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              borderBottom: isActive ? '2px solid var(--primary)' : '2px solid transparent',
              transition: 'all 0.15s',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}
            >
              <i className={tab.icon} style={{ fontSize: '13px' }} />
              {tab.label}
            </a>
          )
        })}

        {/* 우측: 사용자 */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>{userName}</span>
          <span style={{
            fontSize: '11px',
            fontWeight: 700,
            padding: '3px 10px',
            borderRadius: '20px',
            whiteSpace: 'nowrap',
            background: roleStyle.bg,
            border: `1px solid ${roleStyle.border}`,
            color: roleStyle.color,
          }}>
            {displayRole}
          </span>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--text-muted)',
              fontSize: '12px',
              padding: '5px 12px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontWeight: 500,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)'
              ;(e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
              ;(e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'
            }}
          >
            로그아웃
          </button>
        </div>
      </nav>

      {/* ── CO1 전용 권한 미리보기 바 ── */}
      {isCO1Real && (
        <div style={{
          background: 'var(--bg-hover)',
          borderBottom: previewMode !== 'off'
            ? '2px solid rgba(29,68,144,0.3)'
            : '1px solid var(--border)',
          padding: '7px 32px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-muted)', marginRight: '2px' }}>
            👁 권한 미리보기
          </span>

          {(['off', 'member', 'intern', 'intern-test'] as const).map(mode => {
            const labels: Record<string, string> = { off: 'CO1 기본', member: '멤버로 보기', intern: '인턴으로 보기', 'intern-test': '인턴 테스트' }
            const active = previewMode === mode
            const isTest = mode === 'intern-test'
            return (
              <button key={mode} onClick={() => setPreviewMode(mode)} style={{
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s',
                border: active ? 'none' : `1px solid ${isTest ? 'rgba(245,158,11,0.4)' : 'var(--border)'}`,
                background: active
                  ? (mode === 'off' ? 'var(--primary)' : isTest ? '#F59E0B' : '#6366F1')
                  : isTest ? 'rgba(245,158,11,0.06)' : '#fff',
                color: active ? '#fff' : isTest ? '#B45309' : 'var(--text-secondary)',
              }}>
                {labels[mode]}
              </button>
            )
          })}

          {previewMode === 'intern' && (
            <select
              value={previewInternName}
              onChange={e => setPreviewInternName(e.target.value)}
              style={{
                padding: '4px 10px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                fontSize: '11px',
                fontFamily: 'inherit',
                color: previewInternName ? 'var(--text-primary)' : 'var(--text-muted)',
                background: '#fff',
                cursor: 'pointer',
              }}
            >
              <option value="">-- 인턴 선택 --</option>
              {internsList.map(i => (
                <option key={i.name} value={i.name}>{i.name} ({i.job})</option>
              ))}
            </select>
          )}

          {previewMode !== 'off' && (
            <span style={{ fontSize: '10px', color: previewMode === 'intern-test' ? '#B45309' : 'var(--text-muted)', fontStyle: 'italic', marginLeft: '4px' }}>
              {previewMode === 'member'
                ? '멤버 시점으로 보는 중 · 편집 불가'
                : previewMode === 'intern-test'
                  ? '🧪 가상 인턴 테스트 중 · 저장 안됨'
                  : (previewInternName ? `${previewInternName} 시점으로 보는 중 · 읽기 전용` : '인턴을 선택하면 해당 인턴 시점으로 전환됩니다')}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
