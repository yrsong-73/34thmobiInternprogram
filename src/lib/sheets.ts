/**
 * Google Sheets API 연동 모듈
 *
 * 환경변수:
 *   GOOGLE_MASTER_SHEET_ID     — 기수 목록을 관리하는 마스터 스프레드시트 ID (고정, 절대 바뀌지 않음)
 *   GOOGLE_SHEET_ID            — (마이그레이션 대비 폴백) 마스터 시트에 활성 기수가 없을 때 사용할 기본 스프레드시트 ID
 *   GOOGLE_SERVICE_ACCOUNT_KEY — 서비스 계정 JSON 한 줄 문자열
 *
 * 실제 데이터(interns/records/schedule/... )는 "활성 기수"의 스프레드시트에서 읽고 쓴다.
 * 활성 기수 및 "기수 → 스프레드시트 ID" 매핑은 마스터 스프레드시트의 `cohorts` 탭에 저장된다.
 */

import { google } from 'googleapis'
import type { Intern, Record as InternRecord, UserPermission, AppSettings, ScheduleRow, Notice, NoticeComment, LectureFeedback, CO1Feedback, Cohort } from '@/types'

// ──────────────────────────────────────────────
// 인증 초기화
// ──────────────────────────────────────────────

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY 환경변수가 없습니다')

  const credentials = JSON.parse(raw)
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

function getSheets() {
  return google.sheets({ version: 'v4', auth: getAuth() })
}

// ──────────────────────────────────────────────
// 마스터 스프레드시트 — 기수(cohort) 관리
//
// `cohorts` 탭 컬럼: batch | label | sheet_id | is_active | created_at
// ──────────────────────────────────────────────

const MASTER_SHEET_ID = process.env.GOOGLE_MASTER_SHEET_ID!

async function readMasterSheet(range: string): Promise<string[][]> {
  const sheets = getSheets()
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: MASTER_SHEET_ID, range })
  return (res.data.values as string[][]) || []
}

function rowsToCohorts(rows: string[][]): Cohort[] {
  return rows
    .filter(r => r[0])
    .map(r => ({
      batch:     r[0],
      label:     r[1] || `${r[0]}기`,
      sheetId:   r[2] || '',
      isActive:  r[3]?.toLowerCase() === 'true',
      createdAt: r[4] || '',
    }))
}

export async function getCohorts(): Promise<Cohort[]> {
  const rows = await readMasterSheet('cohorts!A2:E')
  return rowsToCohorts(rows)
}

export async function getActiveCohort(): Promise<Cohort | null> {
  const cohorts = await getCohorts()
  return cohorts.find(c => c.isActive) ?? cohorts[0] ?? null
}

export async function addCohort(batch: string, label: string, sheetId: string): Promise<void> {
  const sheets = getSheets()
  const now = new Date().toISOString()
  await sheets.spreadsheets.values.append({
    spreadsheetId: MASTER_SHEET_ID,
    range: 'cohorts!A1',
    valueInputOption: 'RAW',
    requestBody: { values: [[batch, label, sheetId, '', now]] },
  })
}

export async function setActiveCohort(batch: string): Promise<void> {
  const sheets = getSheets()
  const rows = await readMasterSheet('cohorts!A2:E')
  const data = rows
    .map((r, i) => ({ range: `cohorts!D${i + 2}`, values: [[r[0] === batch ? 'true' : 'false']] }))
    .filter((_, i) => rows[i][0])
  if (data.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: MASTER_SHEET_ID,
      requestBody: { valueInputOption: 'RAW', data },
    })
  }
  activeSheetIdCache = null
}

// 활성 기수의 스프레드시트 ID — 매 요청마다 마스터 시트를 조회하지 않도록 짧은 TTL 캐시
let activeSheetIdCache: { value: string; expiresAt: number } | null = null
const ACTIVE_SHEET_CACHE_TTL_MS = 30_000

async function getActiveSheetId(): Promise<string> {
  const now = Date.now()
  if (activeSheetIdCache && activeSheetIdCache.expiresAt > now) return activeSheetIdCache.value

  // 마스터 시트 조회가 실패해도(미설정/미공유/일시적 오류) 로그인·서비스가 끊기지 않도록
  // GOOGLE_SHEET_ID로 폴백한다 — CO1이 항상 접속해 설정을 고칠 수 있어야 하기 때문.
  let cohort: Cohort | null = null
  try {
    cohort = await getActiveCohort()
  } catch {
    cohort = null
  }
  const value = cohort?.sheetId || process.env.GOOGLE_SHEET_ID || ''
  if (!value) throw new Error('활성 기수의 스프레드시트가 설정되지 않았습니다')

  activeSheetIdCache = { value, expiresAt: now + ACTIVE_SHEET_CACHE_TTL_MS }
  return value
}

// ──────────────────────────────────────────────
// 공통 유틸 (활성 기수의 스프레드시트 대상)
// ──────────────────────────────────────────────

async function readSheet(range: string): Promise<string[][]> {
  const sheets = getSheets()
  const spreadsheetId = await getActiveSheetId()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  })
  return (res.data.values as string[][]) || []
}

/** @returns 새로 추가된 행의 1-based rowIndex (파싱 실패 시 -1) */
async function appendRow(sheetName: string, values: (string | number)[]): Promise<number> {
  const sheets = getSheets()
  const spreadsheetId = await getActiveSheetId()
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [values] },
  })
  const updatedRange = res.data.updates?.updatedRange || ''
  const match = updatedRange.match(/![A-Za-z]+(\d+)/)
  return match ? Number(match[1]) : -1
}

async function updateRow(
  sheetName: string,
  rowIndex: number,         // 1-based (헤더 포함)
  values: (string | number)[]
): Promise<void> {
  const sheets = getSheets()
  const spreadsheetId = await getActiveSheetId()
  const range = `${sheetName}!A${rowIndex}:Z${rowIndex}`
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [values] },
  })
}

async function clearRow(sheetName: string, rowIndex: number): Promise<void> {
  const sheets = getSheets()
  const spreadsheetId = await getActiveSheetId()
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${sheetName}!A${rowIndex}:Z${rowIndex}`,
  })
}

// ──────────────────────────────────────────────
// 인턴 목록 (interns 시트)
// 컬럼: name | job | type | mbti | age | school | career |
//       score_mini | score_test | score_attitude | attend_rate | assign_rate | summary |
//       test_top | test_bottom
// ──────────────────────────────────────────────

function jobToType(job: string): 'marketing' | 'aiax' | 'biz' {
  if (job.includes('AI') || job.includes('AX')) return 'aiax'
  if (job.includes('사업') || job.includes('전략')) return 'biz'
  return 'marketing'
}

export async function getInterns(): Promise<Intern[]> {
  const rows = await readSheet('interns!A2:S')
  return rows
    .filter(r => r[0])
    .map((r, i) => ({
      name:                 r[0] || '',
      job:                  r[1] || '',
      type:                 ((['marketing','aiax','biz'] as string[]).includes(r[2]) ? r[2] : jobToType(r[1])) as 'marketing' | 'aiax' | 'biz',
      mbti:                 r[3] || '',
      age:                  r[4] || '',
      school:               r[5] || '',
      career:               r[6] || '',
      score_mini:           Number(r[7]) || 0,
      score_test:           Number(r[8]) || 0,
      score_attitude:       Number(r[9]) || 0,
      attend_rate:          Number(r[10]) || 0,
      assign_rate:          Number(r[11]) || 0,
      summary:              r[12] || '',
      test_top:             r[13] || '',
      test_bottom:          r[14] || '',
      final_summary:        r[15] || '',
      final_summary_public: r[16]?.toLowerCase() === 'true',
      is_active:            r[17] === undefined || r[17] === '' || r[17]?.toLowerCase() !== 'false',
      attend_note:          r[18] || '',
      rowIndex:             i + 2,
    }))
}

export async function updateIntern(rowIndex: number, data: Partial<Intern>): Promise<void> {
  const rows = await readSheet(`interns!A${rowIndex}:S${rowIndex}`)
  const existing = rows[0] || []
  const merged = [
    data.name             ?? existing[0]  ?? '',
    data.job              ?? existing[1]  ?? '',
    data.type             ?? existing[2]  ?? '',
    data.mbti             ?? existing[3]  ?? '',
    data.age              ?? existing[4]  ?? '',
    data.school           ?? existing[5]  ?? '',
    data.career           ?? existing[6]  ?? '',
    data.score_mini       ?? existing[7]  ?? '',
    data.score_test       ?? existing[8]  ?? '',
    data.score_attitude   ?? existing[9]  ?? '',
    data.attend_rate      ?? existing[10] ?? '',
    data.assign_rate      ?? existing[11] ?? '',
    data.summary          ?? existing[12] ?? '',
    data.test_top         ?? existing[13] ?? '',
    data.test_bottom      ?? existing[14] ?? '',
    data.final_summary          !== undefined ? data.final_summary          : (existing[15] ?? ''),
    data.final_summary_public   !== undefined ? (data.final_summary_public ? 'true' : '') : (existing[16] ?? ''),
    data.is_active              !== undefined ? (data.is_active ? 'true' : 'false')       : (existing[17] ?? ''),
    data.attend_note            !== undefined ? data.attend_note                           : (existing[18] ?? ''),
  ]
  await updateRow('interns', rowIndex, merged)
}

// ──────────────────────────────────────────────
// 관찰 기록 (records 시트)
// 컬럼: intern_name | author | date | content | created_at
// ──────────────────────────────────────────────

export async function getRecords(): Promise<InternRecord[]> {
  const rows = await readSheet('records!A2:E')
  return rows
    .map((r, i) => ({ r, rowIndex: i + 2 }))
    .filter(({ r }) => r[0])
    .map(({ r, rowIndex }) => ({
      intern:      r[0] || '',
      author:      r[1] || '',
      date:        r[2] || '',
      content:     r[3] || '',
      created_at:  r[4] || '',
      rowIndex,
    }))
}

export async function addRecord(data: Omit<InternRecord, 'rowIndex'>): Promise<void> {
  const now = new Date().toISOString()
  await appendRow('records', [data.intern, data.author, data.date, data.content, now])
}

export async function deleteRecord(rowIndex: number): Promise<void> {
  const sheets = getSheets()
  const spreadsheetId = await getActiveSheetId()
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId })
  const sheet = spreadsheet.data.sheets?.find(s => s.properties?.title === 'records')
  if (!sheet || sheet.properties?.sheetId == null) throw new Error('records 시트를 찾을 수 없습니다')
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId: sheet.properties.sheetId,
            dimension: 'ROWS',
            startIndex: rowIndex - 1, // 0-based
            endIndex: rowIndex,        // exclusive
          },
        },
      }],
    },
  })
}

// ──────────────────────────────────────────────
// 영상 링크 (video_links 시트)
// 컬럼: day_key | lecture_name | video_url | updated_at
// ──────────────────────────────────────────────

export async function getVideoLinks(): Promise<{ dayKey: string; lectureName: string; videoUrl: string }[]> {
  const rows = await readSheet('video_links!A2:D')
  return rows
    .filter(r => r[0])
    .map(r => ({
      dayKey:      r[0] || '',
      lectureName: r[1] || '',
      videoUrl:    r[2] || '',
    }))
}

export async function upsertVideoLink(
  dayKey: string,
  lectureName: string,
  videoUrl: string
): Promise<void> {
  const rows = await readSheet('video_links!A2:D')
  const idx = rows.findIndex(r => r[0] === dayKey && r[1] === lectureName)
  const now = new Date().toISOString()

  if (idx >= 0) {
    await updateRow('video_links', idx + 2, [dayKey, lectureName, videoUrl, now])
  } else {
    await appendRow('video_links', [dayKey, lectureName, videoUrl, now])
  }
}

// ──────────────────────────────────────────────
// 사용자 권한 (user_permissions 시트)
// 컬럼: email | name | role | created_at
// ──────────────────────────────────────────────

export async function getUserPermissions(): Promise<UserPermission[]> {
  const rows = await readSheet('user_permissions!A2:D')
  return rows
    .filter(r => r[0])
    .map((r, i) => ({
      email:      r[0]?.trim() || '',
      name:       r[1] || '',
      role:       (r[2] as any) || 'Intern',
      created_at: r[3] || '',
      rowIndex:   i + 2,
    }))
}

export async function getUserRoleByEmail(email: string): Promise<UserPermission | null> {
  const users = await getUserPermissions()
  return users.find(u => u.email.toLowerCase() === email.toLowerCase()) ?? null
}

export async function addUserPermission(data: Omit<UserPermission, 'rowIndex' | 'created_at'>): Promise<void> {
  const now = new Date().toISOString()
  await appendRow('user_permissions', [data.email, data.name, data.role, now])
}

export async function updateUserPermission(rowIndex: number, data: Partial<UserPermission>): Promise<void> {
  const rows = await readSheet(`user_permissions!A${rowIndex}:D${rowIndex}`)
  const existing = rows[0] || []
  await updateRow('user_permissions', rowIndex, [
    data.email ?? existing[0] ?? '',
    data.name  ?? existing[1] ?? '',
    data.role  ?? existing[2] ?? '',
    existing[3] ?? new Date().toISOString(),
  ])
}

export async function deleteUserPermission(rowIndex: number): Promise<void> {
  await clearRow('user_permissions', rowIndex)
}

// ──────────────────────────────────────────────
// 앱 설정 (settings 시트)
// 컬럼: key | value
// ──────────────────────────────────────────────

export async function getSettings(): Promise<AppSettings> {
  const rows = await readSheet('settings!A2:B')
  const map: Record<string, string> = {}
  rows.forEach(r => { if (r[0]) map[r[0]] = r[1] || '' })
  return {
    intern_batch:           map['intern_batch']           || '34',
    start_date:             map['start_date']             || '',
    drive_folder_url:       map['drive_folder_url']       || '',
    submit_folder_url:      map['submit_folder_url']      || '',
    job_visible_marketing:  map['job_visible_marketing']  !== 'false',
    job_visible_aiax:       map['job_visible_aiax']       !== 'false',
    job_visible_biz:        map['job_visible_biz']        !== 'false',
    week_2_visible:         map['week_2_visible']         === 'true',
    related_link_1_label:  map['related_link_1_label']  || '',
    related_link_1_url:    map['related_link_1_url']    || '',
    related_link_2_label:  map['related_link_2_label']  || '',
    related_link_2_url:    map['related_link_2_url']    || '',
    mgmt_link_1_label: map['mgmt_link_1_label'] || '인턴십 구글 시트',
    mgmt_link_1_url:   map['mgmt_link_1_url']   || 'https://docs.google.com/spreadsheets/d/1fk-BF_q5YOeQ-UsWiZUNIZmWBY2AFZyyihhiBFG9RpE/edit?usp=sharing',
    mgmt_link_2_label: map['mgmt_link_2_label'] || '인턴페이지 마스터 시트',
    mgmt_link_2_url:   map['mgmt_link_2_url']   || 'https://docs.google.com/spreadsheets/d/1UoXtVftP9lQ2lrAvEZaBL14cKUfa5ibv3xSpufh11NI/edit',
    mgmt_link_3_label: map['mgmt_link_3_label'] || '인턴십 마스터 폴더',
    mgmt_link_3_url:   map['mgmt_link_3_url']   || 'https://drive.google.com/drive/folders/1hDYi09JBYyzlafyYENvlVWCxvuZWl7sd?usp=drive_link',
    mgmt_link_4_label: map['mgmt_link_4_label'] || '[모비 인턴] 배치 희망 팀 조사 (응답결과)',
    mgmt_link_4_url:   map['mgmt_link_4_url']   || 'https://docs.google.com/spreadsheets/d/1sSs6mPgoj7jzn3yblcTUE5woMKK8GMMigQaBFNHfuf0/edit?usp=drive_link',
    mgmt_link_5_label: map['mgmt_link_5_label'] || '2026 모비인턴십 테스트 피드백 (응답결과)',
    mgmt_link_5_url:   map['mgmt_link_5_url']   || 'https://docs.google.com/spreadsheets/d/1Fu5wtCwFrz_fKoN8FSgqCCaaoxnLx1X9flhGT_pl8pU/edit?usp=drive_link',
  }
}

export async function updateSettingKey(key: string, value: string): Promise<void> {
  const rows = await readSheet('settings!A2:B')
  const rowIdx = rows.findIndex(r => r[0] === key)
  if (rowIdx >= 0) {
    await updateRow('settings', rowIdx + 2, [key, value])
  } else {
    await appendRow('settings', [key, value])
  }
}

// ──────────────────────────────────────────────
// 공지 게시판 (notices 시트)
// 컬럼: A=title  B=content  C=author  D=created_at
// ──────────────────────────────────────────────

export async function getNotices(): Promise<Notice[]> {
  try {
    const rows = await readSheet('notices!A2:E')
    return rows
      .map((r, i) => ({
        rowIndex: i + 2,
        title: r[0] || '', content: r[1] || '', author: r[2] || '', created_at: r[3] || '',
        visible: r[4] !== 'false',
      }))
      .filter(n => n.title)
      .reverse()
  } catch { return [] }
}

async function ensureNoticesSheet(): Promise<void> {
  const sheets = getSheets()
  const spreadsheetId = await getActiveSheetId()
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId })
  const exists = spreadsheet.data.sheets?.some(s => s.properties?.title === 'notices')
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: 'notices' } } }] },
    })
    await appendRow('notices', ['title', 'content', 'author', 'created_at', 'visible'])
  }
}

export async function addNotice(data: Omit<Notice, 'rowIndex' | 'visible'>): Promise<void> {
  await ensureNoticesSheet()
  await appendRow('notices', [data.title, data.content, data.author, data.created_at, ''])
}

export async function updateNotice(rowIndex: number, data: Pick<Notice, 'title' | 'content'>): Promise<void> {
  const rows = await readSheet('notices!A2:E')
  const existing = rows[rowIndex - 2] ?? []
  await updateRow('notices', rowIndex, [data.title, data.content, existing[2] || '', existing[3] || '', existing[4] || ''])
}

export async function setNoticeVisible(rowIndex: number, visible: boolean): Promise<void> {
  const rows = await readSheet('notices!A2:E')
  const existing = rows[rowIndex - 2] ?? []
  await updateRow('notices', rowIndex, [existing[0] || '', existing[1] || '', existing[2] || '', existing[3] || '', visible ? '' : 'false'])
}

export async function deleteNotice(rowIndex: number): Promise<void> {
  const sheets = getSheets()
  const spreadsheetId = await getActiveSheetId()
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId })
  const sheet = spreadsheet.data.sheets?.find(s => s.properties?.title === 'notices')
  if (!sheet || sheet.properties?.sheetId == null) throw new Error('notices 시트를 찾을 수 없습니다')
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ deleteDimension: { range: { sheetId: sheet.properties.sheetId, dimension: 'ROWS', startIndex: rowIndex - 1, endIndex: rowIndex } } }] },
  })
}

// ──────────────────────────────────────────────
// 공지 댓글 (notice_comments 시트)
//
// 컬럼: A=notice_id  B=author  C=content  D=created_at  E=role
// ──────────────────────────────────────────────

async function ensureNoticeCommentsSheet(): Promise<void> {
  const sheets = getSheets()
  const spreadsheetId = await getActiveSheetId()
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId })
  const exists = spreadsheet.data.sheets?.some(s => s.properties?.title === 'notice_comments')
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: 'notice_comments' } } }] },
    })
    await appendRow('notice_comments', ['notice_id', 'author', 'content', 'created_at', 'role'])
  }
}

export async function getNoticeComments(noticeId: number): Promise<NoticeComment[]> {
  try {
    const rows = await readSheet('notice_comments!A2:E')
    return rows
      .map((r, i) => ({
        rowIndex: i + 2,
        notice_id: Number(r[0]) || 0,
        author: r[1] || '',
        content: r[2] || '',
        created_at: r[3] || '',
        role: r[4] || 'Intern',
      }))
      .filter(c => c.notice_id === noticeId && c.content)
  } catch { return [] }
}

export async function addNoticeComment(data: Omit<NoticeComment, 'rowIndex'>): Promise<void> {
  await ensureNoticeCommentsSheet()
  await appendRow('notice_comments', [data.notice_id, data.author, data.content, data.created_at, data.role])
}

export async function deleteNoticeComment(rowIndex: number): Promise<void> {
  const sheets = getSheets()
  const spreadsheetId = await getActiveSheetId()
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId })
  const sheet = spreadsheet.data.sheets?.find(s => s.properties?.title === 'notice_comments')
  if (!sheet || sheet.properties?.sheetId == null) throw new Error('notice_comments 시트를 찾을 수 없습니다')
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ deleteDimension: { range: { sheetId: sheet.properties.sheetId, dimension: 'ROWS', startIndex: rowIndex - 1, endIndex: rowIndex } } }] },
  })
}

// ──────────────────────────────────────────────
// 시간표 (schedule 시트) — 수정 가능
//
// 컬럼:
//  A: week_num  B: day_num   C: day_label  D: date_label
//  E: eval_label F: 교육 흐름  G: time     H: name
//  I: type      J: teacher   K: duration   L: link_labels (콤마)
//  M: link_urls (콤마)       N: lunch_with O: note
//  P: job_types (콤마, "all" = 전체)
// ──────────────────────────────────────────────

function parseComma(val: string | undefined): string[] {
  if (!val) return []
  return val.split(',').map(s => s.trim()).filter(Boolean)
}

export async function getScheduleRows(): Promise<ScheduleRow[]> {
  const rawRows = await readSheet('schedule!A2:X')
  const result: ScheduleRow[] = []
  rawRows.forEach((r, i) => {
    if (!r[0] || !r[7]) return // week_num, name 필수
    result.push({
      rowIndex:   i + 2,
      week_num:   Number(r[0]) || 1,
      day_num:    Number(r[1]) || 1,    // B열 숫자 (day_num)
      day_label:  r[2] || '',
      date_label: r[3] || '',
      eval_label: r[4] || '',
      flow_stage: r[5] || '',           // F열 = 교육 흐름 단계명 직접 읽기
      time:       r[6] || '',
      name:       r[7] || '',
      type:       (r[8] as any) || 'offline',
      teacher:    r[9] || '-',
      duration:   r[10] || '',
      link_labels: parseComma(r[11]),
      link_urls:   parseComma(r[12]),
      lunch_with:  r[13] || '',
      note:        r[14] || '',
      job_types:      parseComma(r[15]) || ['all'],
      count_for_rate: r[16]?.toLowerCase() === 'y',
      location:       r[17] || '',
      week_variant:   r[18] || '',
      eval_link:      r[19] || '',      // T열 = 강의평가 링크
      has_practice:      r[20]?.toLowerCase() === 'y', // U열 = 실습 있었던 강의 여부
      feedback_exclude:  r[21]?.toLowerCase() === 'y', // V열 = 피드백 제외 여부
      has_assignment:      r[22]?.toLowerCase() === 'y', // W열 = 과제 딸려있는 강의 여부
      assignment_deadline: r[23] || '',                  // X열 = 과제 마감일
    })
  })
  return result
}

function scheduleRowToValues(d: Omit<ScheduleRow, 'rowIndex'>): (string | number)[] {
  return [
    d.week_num,
    d.day_num,
    d.day_label,
    d.date_label,
    d.eval_label,
    d.flow_stage || '',   // F열 = 교육 흐름
    d.time,
    d.name,
    d.type,
    d.teacher,
    d.duration,
    d.link_labels.join(','),
    d.link_urls.join(','),
    d.lunch_with,
    d.note,
    d.job_types.join(','),
    d.count_for_rate ? 'y' : '',
    d.location || '',
    d.week_variant || '',
    d.eval_link || '',                  // T열 = 강의평가 링크
  ]
}

/** 강의 추가 */
export async function addScheduleRow(data: Omit<ScheduleRow, 'rowIndex'>): Promise<number> {
  return appendRow('schedule', scheduleRowToValues(data))
}

/** 강의 수정 */
export async function updateScheduleRow(rowIndex: number, data: Omit<ScheduleRow, 'rowIndex'>): Promise<void> {
  await updateRow('schedule', rowIndex, scheduleRowToValues(data))
}

const ALL_JOB_TYPES = ['marketing', 'aiax', 'biz']
function expandJobTypes(jobs: string[]): string[] {
  return jobs.includes('all') ? ALL_JOB_TYPES : jobs
}

export interface ScheduleSplitResult {
  createdRows: { jobType: string; rowIndex: number }[]
  reassignedCompletions: number
}

/**
 * 강의 수정 시 대상 직무(job_types)가 좁혀지면(예: 전체 → 마케팅만),
 * 빠진 직무마다 "수정 전" 원본 내용을 그대로 복제한 새 강의 행을 만든다 —
 * 같은 과정이라도 직무별로 시간이 달라져야 할 때 매번 새로 입력하지 않아도 되도록.
 * 이미 그 강의를 완료 체크한 인턴이 있다면, 인턴의 직무에 맞는 새 행으로 체크 기록도 옮긴다.
 */
export async function updateScheduleRowAndSplit(
  rowIndex: number,
  data: Omit<ScheduleRow, 'rowIndex'>
): Promise<ScheduleSplitResult> {
  const beforeRows = await getScheduleRows()
  const original = beforeRows.find(r => r.rowIndex === rowIndex)

  await updateScheduleRow(rowIndex, data)

  const result: ScheduleSplitResult = { createdRows: [], reassignedCompletions: 0 }
  if (!original) return result

  const beforeJobs = new Set(expandJobTypes(original.job_types))
  const afterJobs  = new Set(expandJobTypes(data.job_types ?? original.job_types))
  const removedJobs = ALL_JOB_TYPES.filter(j => beforeJobs.has(j) && !afterJobs.has(j))
  if (removedJobs.length === 0) return result

  const [interns, completions, permissions] = await Promise.all([
    getInterns(), getAllCompletions(), getUserPermissions(),
  ])
  const emailToType = new Map<string, string>()
  permissions.forEach(p => {
    if (p.role !== 'Intern') return
    const intern = interns.find(i => i.name === p.name)
    if (intern) emailToType.set(p.email.toLowerCase(), intern.type)
  })

  const { rowIndex: _omit, ...clonedBase } = original
  for (const job of removedJobs) {
    const newRowIndex = await addScheduleRow({ ...clonedBase, job_types: [job] })
    result.createdRows.push({ jobType: job, rowIndex: newRowIndex })

    // scheduleRowToValues가 W/X열은 쓰지 않으므로, 과제 정보가 있었다면 별도로 복제
    if (original.has_assignment) {
      await updateScheduleAssignment(newRowIndex, true, original.assignment_deadline || '')
    }

    const emails = new Set(
      completions
        .filter(c => c.scheduleRowIndex === rowIndex && emailToType.get(c.email.toLowerCase()) === job)
        .map(c => c.email.toLowerCase())
    )
    if (emails.size > 0) {
      result.reassignedCompletions += await reassignCompletionsScheduleRow(rowIndex, newRowIndex, emails)
    }
  }
  return result
}

/** 강의 삭제 (행 내용 클리어) */
export async function deleteScheduleRow(rowIndex: number): Promise<void> {
  await clearRow('schedule', rowIndex)
}

/** 강의평가(피드백) 대상 여부만 토글 — V열(feedback_exclude)만 갱신, 다른 필드는 건드리지 않음 */
export async function updateScheduleFeedbackExclude(rowIndex: number, excluded: boolean): Promise<void> {
  const sheets = getSheets()
  const spreadsheetId = await getActiveSheetId()
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `schedule!V${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[excluded ? 'y' : '']] },
  })
}

/** 강의에 딸린 제출 과제 정보만 갱신 — W(has_assignment)/X(assignment_deadline)열만 건드림 */
export async function updateScheduleAssignment(
  rowIndex: number,
  hasAssignment: boolean,
  deadline: string
): Promise<void> {
  const sheets = getSheets()
  const spreadsheetId = await getActiveSheetId()
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `schedule!W${rowIndex}:X${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[hasAssignment ? 'y' : '', hasAssignment ? deadline : '']] },
  })
}

const KOREAN_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/**
 * 새 시작일을 기준으로 전체 시간표의 date_label만 재계산해서 일괄 갱신한다
 * (day_label의 "N일차" 숫자로 새 날짜를 계산 — day_num은 트랙마다 값이 달라 신뢰할 수 없어 사용하지 않음).
 * date_label 컬럼(D열)만 건드리고 다른 필드는 전혀 손대지 않는다.
 */
export async function rescheduleDates(newStartDate: string): Promise<{ updated: number; skipped: number }> {
  const rows = await getScheduleRows()
  const start = new Date(`${newStartDate}T00:00:00`)
  const data: { range: string; values: string[][] }[] = []
  let skipped = 0

  for (const row of rows) {
    const match = row.day_label.match(/(\d+)/)
    if (!match) { skipped++; continue }
    const dayNum = Number(match[1])
    const d = new Date(start)
    d.setDate(d.getDate() + (dayNum - 1))
    const newLabel = `${d.getMonth() + 1}/${d.getDate()} ${KOREAN_WEEKDAYS[d.getDay()]}`
    if (newLabel !== row.date_label) {
      data.push({ range: `schedule!D${row.rowIndex}`, values: [[newLabel]] })
    }
  }

  if (data.length > 0) {
    const sheets = getSheets()
    const spreadsheetId = await getActiveSheetId()
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: 'RAW', data },
    })
  }

  await updateSettingKey('start_date', newStartDate)

  return { updated: data.length, skipped }
}


// ──────────────────────────────────────────────
// 교육 완료 체크 (completions 시트)
// 컬럼: email | schedule_row_index | checked_at | submission_url
//
// ※ Google Sheets에 'completions' 시트를 만들고
//    1행에 헤더(email / schedule_row_index / checked_at / submission_url)를 추가해주세요
// ──────────────────────────────────────────────

/** 특정 인턴의 완료된 강의 rowIndex 목록 (체크 + 과제 제출 모두 포함) */
export async function getCompletionsByEmail(email: string): Promise<number[]> {
  const rows = await readSheet('completions!A2:D')
  return rows
    .filter(r => r[0]?.toLowerCase() === email.toLowerCase() && r[1])
    .map(r => Number(r[1]))
    .filter(n => !isNaN(n))
}

/** 특정 인턴의 과제 제출 URL 맵 { scheduleRowIndex: submissionUrl } */
export async function getSubmissionsByEmail(email: string): Promise<Record<number, string>> {
  const rows = await readSheet('completions!A2:D')
  const map: Record<number, string> = {}
  rows
    .filter(r => r[0]?.toLowerCase() === email.toLowerCase() && r[1] && r[3])
    .forEach(r => { map[Number(r[1])] = r[3] })
  return map
}

/** CO1용 — 전체 완료 기록 */
export async function getAllCompletions(): Promise<{ email: string; scheduleRowIndex: number; checkedAt: string; submissionUrl?: string }[]> {
  const rows = await readSheet('completions!A2:D')
  return rows
    .filter(r => r[0] && r[1])
    .map(r => ({
      email:            r[0],
      scheduleRowIndex: Number(r[1]),
      checkedAt:        r[2] || '',
      submissionUrl:    r[3] || undefined,
    }))
}

/** 완료 체크 추가 또는 과제 URL 저장 (같은 rowIndex면 업데이트) */
export async function addCompletion(email: string, scheduleRowIndex: number, submissionUrl?: string): Promise<void> {
  const rows = await readSheet('completions!A2:D')
  const idx = rows.findIndex(
    r => r[0]?.toLowerCase() === email.toLowerCase() && Number(r[1]) === scheduleRowIndex
  )
  const now = new Date().toISOString()
  if (idx >= 0) {
    const existing = rows[idx]
    await updateRow('completions', idx + 2, [
      email,
      scheduleRowIndex,
      existing[2] || now,
      submissionUrl ?? existing[3] ?? '',
    ])
  } else {
    await appendRow('completions', [email, scheduleRowIndex, now, submissionUrl ?? ''])
  }
}

/** 완료 체크 해제 */
export async function removeCompletion(email: string, scheduleRowIndex: number): Promise<void> {
  const rows = await readSheet('completions!A2:D')
  const idx = rows.findIndex(
    r => r[0]?.toLowerCase() === email.toLowerCase() && Number(r[1]) === scheduleRowIndex
  )
  if (idx >= 0) await clearRow('completions', idx + 2)
}

/** 강의가 직무별로 분리될 때, 지정된 인턴들의 완료 기록을 새 강의 행으로 재배정
 *  (schedule_row_index 컬럼만 갱신, 체크 시각/제출 URL은 그대로 유지) */
async function reassignCompletionsScheduleRow(
  oldRowIndex: number,
  newRowIndex: number,
  emails: Set<string>
): Promise<number> {
  const rows = await readSheet('completions!A2:D')
  let moved = 0
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const email = r[0]?.toLowerCase()
    if (!email || !r[1]) continue
    if (Number(r[1]) === oldRowIndex && emails.has(email)) {
      await updateRow('completions', i + 2, [r[0], newRowIndex, r[2] || '', r[3] || ''])
      moved++
    }
  }
  return moved
}

// ──────────────────────────────────────────────
// 면담 일정 (interviews 시트)
// 컬럼: A=intern_name  B=date  C=time_slot  D=booked_by
// ──────────────────────────────────────────────

export interface Interview {
  rowIndex: number
  intern_name: string
  date: string        // '6/23 화'
  time_slot: string   // '14:00~14:30'
  booked_by: string   // 부서명 or ''
}

export async function getInterviews(): Promise<Interview[]> {
  try {
    const rows = await readSheet('interviews!A2:D')
    return rows
      .map((r, i) => ({
        rowIndex:    i + 2,
        intern_name: r[0] || '',
        date:        r[1] || '',
        time_slot:   r[2] || '',
        booked_by:   r[3] || '',
      }))
      .filter(r => r.intern_name && r.date && r.time_slot)
  } catch { return [] }
}

export async function addInterview(data: Omit<Interview, 'rowIndex'>): Promise<void> {
  await appendRow('interviews', [data.intern_name, data.date, data.time_slot, data.booked_by])
}

export async function updateInterviewBooking(rowIndex: number, bookedBy: string): Promise<void> {
  const rows = await readSheet(`interviews!A${rowIndex}:D${rowIndex}`)
  const existing = rows[0] || []
  await updateRow('interviews', rowIndex, [
    existing[0] ?? '',
    existing[1] ?? '',
    existing[2] ?? '',
    bookedBy,
  ])
}

export async function deleteInterview(rowIndex: number): Promise<void> {
  const sheets = getSheets()
  const spreadsheetId = await getActiveSheetId()
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId })
  const sheet = spreadsheet.data.sheets?.find(s => s.properties?.title === 'interviews')
  if (!sheet || sheet.properties?.sheetId == null) {
    await clearRow('interviews', rowIndex)
    return
  }
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ deleteDimension: { range: { sheetId: sheet.properties.sheetId, dimension: 'ROWS', startIndex: rowIndex - 1, endIndex: rowIndex } } }],
    },
  })
}

// ──────────────────────────────────────────────
// 강의 피드백 (feedbacks 시트)
//
// ※ Google Sheets에 'feedbacks' 시트를 만들고
//    1행에 헤더를 추가해주세요:
//    timestamp | intern_name | lecture_name | lecture_date |
//    q1 | q2 | q3 | q4 | q5 | q6 | q7 | q8 | q9
// ──────────────────────────────────────────────

async function ensureFeedbacksSheet(): Promise<void> {
  const sheets = getSheets()
  const spreadsheetId = await getActiveSheetId()
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId })
  const exists = spreadsheet.data.sheets?.some(s => s.properties?.title === 'feedbacks')
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: 'feedbacks' } } }] },
    })
    await appendRow('feedbacks', [
      'timestamp','intern_name','lecture_name','lecture_date',
      'q1_satisfaction','q2_structure','q3_depth','q4_explanation','q5_practical','q6_practice',
      'q7_helpful','q8_difficult','q9_improvement',
    ])
  }
}

export async function getFeedbacks(internName?: string): Promise<LectureFeedback[]> {
  try {
    const rows = await readSheet('feedbacks!A2:M')
    return rows
      .map((r, i) => ({
        rowIndex: i + 2,
        timestamp:        r[0]  || '',
        intern_name:      r[1]  || '',
        lecture_name:     r[2]  || '',
        lecture_date:     r[3]  || '',
        q1_satisfaction:  Number(r[4])  || 0,
        q2_structure:     Number(r[5])  || 0,
        q3_depth:         Number(r[6])  || 0,
        q4_explanation:   Number(r[7])  || 0,
        q5_practical:     Number(r[8])  || 0,
        q6_practice:      r[9]  ? Number(r[9])  : undefined,
        q7_helpful:       r[10] || '',
        q8_difficult:     r[11] || '',
        q9_improvement:   r[12] || '',
      }))
      .filter(fb => fb.intern_name && fb.lecture_name)
      .filter(fb => !internName || fb.intern_name === internName)
  } catch { return [] }
}

export async function upsertFeedback(data: Omit<LectureFeedback, 'rowIndex'>): Promise<void> {
  await ensureFeedbacksSheet()
  const rows = await readSheet('feedbacks!A2:M')
  const idx = rows.findIndex(r => r[1] === data.intern_name && r[2] === data.lecture_name)
  const values: (string | number)[] = [
    data.timestamp,
    data.intern_name,
    data.lecture_name,
    data.lecture_date,
    data.q1_satisfaction,
    data.q2_structure,
    data.q3_depth,
    data.q4_explanation,
    data.q5_practical,
    data.q6_practice ?? '',
    data.q7_helpful,
    data.q8_difficult,
    data.q9_improvement,
  ]
  if (idx >= 0) {
    await updateRow('feedbacks', idx + 2, values)
  } else {
    await appendRow('feedbacks', values)
  }
}

// ──────────────────────────────────────────────
// CO1 강사 평가 (co1_feedbacks 시트)
// ──────────────────────────────────────────────

async function ensureCO1FeedbacksSheet(): Promise<void> {
  const sheets = getSheets()
  const spreadsheetId = await getActiveSheetId()
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId })
  const exists = spreadsheet.data.sheets?.some(s => s.properties?.title === 'co1_feedbacks')
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: 'co1_feedbacks' } } }] },
    })
    await appendRow('co1_feedbacks', [
      'timestamp','evaluator','lecture_name','lecture_teacher','lecture_date',
      'form_type','content_fit','practical','difficulty','time_mgmt',
      'instructor_quality','material_checks',
      'opinion_content','opinion_instructor','opinion_qa',
      'practice_type','practice_memo',
    ])
  }
}

export async function getCO1Feedbacks(evaluator?: string): Promise<CO1Feedback[]> {
  try {
    const rows = await readSheet('co1_feedbacks!A2:Q')
    return rows
      .map((r, i) => ({
        rowIndex:            i + 2,
        timestamp:           r[0]  || '',
        evaluator:           r[1]  || '',
        lecture_name:        r[2]  || '',
        lecture_teacher:     r[3]  || '',
        lecture_date:        r[4]  || '',
        form_type:           r[5]  || '',
        content_fit:         r[6]  || '',
        practical:           r[7]  || '',
        difficulty:          r[8]  || '',
        time_mgmt:           r[9]  || '',
        instructor_quality:  r[10] || '',
        material_checks:     r[11] || '',
        opinion_content:     r[12] || '',
        opinion_instructor:  r[13] || '',
        opinion_qa:          r[14] || '',
        practice_type:       r[15] || '',
        practice_memo:       r[16] || '',
      }))
      .filter(fb => fb.evaluator && fb.lecture_name)
      .filter(fb => !evaluator || fb.evaluator === evaluator)
  } catch { return [] }
}

export async function upsertCO1Feedback(data: Omit<CO1Feedback, 'rowIndex'>): Promise<void> {
  await ensureCO1FeedbacksSheet()
  const rows = await readSheet('co1_feedbacks!A2:Q')
  const idx = rows.findIndex(r => r[1] === data.evaluator && r[2] === data.lecture_name)
  const values: (string | number)[] = [
    data.timestamp, data.evaluator, data.lecture_name, data.lecture_teacher, data.lecture_date,
    data.form_type, data.content_fit, data.practical, data.difficulty, data.time_mgmt,
    data.instructor_quality, data.material_checks,
    data.opinion_content, data.opinion_instructor, data.opinion_qa,
    data.practice_type ?? '', data.practice_memo ?? '',
  ]
  if (idx >= 0) {
    await updateRow('co1_feedbacks', idx + 2, values)
  } else {
    await appendRow('co1_feedbacks', values)
  }
}
