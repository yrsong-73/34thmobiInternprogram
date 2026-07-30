// ──────────────────────────────────────────────
// 역할 타입
// ──────────────────────────────────────────────

/** CO1: 담당자, Member: 직원 참관, Intern: 인턴 */
export type UserRole = 'CO1' | 'Member' | 'Intern'

export interface AuthUser {
  id: string
  name: string
  email: string
  role: UserRole
  rowIndex?: number // Sheets 행 인덱스 (수정 시 사용)
}

// ──────────────────────────────────────────────
// 인턴 데이터
// ──────────────────────────────────────────────

export type InternJobType = 'marketing' | 'aiax' | 'biz'

export interface Intern {
  name: string
  job: string                // '마케팅' | '마케팅(PM)' | 'AI·AX' | '사업기획·전략'
  type: InternJobType
  mbti: string
  age: string
  school: string
  career: string
  score_mini: number         // 미니테스트 점수
  score_test: number         // 최종 테스트 점수
  score_attitude: number     // 태도 점수 (1~5)
  attend_rate: number        // 출석률 (%)
  assign_rate: number        // 과제 완수율 (%)
  attend_note?: string       // 지각/결석 메모 (예: 지각 1회/병원)
  summary: string            // 종합 코멘트
  test_top?: string          // TEST 상위 2과목
  test_bottom?: string       // TEST 하위 2과목
  final_summary?: string     // P열 — 최종 요약 (마사부 리더 공개용, HRBP 작성)
  final_summary_public?: boolean // Q열 — 리더 공개 여부
  is_active?: boolean        // R열 — 재직 여부 (없으면 true, 'false' = 퇴사)
  rowIndex?: number          // Sheets 행 번호 (수정 시 사용)
}

// ──────────────────────────────────────────────
// 관찰 기록
// ──────────────────────────────────────────────

export interface Record {
  intern: string     // 인턴 이름
  author: string     // 작성자 이름
  date: string       // 작성 날짜 (YYYY-MM-DD)
  content: string    // 기록 내용
  created_at?: string
  rowIndex?: number
}

// ──────────────────────────────────────────────
// 시간표 (Google Sheets 기반 — 수정 가능)
// ──────────────────────────────────────────────

export type LectureType = 'online' | 'offline' | 'self' | 'exam' | 'task' | 'lunch'

/**
 * Sheets `schedule` 시트의 한 행 = 강의 1개
 *
 * 컬럼 순서:
 * A: week_num   B: day_num    C: day_label   D: date_label
 * E: eval_label F: 교육 흐름  G: time        H: name
 * I: type       J: teacher    K: duration    L: link_labels (콤마 구분)
 * M: link_urls  (콤마 구분)   N: lunch_with  O: note
 * P: job_types  (all | marketing | aiax | biz, 콤마 구분)
 * Q: count_for_rate (y/빈칸)  R: location    S: week_variant
 */
export interface ScheduleRow {
  rowIndex: number
  week_num: number           // 1 또는 2
  day_num: number            // 1~12 (일차)
  day_label: string          // '1일차'
  date_label: string         // '6/22 월'
  eval_label: string         // 'DAY1 강의평가' or ''
  eval_link?: string         // 강의평가 링크 URL (T열)
  time: string               // '10:00~10:30'
  name: string               // 강의명
  type: LectureType          // 강의 형태
  teacher: string            // 강사 이름 (없으면 '-')
  duration: string           // '1h'
  link_labels: string[]      // ['교안', '자료']
  link_urls: string[]        // ['https://...', '']
  lunch_with: string         // 웰컴런치 동행자 (예: '송유림, 김연준')
  note: string               // 비고
  job_types: string[]        // ['all'] or ['marketing','aiax'] 등
  count_for_rate?: boolean   // 수강체크율 분모에 포함 여부 (Q열)
  location?: string          // 강의 장소 (R열)
  flow_stage?: string        // F열 교육 흐름 — '회사의 이해'|'일잘러 입문'|'직무 기초'|'직무 심화'|'시험 및 과제'
  week_variant?: string      // S열 — 'A'|'B'|'' (빈칸=모두 표시, Week 2 A/B 버전 구분)
  has_practice?: boolean      // U열 — 실습이 있었던 강의 여부 (시트에서 직접 관리)
  feedback_exclude?: boolean  // V열 — 피드백 평가 제외 여부 (y = 제외, 시트에서 직접 관리)
  has_assignment?: boolean       // W열 — 이 강의에 별도 제출 과제가 딸려있는지 (일반 강의도 과제 제출란에 표시됨)
  assignment_deadline?: string   // X열 — 과제 마감일 (YYYY-MM-DD)
}

/** 하루 단위 묶음 (UI 렌더링용) */
export interface DayGroup {
  day_num: number
  day_label: string
  date_label: string
  eval_label: string
  eval_link?: string
  lectures: ScheduleRow[]
}

// ──────────────────────────────────────────────
// 영상 뷰어
// ──────────────────────────────────────────────

export interface VideoLecture {
  name: string
  teacher: string
  duration: string
  type: string
  videoUrl: string         // Sheets에서 관리
}

export interface VideoDay {
  dayKey: string           // 'day1', 'day2' ...
  label: string            // '1일차 - 6/22 (월)'
  lectures: VideoLecture[]
}

// ──────────────────────────────────────────────
// 권한 관리
// ──────────────────────────────────────────────

export interface UserPermission {
  email: string
  name: string
  role: UserRole
  created_at?: string
  rowIndex?: number
}

// ──────────────────────────────────────────────
// 공지 댓글
// ──────────────────────────────────────────────

export interface NoticeComment {
  rowIndex: number
  notice_id: number   // 부모 공지 rowIndex
  author: string
  content: string
  created_at: string
  role: string        // CO1 | Member | Intern
}

// ──────────────────────────────────────────────
// 설정
// ──────────────────────────────────────────────

export interface AppSettings {
  intern_batch: string       // '34'
  start_date: string         // '2026-06-22'
  drive_folder_url: string   // Google Drive 마스터 폴더 URL
  submit_folder_url: string  // 과제 제출 폴더 URL
  job_visible_marketing: boolean
  job_visible_aiax: boolean
  job_visible_biz: boolean
  week_2_visible: boolean
  related_link_1_label: string  // 대시보드 "관련 자료 링크" 1번 (기수별로 다름)
  related_link_1_url: string
  related_link_2_label: string // 대시보드 "관련 자료 링크" 2번
  related_link_2_url: string
}

// ──────────────────────────────────────────────
// 기수 (cohort) — 마스터 스프레드시트의 cohorts 탭
// ──────────────────────────────────────────────

export interface Cohort {
  batch: string       // '34'
  label: string       // '34기'
  sheetId: string     // 해당 기수 데이터 스프레드시트 ID
  isActive: boolean   // 현재 사이트에 연결된 활성 기수 여부
  createdAt: string
}

// ──────────────────────────────────────────────
// 강의 피드백 (feedbacks 시트)
//
// 컬럼: A=timestamp  B=intern_name  C=lecture_name  D=lecture_date
//       E=q1  F=q2  G=q3  H=q4  I=q5  J=q6  K=q7  L=q8  M=q9
// ──────────────────────────────────────────────

export interface LectureFeedback {
  rowIndex?: number
  timestamp: string
  intern_name: string
  lecture_name: string
  lecture_date: string
  q1_satisfaction: number    // 전반 만족도
  q2_structure: number       // 교육 구성·흐름
  q3_depth: number           // 내용 깊이 적절성
  q4_explanation: number     // 설명·예시의 이해 도움
  q5_practical: number       // 실무 활용 가능성
  q6_practice?: number       // 실습 (선택 — has_practice 여부에 따라 다른 의미)
  q7_helpful: string         // 가장 도움이 된 내용
  q8_difficult: string       // 이해하기 어려웠던 내용
  q9_improvement: string     // 불필요하거나 개선이 필요한 점
}

// ──────────────────────────────────────────────
// CO1 강사 평가 (co1_feedbacks 시트)
//
// 컬럼: A=timestamp  B=evaluator  C=lecture_name  D=lecture_teacher  E=lecture_date
//       F=form_type  G=content_fit  H=practical  I=difficulty  J=time_mgmt
//       K=instructor_quality  L=material_checks  M=opinion_content
//       N=opinion_instructor  O=opinion_qa  P=practice_type  Q=practice_memo
// ──────────────────────────────────────────────

export interface CO1Feedback {
  rowIndex?: number
  timestamp: string
  evaluator: string           // 평가자 (로그인 이름)
  lecture_name: string
  lecture_teacher: string
  lecture_date: string
  form_type: string           // 이론 중심 | 실습 중심 | 이론+실습 혼합
  content_fit: string         // 명확·부합 | 보통 | 미흡
  practical: string           // 높음 | 보통 | 낮음
  difficulty: string          // 쉬움 | 적당 | 어려움
  time_mgmt: string           // 적정 | 짧음 | 김
  instructor_quality: string  // 잘함 | 보통 | 미흡
  material_checks: string     // 콤마 구분: 내용 충실,예시 활용,디자인 우수
  opinion_content: string     // 강의 내용·구성 개선 의견
  opinion_instructor: string  // 강사·전달 관련 코멘트
  opinion_qa: string          // 질문 및 소통 내용 기록
  practice_type?: string      // 실습 형태 (실습/혼합일 때만)
  practice_memo?: string      // 실습 관련 메모
}

// ──────────────────────────────────────────────
// 공지 게시판
// ──────────────────────────────────────────────

export interface Notice {
  rowIndex: number
  title: string
  content: string
  author: string
  created_at: string
  visible: boolean  // E열: 빈칸/'true' = 공개, 'false' = 숨김
}
