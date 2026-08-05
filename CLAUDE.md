# Mobidays 인턴 프로그램 관리 앱

Next.js 15 (App Router) + TypeScript. 데이터베이스 없이 **Google Sheets를 유일한 데이터 저장소**로 사용 (서비스 계정 JWT, `googleapis`). NextAuth(Google OAuth)로 로그인. Vercel(`yrsong-73/34thmobiInternprogram`, main 브랜치)에 배포.

## 아키텍처 핵심

- **기수(cohort) 다중 지원**: 마스터 스프레드시트(`GOOGLE_MASTER_SHEET_ID`)의 `cohorts` 탭이 각 기수 → 데이터 스프레드시트 ID를 매핑. `src/lib/sheets.ts`의 `getActiveSheetId()`가 현재 활성 기수의 시트를 30초 캐시로 반환하며, 마스터 시트 조회 실패 시 `GOOGLE_SHEET_ID`(단일 시트 모드)로 폴백한다 — 이 폴백이 없으면 마스터 시트 문제 하나로 로그인 자체가 전부 깨진다.
- **역할 3단계**: `UserRole = 'CO1' | 'Member' | 'Intern'`, 정책은 `src/lib/rolePolicy.ts`.
- **"권한 미리보기" 모드** (`src/context/PreviewContext.tsx`): CO1이 Member/Intern 화면을 클라이언트에서 시뮬레이션. **주의: 이건 순수 클라이언트 렌더링 시뮬레이션이고, 실제 API 요청에 실려가는 세션 role은 그대로 CO1이다.** 그래서 "미리보기로는 보이는데 실제 그 역할 계정으로는 안 보인다"는 버그 패턴은 거의 항상 **서버 API의 role 체크가 너무 엄격해서 그 역할의 실제 세션을 막고 있다**는 뜻 — 미리보기가 통과되는 이유는 진짜 role이 CO1이라 그런 것뿐, 실제 버그가 없다는 증거가 아니다.
- `schedule` 시트 컬럼 A~X = `ScheduleRow` (`src/types/index.ts`에 컬럼 매핑 주석 있음).

## 절대 지키는 안전 원칙

1. **행 객체는 항상 전체를 복제 후 특정 필드만 교체한다. 부분 객체를 새로 만들지 않는다.** (`{ ...row, 필드: 새값 }`) — 과거 `EditModal` 저장 시 `eval_link`를 빼먹은 채 저장해서 매번 강의평가 링크가 지워지던 버그(커밋 `b84080d`)의 원인이 이 패턴 위반이었다. 드래그 재배치, 직무 분리(job-split), 시간표 복사 등 이후 모든 쓰기 로직이 이 원칙으로 설계됨.
2. **`completions` 시트는 `email` + `scheduleRowIndex`(스프레드시트 행 번호)로 키가 잡힌다.** 즉 `rowIndex`는 그 무엇을 하더라도 절대 바뀌면 안 되는 값이다. 드래그 재배치는 "행 이동"이 아니라 "같은 행의 필드 값만 교체"로 구현되어 있고, 새로운 쓰기 기능을 만들 때도 이 불변식을 반드시 지킬 것.
3. **새 컬럼을 추가할 때 기존 풀-로우 시리얼라이저(`scheduleRowToValues`)를 확장하지 않는다.** 대신 그 컬럼 전용 단일 셀/단일 레인지 `values.update()` 함수를 새로 만든다 (`updateScheduleFeedbackExclude`, `updateScheduleAssignment` 참고). 풀-로우 시리얼라이저를 건드리면 그 함수를 거치는 다른 모든 저장 경로가 새 컬럼을 몰라서 값을 지워버릴 위험이 있다.
4. **`day_num` 필드는 신뢰하지 않는다.** 직무 분리/직무별 시간표 복사(`copyJobTrackSchedule`, `updateScheduleRowAndSplit`)를 거치며 같은 날짜인데 트랙마다 `day_num` 값이 어긋나는 경우가 실제로 발생했다. "같은 날인지" 판단은 항상 **`date_label`(실제 달력 날짜 문자열, 예: "8/7 금")** 기준으로 한다 — `day_num`은 새 행을 쓸 때 채워 넣는 원시 필드 값 정도로만 쓰고, 그룹핑/식별자/정렬 키로는 절대 쓰지 않는다. 문자열 날짜 정렬 시 `"8/10"`이 `"8/3"`보다 사전식으로 앞에 오는 버그가 있으므로 반드시 숫자 변환 `dateSortKey()` 류 헬퍼로 정렬한다 (`feedback/page.tsx`, `interview/page.tsx`, `schedule/page.tsx`에 각각 존재).
5. **교육 일정은 평일(월~금)에만 진행된다.** 날짜 재계산("N일차" → 실제 날짜)은 반드시 영업일 기준으로 주말을 건너뛰며 계산해야 한다 (`rescheduleDates()`의 `addBusinessDays()` 참고). 달력 일수를 그대로 더하면 1주차를 넘어가는 순간부터 토/일에 강의가 걸린다.
6. **관리 전용 API의 권한을 다른 화면의 필요 때문에 함부로 완화하지 않는다.** 예: `/api/interviews`(면담 신청 관리, CO1·Member 전용, `/interview` 페이지는 인턴 접근 자체를 차단)에 "인턴 본인 것만 보게 예외 허용" 같은 코드를 추가하면 안 된다 — 관리 API의 권한 모델과 다른 화면의 좁은 조회 니즈는 분리한다. 대신 `/api/interns/me`, `/api/interviews/me`처럼 **그 용도 전용의 좁은 범위 `/me` 엔드포인트**를 새로 만든다.

## 개발 워크플로

- PowerShell로 `npx tsc --noEmit` → `npm run build` 순으로 반드시 확인 후 커밋한다.
- 커밋 메시지는 한글 텍스트/따옴표 이슈 때문에 `.git/COMMIT_MSG_TMP.txt`에 Write로 작성 → `git commit -F` → 파일 삭제 순으로 진행한다 (inline `-m`/heredoc은 깨짐).
- 사용자가 명시적으로 요청하지 않는 한 매 수정 후 바로 `git push origin main`까지 진행한다 (Vercel 자동 배포).
- 이 저장소에는 CO1이 클릭해서 실행하는 마이그레이션성 기능(예: 설정 페이지의 "시간표 일정 재배치", "CC 직무 시간표 만들기")이 이미 여러 개 있다 — Claude는 로컬에 서비스 계정 키가 없어 라이브 스프레드시트에 직접 쓸 수 없으므로, 실제 데이터 반영은 항상 이 기능들을 통해 **사용자가 버튼을 눌러야** 이루어진다는 점을 안내할 것.
