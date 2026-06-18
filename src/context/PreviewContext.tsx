'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useSession } from 'next-auth/react'

export type PreviewMode = 'off' | 'member' | 'intern' | 'intern-test'

interface PreviewContextValue {
  previewMode: PreviewMode
  previewInternName: string
  internsList: { name: string; job: string; type: string }[]
  setPreviewMode: (mode: PreviewMode) => void
  setPreviewInternName: (name: string) => void
  effectiveRole: string | undefined
  isCO1Real: boolean
}

const PreviewContext = createContext<PreviewContextValue>({
  previewMode: 'off',
  previewInternName: '',
  internsList: [],
  setPreviewMode: () => {},
  setPreviewInternName: () => {},
  effectiveRole: undefined,
  isCO1Real: false,
})

export function PreviewProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession()
  const role = (session?.user as any)?.role as string | undefined
  const isCO1Real = role === 'CO1'

  const [previewMode, setPreviewModeState] = useState<PreviewMode>('off')
  const [previewInternName, setPreviewInternName] = useState('')
  const [internsList, setInternsList] = useState<{ name: string; job: string; type: string }[]>([])

  useEffect(() => {
    if (!isCO1Real) { setPreviewModeState('off'); setPreviewInternName('') }
  }, [isCO1Real])

  useEffect(() => {
    if (!isCO1Real || status !== 'authenticated') return
    fetch('/api/interns').then(r => r.json()).then(d => setInternsList(d.interns ?? [])).catch(() => {})
  }, [isCO1Real, status])

  const effectiveRole: string | undefined = isCO1Real
    ? (previewMode === 'off' ? 'CO1' : previewMode === 'member' ? 'Member' : 'Intern')
    : role

  function setPreviewMode(mode: PreviewMode) {
    setPreviewModeState(mode)
    // intern ↔ intern-test 전환 시 선택된 인턴 유지
    if (mode !== 'intern' && mode !== 'intern-test') setPreviewInternName('')
  }

  return (
    <PreviewContext.Provider value={{
      previewMode, previewInternName, internsList,
      setPreviewMode, setPreviewInternName,
      effectiveRole, isCO1Real,
    }}>
      {children}
    </PreviewContext.Provider>
  )
}

export function usePreview() {
  return useContext(PreviewContext)
}
