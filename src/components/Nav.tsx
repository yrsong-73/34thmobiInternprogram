'use client'

import { useSession, signOut } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'
import { usePreview } from '@/context/PreviewContext'

const TABS = [
  { id: 'schedule',  href: '/schedule',  icon: 'fa-regular fa-calendar-days', label: '시간표' },
  { id: 'notice',    href: '/notice',    icon: 'fa-regular fa-bell',           label: '공지' },
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
  const { previewMode, previewInternName, internsList, setPreviewMode, setPreviewInternName, effectiveRole, isCO1Real } = usePreview()

  const role     = (session?.user as any)?.role as string | undefined
  const userName = (session?.user as any)?.userName || session?.user?.name || ''

  // 탭: effectiveRole 기준으로 필터링
  const visibleTabs = TABS.filter(t => !t.roles || (effectiveRole && t.roles.includes(effectiveRole)))

  // 역할 배지: 미리보기 중이면 변경
  const displayRole = isCO1Real && previewMode !== 'off'
    ? (previewMode === 'member' ? 'Member 미리보기' : (previewInternName ? `${previewInternName} 미리보기` : 'Intern 미리보기'))
    : (role || 'Intern')
  const roleStyle = isCO1Real && previewMode !== 'off'
    ? { bg: 'rgba(99,102,241,0.25)', border: 'rgba(99,102,241,0.5)', color: '#818CF8' }
    : (ROLE_STYLE[role || ''] || ROLE_STYLE['Intern'])

  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 100 }}>
      {/* 메인 내비 */}
      <nav style={{
        background: 'var(--mobi-dark)',
        padding: '0 32px',
        display: 'flex',
        alignItems: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        {/* 로고 */}
        <div style={{
          color: '#fff', fontSize: '15px', fontWeight: 700, letterSpacing: '-0.3px',
          padding: '18px 0', marginRight: '36px',
          display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer',
        }} onClick={() => router.push('/schedule')}>
          <i className="fa-solid fa-hexagon-nodes" style={{ color: 'var(--mobi-orange)' }} />
          Mobidays
          <span style={{ background: 'var(--mobi-orange)', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '20px' }}>
            34기 인턴십
          </span>
        </div>

        {/* 탭 */}
        {visibleTabs.map(tab => {
          const isActive = pathname.startsWith(tab.href)
          return (
            <a key={tab.id} href={tab.href} style={{
              color: isActive ? '#fff' : 'rgba(255,255,255,0.5)',
              fontSize: '13.5px', fontWeight: 500,
              padding: '18px 16px', cursor: 'pointer',
              borderBottom: isActive ? '2px solid var(--mobi-orange)' : '2px solid transparent',
              transition: 'all 0.2s', textDecoration: 'none',
              display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
            }}>
              <i className={tab.icon} style={{ fontSize: '14px' }} />
              {tab.label}
              {tab.id === 'settings' && <span style={{ fontSize: '10px', opacity: 0.6, marginLeft: '2px' }}>CO1</span>}
            </a>
          )
        })}

        {/* 우측: 사용자 정보 */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '13px', fontWeight: 600 }}>{userName}</span>
          <span style={{
            fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', whiteSpace: 'nowrap',
            background: roleStyle.bg, border: `1px solid ${roleStyle.border}`, color: roleStyle.color,
          }}>
            {displayRole}
          </span>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            style={{
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '8px', color: 'rgba(255,255,255,0.5)', fontSize: '12px',
              padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
          >
            로그아웃
          </button>
        </div>
      </nav>

      {/* CO1 전용 권한 미리보기 바 */}
      {isCO1Real && (
        <div style={{
          background: '#131720',
          borderBottom: previewMode !== 'off' ? '2px solid rgba(99,102,241,0.5)' : '1px solid rgba(255,255,255,0.05)',
          padding: '7px 32px',
          display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'rgba(255,255,255,0.35)', marginRight: '2px' }}>
            👁 권한 미리보기
          </span>

          {(['off', 'member', 'intern'] as const).map(mode => {
            const labels = { off: 'CO1 기본', member: '멤버로 보기', intern: '인턴으로 보기' }
            const active = previewMode === mode
            return (
              <button key={mode} onClick={() => setPreviewMode(mode)} style={{
                padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                border: active ? 'none' : '1px solid rgba(255,255,255,0.12)',
                background: active
                  ? (mode === 'off' ? 'rgba(255,107,43,0.7)' : 'rgba(99,102,241,0.7)')
                  : 'transparent',
                color: active ? '#fff' : 'rgba(255,255,255,0.45)',
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
                padding: '3px 8px', borderRadius: '6px',
                border: '1px solid rgba(255,255,255,0.2)',
                fontSize: '11px', fontFamily: 'inherit',
                color: previewInternName ? '#fff' : 'rgba(255,255,255,0.45)',
                background: 'rgba(255,255,255,0.08)', cursor: 'pointer',
              }}
            >
              <option value="" style={{ color: '#1a1a1a', background: '#fff' }}>-- 인턴 선택 --</option>
              {internsList.map(i => (
                <option key={i.name} value={i.name} style={{ color: '#1a1a1a', background: '#fff' }}>{i.name} ({i.job})</option>
              ))}
            </select>
          )}

          {previewMode !== 'off' && (
            <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.25)', fontStyle: 'italic', marginLeft: '4px' }}>
              {previewMode === 'member'
                ? '멤버 시점으로 보는 중 · 편집 불가'
                : (previewInternName ? `${previewInternName} 시점으로 보는 중 · 읽기 전용` : '인턴을 선택하면 해당 인턴 시점으로 전환됩니다')}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
