'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Nav from '@/components/Nav'
import { usePreview } from '@/context/PreviewContext'
import type { Notice } from '@/types'

function showToast(msg: string) {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = msg
  el.classList.add('show')
  setTimeout(() => el.classList.remove('show'), 2200)
}

// ── 인라인 마크다운 렌더러 (**굵게**, ==형광==) ──────────────────────
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  let remaining = text
  let key = 0
  while (remaining.length > 0) {
    const boldIdx = remaining.indexOf('**')
    const hlIdx   = remaining.indexOf('==')
    const next    = Math.min(boldIdx >= 0 ? boldIdx : Infinity, hlIdx >= 0 ? hlIdx : Infinity)
    if (next === Infinity) { parts.push(remaining); break }
    if (next > 0) { parts.push(remaining.slice(0, next)); remaining = remaining.slice(next) }
    if (remaining.startsWith('**')) {
      const end = remaining.indexOf('**', 2)
      if (end < 0) { parts.push(remaining); break }
      parts.push(<strong key={key++}>{remaining.slice(2, end)}</strong>)
      remaining = remaining.slice(end + 2)
    } else if (remaining.startsWith('==')) {
      const end = remaining.indexOf('==', 2)
      if (end < 0) { parts.push(remaining); break }
      parts.push(<mark key={key++} style={{ background: '#FEF08A', borderRadius: '3px', padding: '0 2px' }}>{remaining.slice(2, end)}</mark>)
      remaining = remaining.slice(end + 2)
    }
  }
  return <>{parts}</>
}

function renderContent(text: string): React.ReactNode {
  return (
    <>
      {text.split('\n').map((line, i) => {
        if (line.startsWith('# '))
          return <div key={i} style={{ fontSize: '15px', fontWeight: 700, margin: '10px 0 4px' }}>{line.slice(2)}</div>
        if (line.startsWith('## '))
          return <div key={i} style={{ fontSize: '13.5px', fontWeight: 700, margin: '8px 0 3px', color: 'var(--text-secondary)' }}>{line.slice(3)}</div>
        if (line.startsWith('- '))
          return (
            <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '3px', paddingLeft: '4px' }}>
              <span style={{ color: 'var(--mobi-orange)', flexShrink: 0, fontWeight: 700 }}>•</span>
              <span style={{ fontSize: '13.5px', lineHeight: 1.65 }}>{renderInline(line.slice(2))}</span>
            </div>
          )
        if (line === '---')
          return <hr key={i} style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '12px 0' }} />
        if (!line.trim())
          return <div key={i} style={{ height: '6px' }} />
        return <div key={i} style={{ fontSize: '13.5px', lineHeight: 1.65, marginBottom: '2px' }}>{renderInline(line)}</div>
      })}
    </>
  )
}

// ── 편집 모달 (CO1 전용) ────────────────────────────────────────────
function NoticeEditModal({ notice, onSave, onClose }: {
  notice: Partial<Notice> & { isNew?: boolean }
  onSave: (title: string, content: string) => Promise<void>
  onClose: () => void
}) {
  const [title,   setTitle]   = useState(notice.title   ?? '')
  const [content, setContent] = useState(notice.content ?? '')
  const [saving,  setSaving]  = useState(false)
  const [preview, setPreview] = useState(false)

  async function handleSave() {
    if (!title.trim()) { showToast('⚠️ 제목을 입력해주세요'); return }
    setSaving(true)
    await onSave(title, content)
    setSaving(false)
  }

  const inputS: React.CSSProperties = {
    width: '100%', padding: '10px 12px', border: '1px solid var(--border)',
    borderRadius: '8px', fontFamily: 'inherit', boxSizing: 'border-box',
  }
  const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: '4px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
    border: `1.5px solid ${active ? 'var(--mobi-orange)' : 'var(--border)'}`,
    background: active ? 'var(--mobi-orange)' : '#fff',
    color: active ? '#fff' : 'var(--text-secondary)',
  })

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: '16px', padding: '28px 32px', width: '660px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700 }}>{notice.isNew ? '📌 공지 추가' : '✏️ 공지 수정'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
        </div>

        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="공지 제목"
          style={{ ...inputS, fontSize: '15px', fontWeight: 600, marginBottom: '12px' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <button style={tabBtn(!preview)} onClick={() => setPreview(false)}>편집</button>
          <button style={tabBtn(preview)}  onClick={() => setPreview(true)}>미리보기</button>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '4px' }}>
            **굵게** &nbsp;==형광== &nbsp;# 제목 &nbsp;## 소제목 &nbsp;- 목록 &nbsp;--- 구분선
          </span>
        </div>

        {!preview ? (
          <textarea value={content} onChange={e => setContent(e.target.value)} rows={14}
            placeholder={'내용을 입력하세요\n\n# 대제목\n## 소제목\n- 목록 항목\n**굵게** ==형광펜==\n---'}
            style={{ ...inputS, fontSize: '13.5px', resize: 'vertical', lineHeight: 1.65 }} />
        ) : (
          <div style={{ minHeight: '200px', padding: '14px 16px', border: '1px solid var(--border)', borderRadius: '8px', background: '#FAFAF9', lineHeight: 1.65 }}>
            {renderContent(content || '(내용 없음)')}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>취소</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '9px 22px', borderRadius: '8px', border: 'none', background: 'var(--mobi-orange)', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────
export default function NoticePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { isCO1Real, previewMode } = usePreview()

  const role    = (session?.user as any)?.role as string | undefined
  const canEdit = role === 'CO1' && previewMode === 'off'

  const [notices,    setNotices]    = useState<Notice[]>([])
  const [loading,    setLoading]    = useState(true)
  const [openIds,    setOpenIds]    = useState<Set<number>>(new Set())
  const [editTarget, setEditTarget] = useState<(Partial<Notice> & { isNew?: boolean }) | null>(null)
  const [deleting,   setDeleting]   = useState<number | null>(null)

  useEffect(() => { if (status === 'unauthenticated') router.replace('/login') }, [status, router])

  async function fetchNotices() {
    setLoading(true)
    try {
      const res = await fetch('/api/notices')
      if (res.ok) setNotices((await res.json()).notices ?? [])
    } finally { setLoading(false) }
  }
  useEffect(() => { if (status === 'authenticated') fetchNotices() }, [status])

  function toggleOpen(rowIndex: number) {
    setOpenIds(prev => {
      const next = new Set(prev)
      next.has(rowIndex) ? next.delete(rowIndex) : next.add(rowIndex)
      return next
    })
  }

  async function handleSave(title: string, content: string) {
    if (editTarget?.rowIndex) {
      await fetch('/api/notices', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rowIndex: editTarget.rowIndex, title, content }) })
      showToast('✅ 공지가 수정됐습니다')
    } else {
      await fetch('/api/notices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, content }) })
      showToast('✅ 공지가 추가됐습니다')
    }
    setEditTarget(null)
    await fetchNotices()
  }

  async function handleDelete(rowIndex: number) {
    if (!confirm('이 공지를 삭제할까요?')) return
    setDeleting(rowIndex)
    await fetch('/api/notices', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rowIndex }) })
    showToast('🗑️ 삭제됐습니다')
    setDeleting(null)
    await fetchNotices()
  }

  if (status === 'loading' || loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>불러오는 중...</div>
    </div>
  )

  return (
    <>
      <Nav />
      <main style={{ padding: '32px', maxWidth: '860px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.5px', marginBottom: '6px' }}>📌 공지 게시판</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13.5px' }}>34기 인턴십 공지사항</p>
          </div>
          {canEdit && (
            <button onClick={() => setEditTarget({ isNew: true })}
              style={{ padding: '9px 18px', borderRadius: '8px', border: 'none', background: 'var(--mobi-orange)', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              + 공지 추가
            </button>
          )}
        </div>

        {notices.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '40px', opacity: 0.25, marginBottom: '12px' }}>📋</div>
            공지사항이 없습니다.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {notices.map(notice => {
              const isOpen = openIds.has(notice.rowIndex)
              return (
                <div key={notice.rowIndex} style={{
                  background: 'var(--bg-card)',
                  border: `1px solid ${isOpen ? 'rgba(255,107,43,0.4)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius)',
                  overflow: 'hidden',
                  boxShadow: isOpen ? '0 2px 12px rgba(255,107,43,0.08)' : 'var(--shadow)',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                }}>
                  {/* 제목 행 (클릭 = 토글) */}
                  <div
                    onClick={() => toggleOpen(notice.rowIndex)}
                    style={{
                      padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '12px',
                      cursor: 'pointer', userSelect: 'none',
                      background: isOpen ? 'rgba(255,107,43,0.04)' : 'transparent',
                      transition: 'background 0.15s',
                    }}
                  >
                    <span style={{
                      fontSize: '11px', color: isOpen ? 'var(--mobi-orange)' : 'var(--text-muted)',
                      display: 'inline-block', transition: 'transform 0.2s',
                      transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                    }}>▶</span>
                    <span style={{ fontSize: '15px', fontWeight: 700, flex: 1, color: 'var(--text-primary)' }}>
                      {notice.title}
                    </span>
                    <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{notice.created_at}</span>
                    <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{notice.author}</span>
                    {canEdit && (
                      <div style={{ display: 'flex', gap: '5px' }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => setEditTarget(notice)}
                          style={{ fontSize: '11px', padding: '3px 9px', borderRadius: '5px', border: '1px solid var(--border)', background: '#fff', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>
                          수정
                        </button>
                        <button onClick={() => handleDelete(notice.rowIndex)} disabled={deleting === notice.rowIndex}
                          style={{ fontSize: '11px', padding: '3px 9px', borderRadius: '5px', border: '1px solid #FFCFB8', background: '#FFF0EA', color: '#FF6B2B', cursor: 'pointer', fontFamily: 'inherit', opacity: deleting === notice.rowIndex ? 0.6 : 1 }}>
                          삭제
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 내용 (열렸을 때) */}
                  {isOpen && (
                    <div style={{ padding: '0 24px 20px', borderTop: '1px solid var(--border)' }}>
                      <div style={{ paddingTop: '16px' }}>
                        {renderContent(notice.content || '(내용 없음)')}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>

      {editTarget && (
        <NoticeEditModal notice={editTarget} onSave={handleSave} onClose={() => setEditTarget(null)} />
      )}
    </>
  )
}
