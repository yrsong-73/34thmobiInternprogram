'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import Nav from '@/components/Nav'
import { usePreview } from '@/context/PreviewContext'
import type { Notice, NoticeComment } from '@/types'

function showToast(msg: string) {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = msg
  el.classList.add('show')
  setTimeout(() => el.classList.remove('show'), 2200)
}

// ── 마크다운 렌더러 ──────────────────────────────────────────────────
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  let remaining = text
  let key = 0
  while (remaining.length > 0) {
    const boldIdx = remaining.indexOf('**')
    const hlIdx   = remaining.indexOf('==')
    const next    = Math.min(boldIdx >= 0 ? boldIdx : Infinity, hlIdx >= 0 ? hlIdx : Infinity)
    if (next === Infinity) { parts.push(remaining); break }
    if (next > 0) { parts.push(remaining.slice(0, next)); remaining = remaining.slice(next); continue }
    if (remaining.startsWith('**')) {
      const end = remaining.indexOf('**', 2)
      if (end < 0) { parts.push(remaining); break }
      parts.push(<span key={key++} style={{ fontWeight: 700 }}>{remaining.slice(2, end)}</span>)
      remaining = remaining.slice(end + 2)
    } else if (remaining.startsWith('==')) {
      const end = remaining.indexOf('==', 2)
      if (end < 0) { parts.push(remaining); break }
      parts.push(<span key={key++} style={{ background: '#FEF08A', borderRadius: '3px', padding: '1px 3px', color: '#78350F' }}>{remaining.slice(2, end)}</span>)
      remaining = remaining.slice(end + 2)
    } else {
      parts.push(remaining[0]); remaining = remaining.slice(1)
    }
  }
  return <>{parts}</>
}

function renderContent(text: string): React.ReactNode {
  return (
    <>
      {text.split('\n').map((line, i) => {
        if (line.startsWith('# '))
          return <div key={i} style={{ fontSize: '15px', fontWeight: 700, margin: '10px 0 4px' }}>{renderInline(line.slice(2))}</div>
        if (line.startsWith('## '))
          return <div key={i} style={{ fontSize: '13.5px', fontWeight: 700, margin: '8px 0 3px', color: 'var(--text-secondary)' }}>{renderInline(line.slice(3))}</div>
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

// ── 마크다운 툴바 헬퍼 ───────────────────────────────────────────────
function applyFormat(
  ta: HTMLTextAreaElement,
  content: string,
  setContent: (v: string) => void,
  type: 'wrap' | 'linePrefix' | 'insert',
  a: string,
  b = '',
  sample = '텍스트'
) {
  const ss = ta.selectionStart
  const se = ta.selectionEnd

  if (type === 'wrap') {
    const selected = content.slice(ss, se) || sample
    const newContent = content.slice(0, ss) + a + selected + b + content.slice(se)
    setContent(newContent)
    setTimeout(() => {
      ta.focus()
      ta.setSelectionRange(ss + a.length, ss + a.length + selected.length)
    }, 0)
  } else if (type === 'linePrefix') {
    const lineStart = content.lastIndexOf('\n', ss - 1) + 1
    const newContent = content.slice(0, lineStart) + a + content.slice(lineStart)
    setContent(newContent)
    setTimeout(() => {
      ta.focus()
      ta.setSelectionRange(ss + a.length, ss + a.length)
    }, 0)
  } else {
    const newContent = content.slice(0, ss) + a + content.slice(se)
    setContent(newContent)
    setTimeout(() => {
      ta.focus()
      ta.setSelectionRange(ss + a.length, ss + a.length)
    }, 0)
  }
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
  const taRef = useRef<HTMLTextAreaElement>(null)

  async function handleSave() {
    if (!title.trim()) { showToast('⚠️ 제목을 입력해주세요'); return }
    setSaving(true)
    await onSave(title, content)
    setSaving(false)
  }

  function fmt(a: string, b: string, sample: string) {
    if (!taRef.current) return
    applyFormat(taRef.current, content, setContent, 'wrap', a, b, sample)
  }
  function pfx(a: string) {
    if (!taRef.current) return
    applyFormat(taRef.current, content, setContent, 'linePrefix', a)
  }
  function ins(a: string) {
    if (!taRef.current) return
    applyFormat(taRef.current, content, setContent, 'insert', a)
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
  const toolBtn: React.CSSProperties = {
    padding: '3px 10px', borderRadius: '5px', border: '1px solid var(--border)',
    background: '#fff', color: 'var(--text-secondary)', fontSize: '12px',
    fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    transition: 'background 0.1s',
  }

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

        {/* 편집 / 미리보기 탭 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <button style={tabBtn(!preview)} onClick={() => setPreview(false)}>편집</button>
          <button style={tabBtn(preview)}  onClick={() => setPreview(true)}>미리보기</button>
        </div>

        {!preview ? (
          <>
            {/* 마크다운 툴바 */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button style={{ ...toolBtn, fontWeight: 900 }} onClick={() => fmt('**', '**', '굵게')}>B</button>
              <button style={{ ...toolBtn, background: '#FEF08A', color: '#78350F' }} onClick={() => fmt('==', '==', '형광')}>형광</button>
              <button style={toolBtn} onClick={() => pfx('# ')}># H1</button>
              <button style={toolBtn} onClick={() => pfx('## ')}>## H2</button>
              <button style={toolBtn} onClick={() => pfx('- ')}>• 목록</button>
              <button style={toolBtn} onClick={() => ins('\n---\n')}>─── 구분선</button>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '4px' }}>텍스트 선택 후 클릭하면 적용</span>
            </div>
            <textarea ref={taRef} value={content} onChange={e => setContent(e.target.value)} rows={14}
              placeholder={'내용을 입력하세요\n\n# 대제목\n## 소제목\n- 목록 항목\n**굵게** ==형광펜==\n---'}
              style={{ ...inputS, fontSize: '13.5px', resize: 'vertical', lineHeight: 1.65 }} />
          </>
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

// ── 댓글 컴포넌트 ───────────────────────────────────────────────────
const ROLE_COLOR: Record<string, string> = { CO1: '#1D4490', Member: '#6B7280', Intern: '#FF6B2B' }
const ROLE_LABEL: Record<string, string> = { CO1: '운영', Member: '직원', Intern: '인턴' }

function NoticeComments({ noticeId, isCO1 }: { noticeId: number; isCO1: boolean }) {
  const [comments, setComments] = useState<NoticeComment[]>([])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(true)
  const [submitting, setSubmitting] = useState(false)

  async function loadComments() {
    try {
      const res = await fetch(`/api/notice-comments?noticeId=${noticeId}`)
      if (res.ok) setComments((await res.json()).comments ?? [])
    } finally { setLoading(false) }
  }

  useEffect(() => { loadComments() }, [noticeId])

  async function submit() {
    const text = input.trim()
    if (!text) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/notice-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noticeId, content: text }),
      })
      if (!res.ok) throw new Error()
      setInput('')
      await loadComments()
      showToast('💬 댓글이 등록됐습니다')
    } catch {
      showToast('⚠️ 댓글 등록 실패. 다시 시도해주세요.')
    } finally { setSubmitting(false) }
  }

  async function handleDelete(rowIndex: number) {
    await fetch('/api/notice-comments', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rowIndex }),
    })
    setComments(prev => prev.filter(c => c.rowIndex !== rowIndex))
    showToast('🗑️ 댓글 삭제됐습니다')
  }

  return (
    <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px dashed var(--border)' }}>
      {/* 댓글 헤더 */}
      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '12px' }}>
        💬 댓글{comments.length > 0 ? ` (${comments.length})` : ''}
      </div>

      {/* 댓글 목록 */}
      {loading ? (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>불러오는 중...</div>
      ) : comments.length === 0 ? (
        <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '12px' }}>첫 댓글을 남겨보세요!</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
          {comments.map(c => (
            <div key={c.rowIndex} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              {/* 아바타 */}
              <div style={{
                flexShrink: 0, width: '30px', height: '30px', borderRadius: '50%',
                background: `${ROLE_COLOR[c.role] ?? '#6B7280'}18`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px',
              }}>
                {c.role === 'CO1' ? '🎖️' : c.role === 'Member' ? '👤' : '🧑‍💻'}
              </div>
              {/* 내용 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)' }}>{c.author}</span>
                  <span style={{
                    fontSize: '10px', padding: '1px 7px', borderRadius: '10px',
                    background: `${ROLE_COLOR[c.role] ?? '#6B7280'}15`,
                    color: ROLE_COLOR[c.role] ?? '#6B7280', fontWeight: 600,
                  }}>
                    {ROLE_LABEL[c.role] ?? c.role}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.created_at}</span>
                  {isCO1 && (
                    <button onClick={() => handleDelete(c.rowIndex)}
                      style={{ marginLeft: 'auto', fontSize: '10px', padding: '1px 7px', borderRadius: '5px', border: '1px solid var(--border)', background: '#fff', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit' }}>
                      삭제
                    </button>
                  )}
                </div>
                <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                  {c.content}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 댓글 입력 */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
          placeholder="댓글 입력 (Enter로 전송, Shift+Enter 줄바꿈)"
          rows={2}
          style={{
            flex: 1, padding: '8px 12px', border: '1px solid var(--border)',
            borderRadius: '8px', fontFamily: 'inherit', fontSize: '13px',
            resize: 'none', lineHeight: 1.55, outline: 'none',
            transition: 'border-color 0.15s',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = 'var(--primary)' }}
          onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
        />
        <button
          onClick={submit}
          disabled={submitting || !input.trim()}
          style={{
            padding: '8px 16px', borderRadius: '8px', border: 'none',
            background: submitting || !input.trim() ? 'var(--bg-hover)' : 'var(--primary)',
            color: submitting || !input.trim() ? 'var(--text-muted)' : '#fff',
            fontSize: '12.5px', fontWeight: 700,
            cursor: submitting || !input.trim() ? 'default' : 'pointer',
            fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
            transition: 'background 0.15s',
          }}>
          {submitting ? '...' : '전송'}
        </button>
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
    try {
      if (editTarget?.rowIndex) {
        const res = await fetch('/api/notices', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rowIndex: editTarget.rowIndex, title, content }) })
        if (!res.ok) throw new Error()
        showToast('✅ 공지가 수정됐습니다')
      } else {
        const res = await fetch('/api/notices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, content }) })
        if (!res.ok) throw new Error()
        showToast('✅ 공지가 추가됐습니다')
      }
      setEditTarget(null)
      await fetchNotices()
    } catch {
      showToast('⚠️ 저장 실패. 잠시 후 다시 시도해주세요.')
    }
  }

  async function handleDelete(rowIndex: number) {
    if (!confirm('이 공지를 삭제할까요?')) return
    setDeleting(rowIndex)
    await fetch('/api/notices', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rowIndex }) })
    showToast('🗑️ 삭제됐습니다')
    setDeleting(null)
    await fetchNotices()
  }

  async function handleToggleVisible(rowIndex: number, visible: boolean) {
    await fetch('/api/notices', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rowIndex, visible }),
    })
    showToast(visible ? '👁️ 공지가 공개됐습니다' : '🙈 공지가 숨김 처리됐습니다')
    setNotices(prev => prev.map(n => n.rowIndex === rowIndex ? { ...n, visible } : n))
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
            <h1 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.5px' }}>📌 게시판</h1>
          </div>
          {canEdit && (
            <button onClick={() => setEditTarget({ isNew: true })}
              style={{ padding: '9px 18px', borderRadius: '8px', border: 'none', background: 'var(--mobi-orange)', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              + 공지 추가
            </button>
          )}
        </div>

        {notices.filter(n => canEdit || n.visible).length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '40px', opacity: 0.25, marginBottom: '12px' }}>📋</div>
            공지사항이 없습니다.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {notices.filter(n => canEdit || n.visible).map(notice => {
              const isOpen = openIds.has(notice.rowIndex)
              const isHidden = !notice.visible
              return (
                <div key={notice.rowIndex} style={{
                  background: isHidden ? 'var(--bg-hover)' : 'var(--bg-card)',
                  border: `1px solid ${isOpen ? 'rgba(255,107,43,0.4)' : isHidden ? 'var(--border)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius)',
                  overflow: 'hidden',
                  boxShadow: isOpen ? '0 2px 12px rgba(255,107,43,0.08)' : 'var(--shadow)',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                  opacity: isHidden ? 0.6 : 1,
                }}>
                  {/* 제목 행 */}
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
                    <span style={{ fontSize: '15px', fontWeight: 700, flex: 1, color: isHidden ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                      {notice.title}
                    </span>
                    {isHidden && (
                      <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '10px', background: '#F3F4F6', color: '#6B7280', fontWeight: 600 }}>숨김</span>
                    )}
                    <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{notice.created_at}</span>
                    <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{notice.author}</span>
                    {canEdit && (
                      <div style={{ display: 'flex', gap: '5px' }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => handleToggleVisible(notice.rowIndex, !notice.visible)}
                          style={{
                            fontSize: '11px', padding: '3px 9px', borderRadius: '5px',
                            border: `1px solid ${isHidden ? '#6EE7B7' : 'var(--border)'}`,
                            background: isHidden ? '#ECFDF5' : '#fff',
                            color: isHidden ? '#059669' : 'var(--text-secondary)',
                            cursor: 'pointer', fontFamily: 'inherit',
                          }}>
                          {isHidden ? '공개' : '숨김'}
                        </button>
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

                  {/* 내용 + 댓글 */}
                  {isOpen && (
                    <div style={{ padding: '0 24px 20px', borderTop: '1px solid var(--border)' }}>
                      <div style={{ paddingTop: '16px' }}>
                        {renderContent(notice.content || '(내용 없음)')}
                      </div>
                      <NoticeComments noticeId={notice.rowIndex} isCO1={!!canEdit} />
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
