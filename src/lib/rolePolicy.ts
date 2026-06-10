import type { UserRole } from '@/types'

// ──────────────────────────────────────────────
// 역할별 기능 권한 정의
// ──────────────────────────────────────────────

export type RolePolicy = {
  // 시간표
  schedule_view: boolean       // 시간표 열람
  schedule_edit_links: boolean // 강의자료 링크 수정
  // 대시보드
  dashboard_view: boolean      // 인턴 대시보드 열람
  dashboard_edit: boolean      // 인턴 정보 수정 (점수, 요약 등)
  // 기록표
  record_view: boolean         // 기록표 열람
  record_write: boolean        // 기록 작성
  // 영상 뷰어
  video_view: boolean          // 영상 시청
  video_edit_url: boolean      // 영상 URL 수정
  // 권한 관리
  settings_view: boolean       // 권한 관리 탭 열람
  settings_edit: boolean       // 권한 추가/수정/삭제
  // 이력서 파싱 (Claude API)
  resume_parse: boolean
}

// ──────────────────────────────────────────────
// 역할별 기본 정책
// ──────────────────────────────────────────────

export const DEFAULT_POLICIES: Record<UserRole, RolePolicy> = {
  CO1: {
    schedule_view:       true,
    schedule_edit_links: true,   // 담당자만 링크 수정 가능
    dashboard_view:      true,
    dashboard_edit:      true,   // 담당자만 점수/코멘트 수정 가능
    record_view:         true,
    record_write:        true,   // 담당자만 기록 작성 가능
    video_view:          true,
    video_edit_url:      true,   // 담당자만 영상 URL 수정 가능
    settings_view:       true,
    settings_edit:       true,
    resume_parse:        true,
  },
  Member: {
    schedule_view:       true,
    schedule_edit_links: false,
    dashboard_view:      true,   // 열람은 가능
    dashboard_edit:      false,
    record_view:         false,
    record_write:        false,
    video_view:          true,
    video_edit_url:      false,
    settings_view:       false,
    settings_edit:       false,
    resume_parse:        false,
  },
  Intern: {
    schedule_view:       true,
    schedule_edit_links: false,
    dashboard_view:      false,  // 인턴은 대시보드 접근 불가
    dashboard_edit:      false,
    record_view:         false,  // 인턴은 기록표 접근 불가
    record_write:        false,
    video_view:          true,
    video_edit_url:      false,
    settings_view:       false,
    settings_edit:       false,
    resume_parse:        false,
  },
}

/** 역할로 정책 가져오기 */
export function getPolicyByRole(role: UserRole): RolePolicy {
  return DEFAULT_POLICIES[role] ?? DEFAULT_POLICIES['Intern']
}

/** 특정 기능 접근 가능 여부 */
export function can(role: UserRole, feature: keyof RolePolicy): boolean {
  return getPolicyByRole(role)[feature] ?? false
}
