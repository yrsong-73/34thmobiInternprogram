/**
 * Google Sheets API 연동 모듈
 *
 * 환경변수:
 *   GOOGLE_SHEET_ID            — 스프레드시트 ID (URL의 /d/ 이후 부분)
 *   GOOGLE_SERVICE_ACCOUNT_KEY — 서비스 계정 JSON 한 줄 문자열
 */

import { google } from 'googleapis'
import type { Intern, Record as InternRecord, UserPermission, AppSettings, ScheduleRow, Notice, NoticeComment } from '@/types'

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

const SHEET_ID = process.env.GOOGLE_SHEET_ID!

// ──────────────────────────────────────────────
// 공통 유틸
// ──────────────────────────────────────────────

async function readSheet(range: string): Promise<string[][]> {
  const sheets = getSheets()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range,
  })
  return (res.data.values as string[][]) || []
}

async function appendRow(sheetName: string, values: (string | number)[]): Promise<void> {
  const sheets = getSheets()
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [values] },
  })
}

async function updateRow(
  sheetName: string,
  rowIndex: number,         // 1-based (헤더 포함)
  values: (string | number)[]
): Promise<void> {
  const sheets = getSheets()
  const range = `${sheetName}!A${rowIndex}:Z${rowIndex}`
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [values] },
  })
}

async function clearRow(sheetName: string, rowIndex: number): Promise<void> {
  const sheets = getSheets()
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
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
  const rows = await readSheet('interns!A2:O')
  return rows
    .filter(r => r[0])
    .map((r, i) => ({
      name:            r[0] || '',
      job:             r[1] || '',
      type:            ((['marketing','aiax','biz'] as string[]).includes(r[2]) ? r[2] : jobToType(r[1])) as 'marketing' | 'aiax' | 'biz',
      mbti:            r[3] || '',
      age:             r[4] || '',
      school:          r[5] || '',
      career:          r[6] || '',
      score_mini:      Number(r[7]) || 0,
      score_test:      Number(r[8]) || 0,
      score_attitude:  Number(r[9]) || 0,
      attend_rate:     Number(r[10]) || 0,
      assign_rate:     Number(r[11]) || 0,
      summary:         r[12] || '',
      test_top:        r[13] || '',
      test_bottom:     r[14] || '',
      rowIndex:        i + 2,
    }))
}

export async function updateIntern(rowIndex: number, data: Partial<Intern>): Promise<void> {
  const rows = await readSheet(`interns!A${rowIndex}:O${rowIndex}`)
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
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
  const sheet = spreadsheet.data.sheets?.find(s => s.properties?.title === 'records')
  if (!sheet || sheet.properties?.sheetId == null) throw new Error('records 시트를 찾을 수 없습니다')
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
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
    week_2_visible:         map['week_2_visible']         !== 'false',
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
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
  const exists = spreadsheet.data.sheets?.some(s => s.properties?.title === 'notices')
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
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
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
  const sheet = spreadsheet.data.sheets?.find(s => s.properties?.title === 'notices')
  if (!sheet || sheet.properties?.sheetId == null) throw new Error('notices 시트를 찾을 수 없습니다')
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
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
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
  const exists = spreadsheet.data.sheets?.some(s => s.properties?.title === 'notice_comments')
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
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
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
  const sheet = spreadsheet.data.sheets?.find(s => s.properties?.title === 'notice_comments')
  if (!sheet || sheet.properties?.sheetId == null) throw new Error('notice_comments 시트를 찾을 수 없습니다')
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
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
  const rawRows = await readSheet('schedule!A2:T')
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
export async function addScheduleRow(data: Omit<ScheduleRow, 'rowIndex'>): Promise<void> {
  await appendRow('schedule', scheduleRowToValues(data))
}

/** 강의 수정 */
export async function updateScheduleRow(rowIndex: number, data: Omit<ScheduleRow, 'rowIndex'>): Promise<void> {
  await updateRow('schedule', rowIndex, scheduleRowToValues(data))
}

/** 강의 삭제 (행 내용 클리어) */
export async function deleteScheduleRow(rowIndex: number): Promise<void> {
  await clearRow('schedule', rowIndex)
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
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
  const sheet = spreadsheet.data.sheets?.find(s => s.properties?.title === 'interviews')
  if (!sheet || sheet.properties?.sheetId == null) {
    await clearRow('interviews', rowIndex)
    return
  }
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{ deleteDimension: { range: { sheetId: sheet.properties.sheetId, dimension: 'ROWS', startIndex: rowIndex - 1, endIndex: rowIndex } } }],
    },
  })
}
