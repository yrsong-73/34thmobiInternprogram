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
      // 권한 없는 사용자 차단
      if (!permission) return '/login?error=unauthorized'
      return true
    },

    /**
     * jwt — 로그인 직후 토큰에 역할 정보 저장
     */
    async jwt({ token, user }) {
      // 최초 로그인 시에만 user 객체 존재
      if (user?.email) {
        const permission = await getUserRoleByEmail(user.email)
        if (permission) {
          token.role     = permission.role as UserRole
          token.userName = permission.name || user.name || ''
          token.rowIndex = permission.rowIndex
        } else {
          token.role     = 'Intern' as UserRole
          token.userName = user.name || ''
        }
      }
      return token
    },

    /**
     * session — 세션에 역할 + 권한 플래그 노출
     */
    async session({ session, token }) {
      const role = (token.role as UserRole) || 'Intern'
      const policy = getPolicyByRole(role)

      ;(session.user as any).role     = role
      ;(session.user as any).userName = token.userName
      ;(session.user as any).rowIndex = token.rowIndex

      // 권한 플래그 (클라이언트에서 바로 사용 가능)
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
    maxAge:   30 * 24 * 60 * 60, // 30일
  },

  secret: process.env.NEXTAUTH_SECRET,
}
