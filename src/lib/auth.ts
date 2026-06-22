/**
 * NextAuth.js 설정 — Google OAuth + 역할 매핑
 *
 * 로그인 흐름:
 *   1. 사용자가 Google 로그인 버튼 클릭
 *   2. Google OAuth → 이메일 반환
 *   3. user_permissions 시트에서 이메일로 역할 조회
 *   4. 역할이 없으면 로그인 거부 (화이트리스트 방식)
 *   5. 세션에 역할·권한 플래그 저장
 */

import type { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { getUserRoleByEmail } from '@/lib/sheets'
import { getPolicyByRole } from '@/lib/rolePolicy'
import type { UserRole } from '@/types'

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],

  pages: {
    signIn:  '/login',
    error:   '/login',
  },

  callbacks: {
    /**
     * signIn — Google 로그인 시 user_permissions 시트에서 권한 확인
     * 시트에 없는 이메일은 로그인 거부
     */
    async signIn({ user }) {
      if (!user.email) return false
      const permission = await getUserRoleByEmail(user.email)
      if (!permission) return '/login?error=unauthorized'
      return true
    },

    /**
     * jwt — 최초 로그인 + 5분마다 Sheets에서 역할 재검증
     *
     * 핵심 보안: 삭제된 사용자는 최대 5분 내에 접근 차단됨.
     * token.email은 NextAuth가 OAuth에서 자동 주입하므로 항상 존재.
     */
    async jwt({ token, user }) {
      const now = Math.floor(Date.now() / 1000)
      const RECHECK_SECS = 5 * 60 // 5분마다 Sheets 재조회

      const email = user?.email || (token.email as string | undefined)
      if (!email) return token

      const lastCheck = (token.roleCheckedAt as number) || 0
      const needsCheck = !!user?.email || (now - lastCheck) > RECHECK_SECS

      if (needsCheck) {
        const permission = await getUserRoleByEmail(email)
        if (!permission) {
          // 시트에서 삭제된 사용자 — 역할 박탈
          token.role          = null
          token.userName      = ''
          token.rowIndex      = undefined
        } else {
          token.role          = permission.role as UserRole
          token.userName      = permission.name || user?.name || (token.userName as string) || ''
          token.rowIndex      = permission.rowIndex
        }
        token.roleCheckedAt = now
      }
      return token
    },

    /**
     * session — 세션에 역할 + 권한 플래그 노출
     * role이 null이면 권한 없음 (삭제된 사용자)
     */
    async session({ session, token }) {
      const role = (token.role as UserRole | null) ?? null

      ;(session.user as any).role     = role
      ;(session.user as any).userName = token.userName || ''
      ;(session.user as any).rowIndex = token.rowIndex

      if (!role) {
        // 삭제된 사용자 — 빈 권한 세트
        ;(session.user as any).can = {}
        return session
      }

      const policy = getPolicyByRole(role)
      ;(session.user as any).can = {
        schedule_view:       policy.schedule_view,
        schedule_edit_links: policy.schedule_edit_links,
        dashboard_view:      policy.dashboard_view,
        dashboard_edit:      policy.dashboard_edit,
        record_view:         policy.record_view,
        record_write:        policy.record_write,
        video_view:          policy.video_view,
        video_edit_url:      policy.video_edit_url,
        settings_view:       policy.settings_view,
        settings_edit:       policy.settings_edit,
        resume_parse:        policy.resume_parse,
      }

      return session
    },
  },

  session: {
    strategy: 'jwt',
    maxAge:   30 * 24 * 60 * 60, // 30일 (토큰 만료는 30일, role은 5분마다 재검증)
  },

  secret: process.env.NEXTAUTH_SECRET,
}
