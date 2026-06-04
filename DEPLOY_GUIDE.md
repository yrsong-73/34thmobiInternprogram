# 배포 가이드 — Google Cloud + Vercel 설정

> 초보자도 따라할 수 있게 단계별로 설명합니다.  
> 총 소요 시간: **약 1~1.5시간**

---

## 전체 흐름

```
① Node.js 설치 → ② 패키지 설치 → ③ Google Sheets 생성
→ ④ Google Cloud 설정 → ⑤ .env.local 작성 → ⑥ 로컬 테스트
→ ⑦ GitHub Push → ⑧ Vercel 배포
```

---

## STEP 1 — Node.js 설치 확인

터미널(명령 프롬프트)에서 아래 명령어 입력:

```bash
node -v
```

버전이 나오면 OK. 없으면 [nodejs.org](https://nodejs.org) 에서 **LTS 버전** 설치.

---

## STEP 2 — 프로젝트 패키지 설치

이 `intern-app` 폴더 안에서 터미널 열고 실행:

```bash
npm install
```

완료되면 `node_modules` 폴더가 생깁니다.

---

## STEP 3 — Google Sheets 파일 만들기

1. [sheets.google.com](https://sheets.google.com) 접속
2. **새 스프레드시트 생성**
3. 아래 시트(탭)를 추가합니다 — 하단 `+` 버튼으로 탭 추가:

   | 탭 이름 | 설명 |
   |---------|------|
   | `schedule` | 시간표 (앱에서 직접 수정 가능) |
   | `interns` | 인턴 정보 (점수, 요약 등) |
   | `completions` | 교육 완료 체크 + 과제 제출 URL |
   | `records` | 관찰 기록 |
   | `video_links` | 강의 영상 URL |
   | `schedule_links` | 강의 자료 링크 |
   | `user_permissions` | 로그인 가능 사용자 목록 |
   | `settings` | 기본 설정 |

   > ⚠️ `completions` 시트 헤더 1행에 직접 입력 필요:
   > `email` | `schedule_row_index` | `checked_at` | `submission_url`

4. 스프레드시트 URL에서 **ID 복사**: `https://docs.google.com/spreadsheets/d/`**여기가ID**`/edit`

---

## STEP 4 — Google Cloud Console 설정

### 4-1. 프로젝트 생성

1. [console.cloud.google.com](https://console.cloud.google.com) 접속 (Google 계정 로그인)
2. 상단 프로젝트 드롭다운 → **새 프로젝트**
3. 이름: `Mobidays Intern App` → **만들기**

### 4-2. Google Sheets API 활성화

1. 좌측 메뉴 → **API 및 서비스** → **라이브러리**
2. 검색창에 `Google Sheets API` 검색
3. **사용 설정** 클릭

### 4-3. OAuth 2.0 자격증명 만들기 (로그인용)

1. **API 및 서비스** → **사용자 인증 정보** → **+ 사용자 인증 정보 만들기** → **OAuth 클라이언트 ID**
2. 처음이라면 **동의 화면 구성** 먼저:
   - User Type: **내부** (mobidays.com 조직) 또는 **외부** (개인 계정)
   - 앱 이름: `Mobidays Intern App`
   - 저장 후 계속
3. 애플리케이션 유형: **웹 애플리케이션**
4. 이름: `Intern App Web`
5. **승인된 리디렉션 URI** 추가:
   ```
   http://localhost:3000/api/auth/callback/google
   ```
   (배포 후 Vercel URL도 추가 예정)
6. **만들기** → **클라이언트 ID**와 **클라이언트 보안 비밀** 복사 (잃어버리면 안 됨!)

### 4-4. 서비스 계정 만들기 (Sheets 읽기/쓰기용)

1. **사용자 인증 정보** → **+ 사용자 인증 정보 만들기** → **서비스 계정**
2. 이름: `intern-app-sheets` → **만들기 및 계속**
3. 역할: **편집자** → **완료**
4. 방금 만든 서비스 계정 클릭 → **키** 탭 → **키 추가** → **새 키 만들기** → **JSON**
5. JSON 파일이 다운로드됩니다 — **안전한 곳에 보관!**

### 4-5. Sheets에 서비스 계정 공유

1. Google Sheets 파일 열기
2. 우측 상단 **공유** 버튼
3. 서비스 계정 이메일 입력 (예: `intern-app-sheets@mobidays-intern.iam.gserviceaccount.com`)
   → 서비스 계정 JSON 파일 안 `"client_email"` 값
4. 권한: **편집자** → **공유**

---

## STEP 5 — .env.local 파일 작성

프로젝트 루트에 `.env.local` 파일 생성 (`.env.local.example` 복사해서 시작):

```bash
cp .env.local.example .env.local
```

그 다음 아래 내용으로 채우기:

```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=여기에_랜덤값_넣기

GOOGLE_CLIENT_ID=4-3에서_복사한_클라이언트_ID
GOOGLE_CLIENT_SECRET=4-3에서_복사한_클라이언트_보안_비밀

GOOGLE_SHEET_ID=3번에서_복사한_스프레드시트_ID
GOOGLE_SERVICE_ACCOUNT_KEY=서비스_계정_JSON_한줄로
```

> **NEXTAUTH_SECRET 만드는 법:**
> 터미널에서 `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` 실행

> **서비스 계정 JSON 한줄로 변환:**
> - Mac/Linux: `cat service-account.json | tr -d '\n'`
> - Windows PowerShell: `(Get-Content service-account.json -Raw) -replace '\s','' | Write-Output`
> - 또는 JSON 파일 내용을 메모장에 붙여넣고 줄바꿈 모두 제거

---

## STEP 6 — 초기 데이터 입력 (시트 세팅)

```bash
# 1. settings + 헤더 + CO1 계정 초기화
node scripts/seed-settings.mjs

# 2. 시간표 데이터 입력 (34기 전체 시간표 — count_for_rate 포함)
node scripts/seed-schedule-34.mjs
```

> ⚠️ `seed-schedule.mjs`는 구버전입니다. **`seed-schedule-34.mjs`** 를 사용하세요.
> 이 스크립트는 Q열(`count_for_rate`)도 함께 입력합니다.

완료 후 Google Sheets 열어서 데이터 확인!

---

## STEP 7 — 로컬 테스트

```bash
npm run dev
```

브라우저에서 `http://localhost:3000` 접속 → 구글 로그인 → 시간표 확인!

---

## STEP 8 — GitHub에 올리기

```bash
# 처음 한 번만
git init
git add .
git commit -m "첫 배포"
git branch -M main

# GitHub에서 새 저장소 만들고 (비공개 권장)
git remote add origin https://github.com/본인아이디/intern-app.git
git push -u origin main
```

> ⚠️ `.gitignore`에 `.env.local`이 포함되어 있어서 비밀키는 GitHub에 올라가지 않습니다.

---

## STEP 9 — Vercel 배포

1. [vercel.com](https://vercel.com) → **Sign Up with GitHub**
2. **Add New Project** → GitHub 저장소 선택 (`intern-app`)
3. **Environment Variables** 탭에서 `.env.local`의 내용을 하나씩 입력:

   | 키 | 값 |
   |----|-----|
   | `NEXTAUTH_URL` | `https://your-app.vercel.app` (배포 후 확인) |
   | `NEXTAUTH_SECRET` | 로컬과 동일 |
   | `GOOGLE_CLIENT_ID` | 로컬과 동일 |
   | `GOOGLE_CLIENT_SECRET` | 로컬과 동일 |
   | `GOOGLE_SHEET_ID` | 로컬과 동일 |
   | `GOOGLE_SERVICE_ACCOUNT_KEY` | 로컬과 동일 |

4. **Deploy** 클릭 → 완료되면 URL 생성됨 (예: `https://intern-app-xxx.vercel.app`)

5. **Vercel URL을 Google Cloud에 추가:**
   - Google Cloud Console → OAuth 자격증명 → 편집
   - 승인된 리디렉션 URI 추가:
     ```
     https://intern-app-xxx.vercel.app/api/auth/callback/google
     ```
   - **저장**

6. Vercel 환경변수에서 `NEXTAUTH_URL`을 실제 Vercel URL로 업데이트 후 **재배포**

---

## STEP 10 — 인턴 계정 등록

앱이 배포되면 CO1 계정으로 로그인 후 **권한 관리** 탭에서:
- 인턴들의 Google 이메일 → **Intern** 역할로 추가
- 참관 직원 → **Member** 역할로 추가

---

## 이후 업데이트

코드를 수정하고 GitHub에 push하면 Vercel이 **자동으로 재배포**합니다.

```bash
git add .
git commit -m "시간표 수정"
git push
```

시간표나 인턴 데이터는 **앱 UI에서 직접** 수정하면 Sheets에 저장되고 모두에게 즉시 반영됩니다.

---

## 문제 해결 (FAQ)

| 증상 | 원인 | 해결 |
|------|------|------|
| 로그인 후 "접근 권한이 없는 계정" | user_permissions 시트에 이메일 없음 | seed-settings.mjs 실행 또는 시트에 직접 추가 |
| 시간표가 안 뜸 | GOOGLE_SHEET_ID 오류 또는 서비스 계정 미공유 | 4-5 단계 확인 |
| Google 로그인 오류 | 리디렉션 URI 불일치 | Google Cloud에 현재 URL 추가 |
| Vercel 빌드 실패 | 환경변수 누락 | Vercel 환경변수 탭 확인 |
