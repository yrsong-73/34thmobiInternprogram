'use client'

import { useSession, signOut } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'

const TABS = [
  { id: 'schedule',  href: '/schedule',  icon: 'fa-regular fa-calendar-days', label: '시간표' },
  { id: 'dashboard', href: '/dashboard', icon: 'fa-solid fa-chart-simple',     label: '인턴 대시보드', roles: ['CO1', 'Member'] },
  { id: 'record',    href: '/record',    icon: 'fa-regular fa-clipboard',       label: '인턴 기록표',  roles: ['CO1', 'Member'] },
  { id: 'settings',  href: '/settings',  icon: 'fa-solid fa-shield-halved',     label: '권한 관리',   roles: ['CO1'] },
]

const ROLE_STYLE: Record<string, { bg: string; border: string; color: string }> = {
  CO1:    { bg: 'rgba(255,107,43,0.25)',  border: 'rgba(255,107,43,0.5)',  color: '#FF9469' },
  Member: { bg: 'rgba(59,130,246,0.2)',   border: 'rgba(59,130,246,0.4)', color: '#93C5FD' },
  Intern: { bg: 'rgba(139,92,246,0.2)',   border: 'rgba(139,92,246,0.4)', color: '#C4B5FD' },
}

export default function Nav() {
  const { data: session } = useSession()
  const pathname = usePathname()
  const router = useRouter()

  const role = (session?.user as any)?.role as string | undefined
  const userName = (session?.user as any)?.userName || session?.user?.name || ''
  const roleStyle = ROLE_STYLE[role || ''] || ROLE_STYLE['Intern']

  const visibleTabs = TABS.filter(t => !t.roles || (role && t.roles.includes(role)))

  return (
    <nav style={{
      background: 'var(--mobi-dark)',
      padding: '0 32px',
      display: 'flex',
      alignItems: 'center',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>
      {/* 로고 */}
      <div style={{
        color: '#fff',
        fontSize: '15px',
        fontWeight: 700,
        letterSpacing: '-0.3px',
        padding: '18px 0',
        marginRight: '36px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        cursor: 'pointer',
      }} onClick={() => router.push('/schedule')}>
        <i className="fa-solid fa-hexagon-nodes" style={{ color: 'var(--mobi-orange)' }} />
        Mobidays
        <span style={{
          background: 'var(--mobi-orange)',
          color: '#fff',
          fontSize: '10px',
          fontWeight: 700,
          padding: '2px 7px',
          borderRadius: '20px',
        }}>34기 인턴십</span>
      </div>

      {/* 탭 */}
      {visibleTabs.map(tab => {
        const isActive = pathname.startsWith(tab.href)
        return (
          <a
            key={tab.id}
            href={tab.href}
            style={{
              color: isActive ? '#fff' : 'rgba(255,255,255,0.5)',
              fontSize: '13.5px',
              fontWeight: 500,
              padding: '18px 16px',
              cursor: 'pointer',
              borderBottom: isActive ? '2px solid var(--mobi-orange)' : '2px solid transparent',
              transition: 'all 0.2s',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
            }}
          >
            <i className={tab.icon} style={{ fontSize: '14px' }} />
            {tab.label}
            {tab.id === 'settings' && (
              <span style={{ fontSize: '10px', opacity: 0.6, marginLeft: '2px' }}>CO1</span>
            )}
          </a>
        )
      })}

      {/* 우측 사용자 배지 */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '13px', fontWeight: 600 }}>
          {userName}
        </span>
        <span style={{
          fontSize: '11px',
          fontWeight: 700,
          padding: '3px 10px',
          borderRadius: '20px',
          background: roleStyle.bg,
          border: `1px solid ${roleStyle.border}`,
          color: roleStyle.color,
        }}>
          {role || 'Intern'}
        </span>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '8px',
            color: 'rgba(255,255,255,0.5)',
            fontSize: '12px',
            padding: '4px 10px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
        >
          로그아웃
        </button>
      </div>
    </nav>
  )
}
