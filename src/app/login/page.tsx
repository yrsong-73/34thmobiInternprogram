'use client'

import { signIn, useSession } from 'next-auth/react'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function LoginContent() {
  const { data: session } = useSession()
  const router = useRouter()
  const params = useSearchParams()
  const error = params.get('error')
  const [cohortLabel, setCohortLabel] = useState('')

  // 이미 로그인된 경우 바로 이동
  useEffect(() => {
    if (session) router.replace('/schedule')
  }, [session, router])

  useEffect(() => {
    fetch('/api/cohorts/active')
      .then(r => r.json())
      .then(d => { if (d.label) setCohortLabel(d.label) })
      .catch(() => {})
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--mobi-dark)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: '32px',
    }}>
      {/* 로고 */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '8px' }}>
          <i className="fa-solid fa-hexagon-nodes" style={{ color: 'var(--mobi-orange)', fontSize: '28px' }} />
          <span style={{ color: '#fff', fontSize: '22px', fontWeight: 700, letterSpacing: '-0.5px' }}>
            Mobidays
          </span>
        </div>
        <div style={{
          display: 'inline-block',
          background: 'var(--mobi-orange)',
          color: '#fff',
          fontSize: '12px',
          fontWeight: 700,
          padding: '3px 12px',
          borderRadius: '20px',
        }}>
          {cohortLabel ? `${cohortLabel} ` : ''}인턴십
        </div>
      </div>

      {/* 카드 */}
      <div style={{
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '16px',
        padding: '40px 48px',
        width: '360px',
        textAlign: 'center',
      }}>
        <h1 style={{ color: '#fff', fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>
          로그인
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', marginBottom: '32px' }}>
          Mobidays Google 계정으로 로그인하세요
        </p>

        {/* 에러 메시지 */}
        {error === 'unauthorized' && (
          <div style={{
            background: 'rgba(232,93,117,0.15)',
            border: '1px solid rgba(232,93,117,0.3)',
            borderRadius: '8px',
            padding: '10px 16px',
            color: '#F87171',
            fontSize: '12px',
            marginBottom: '20px',
          }}>
            ⚠️ 접근 권한이 없는 계정입니다.<br />
            담당자에게 문의해주세요.
          </div>
        )}
        {error && error !== 'unauthorized' && (
          <div style={{
            background: 'rgba(232,93,117,0.15)',
            border: '1px solid rgba(232,93,117,0.3)',
            borderRadius: '8px',
            padding: '10px 16px',
            color: '#F87171',
            fontSize: '12px',
            marginBottom: '20px',
          }}>
            ⚠️ 로그인 중 오류가 발생했습니다.
          </div>
        )}

        {/* 구글 로그인 버튼 */}
        <button
          onClick={() => signIn('google', { callbackUrl: '/schedule' })}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            background: '#fff',
            color: '#1A1A2E',
            border: 'none',
            borderRadius: '10px',
            padding: '13px 20px',
            fontSize: '14px',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.2s',
            fontFamily: 'inherit',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#f0f0f0')}
          onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
        >
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.7 33.5 29.3 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l5.7-5.7C34.4 5.1 29.5 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c11 0 20.4-8 20.4-21 0-1.3-.1-2.7-.4-4z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.5 18.9 12 24 12c3.1 0 5.9 1.1 8.1 2.9l5.7-5.7C34.4 5.1 29.5 3 24 3 16.3 3 9.7 7.9 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 45c5.2 0 10-1.9 13.7-5.1l-6.3-5.3C29.4 36.5 26.8 37 24 37c-5.2 0-9.7-3.5-11.3-8.3l-6.6 5C9.7 40 16.3 45 24 45z"/>
            <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.3-4.3 5.6l6.3 5.3C41.5 35.2 44 30 44 24c0-1.3-.1-2.7-.4-4z"/>
          </svg>
          Google 계정으로 로그인
        </button>
      </div>

      <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '12px' }}>
        © 2026 Mobidays. 내부 전용 서비스입니다.
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  )
}
