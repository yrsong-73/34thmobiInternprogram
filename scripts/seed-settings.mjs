/**
 * settings + user_permissions 시트 초기 데이터 입력
 * 사용법: node scripts/seed-settings.mjs
 */

import { google } from 'googleapis'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const [key, ...vals] = line.split('=')
    if (key && !key.startsWith('#')) process.env[key.trim()] = vals.join('=').trim()
  })
}

const SHEET_ID = process.env.GOOGLE_SHEET_ID
const KEY_RAW  = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
if (!SHEET_ID || !KEY_RAW) {
  console.error('❌ 환경변수 누락'); process.exit(1)
}

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(KEY_RAW),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({ version: 'v4', auth })

async function writeRange(range, values) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  })
}

async function main() {
  // ── settings 시트 ──
  await writeRange('settings!A1:B6', [
    ['key', 'value'],
    ['intern_batch', '34'],
    ['start_date', '2026-06-22'],
    ['drive_folder_url', 'https://drive.google.com/drive/folders/16EQ3OItXq4Ush58Fu7vaOzztKs-LkA77'],
  ])
  console.log('✅ settings 시트 완료')

  // ── user_permissions 시트 헤더 ──
  await writeRange('user_permissions!A1:D1', [
    ['email', 'name', 'role', 'created_at'],
  ])
  // 담당자(CO1) 기본 등록 — 이메일은 본인 것으로 수정하세요
  await writeRange('user_permissions!A2:D3', [
    ['yrsong@mobidays.com',       '송유림', 'CO1',    new Date().toISOString()],
    ['yeonjun.kim@mobidays.com',  '김연준', 'CO1',    new Date().toISOString()],
  ])
  console.log('✅ user_permissions 시트 완료 (CO1 2명 등록)')

  // ── 나머지 시트 헤더 ──
  await writeRange('interns!A1:M1', [
    ['name','job','type','mbti','age','school','career',
     'score_mini','score_test','score_attitude','attend_rate','assign_rate','summary']
  ])
  await writeRange('records!A1:E1', [
    ['intern_name','author','date','content','created_at']
  ])
  await writeRange('video_links!A1:D1', [
    ['day_key','lecture_name','video_url','updated_at']
  ])
  await writeRange('schedule_links!A1:D1', [
    ['lecture_name','link_url','link_label','updated_at']
  ])
  console.log('✅ interns / records / video_links / schedule_links 헤더 완료')
  console.log('\n🎉 모든 시트 초기화 완료!')
  console.log('이제 .env.local 설정 후 npm run dev 로 실행하세요.')
}

main().catch(err => {
  console.error('❌ 오류:', err.message); process.exit(1)
})
