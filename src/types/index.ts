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

export type InternJobType = 'marketing' | 'marketing_pm' | 'aiax' | 'biz'

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
 * Q: count_for_rate (y/빈칸)  R: location
 */
export interface ScheduleRow {
  rowIndex: number
  week_num: number           // 1 또는 2
  day_num: number            // 1~12 (일차)
  day_label: string          // '1일차'
  date_label: string         // '6/22 월'
  eval_label: string         // 'DAY1 강의평가' or ''
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
  flow_stage?: string        // 교육 흐름 단계 — F열 직접 입력 ('회사의 이해'|'직무 기초'|'직무 심화'|'시험 및 과제')
}

/** 하루 단위 묶음 (UI 렌더링용) */
export interface DayGroup {
  day_num: number
  day_label: string
  date_label: string
  eval_label: string
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
}
