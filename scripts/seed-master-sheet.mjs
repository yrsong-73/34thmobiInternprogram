/**
 * 마스터 스프레드시트(cohorts 탭) 초기 데이터 입력
 * - 기존 GOOGLE_SHEET_ID를 34기 활성 기수로 등록합니다
 * 사용법: node scripts/seed-master-sheet.mjs
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

const MASTER_SHEET_ID = process.env.GOOGLE_MASTER_SHEET_ID
const SHEET_ID         = process.env.GOOGLE_SHEET_ID
const KEY_RAW          = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
if (!MASTER_SHEET_ID || !SHEET_ID || !KEY_RAW) {
  console.error('❌ 환경변수 누락 (GOOGLE_MASTER_SHEET_ID, GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_KEY 확인)')
  process.exit(1)
}

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(KEY_RAW),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
})
const sheets = google.sheets({ version: 'v4', auth })

async function writeRange(range, values) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: MASTER_SHEET_ID,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  })
}

async function main() {
  await writeRange('cohorts!A1:E2', [
    ['batch', 'label', 'sheet_id', 'is_active', 'created_at'],
    ['34', '34기', SHEET_ID, 'true', new Date().toISOString()],
  ])
  console.log('✅ 마스터 스프레드시트 cohorts 탭 초기화 완료 (34기 = 활성)')
  console.log('⚠️ 서비스 계정 이메일이 이 마스터 스프레드시트에도 편집자로 공유되어 있는지 확인하세요.')
}

main().catch(err => {
  console.error('❌ 오류:', err.message); process.exit(1)
})
