/**
 * Google Sheets 연동 유틸리티
 *
 * 환경변수 설정 방법:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL  — 서비스 계정 이메일
 *   GOOGLE_PRIVATE_KEY            — 서비스 계정 Private Key (\\n → \n 치환 필요)
 *   GOOGLE_SHEETS_FEEDBACK_ID     — 피드백 스프레드시트 ID
 *   GOOGLE_SHEETS_COACHES_ID      — 코치 단가/가용성 시트 ID
 *   GOOGLE_SHEETS_BUDGET_ID       — 예산 WBS 시트 ID
 */

import { google } from 'googleapis'

// ── 피드백 시트 헤더 ────────────────────────────────────────
const FEEDBACK_HEADERS = [
  '제출일시', '프로젝트명', '프로젝트ID', '회차', '응답자',
  '역할', '종합만족도', '콘텐츠', '코치', '진행방식',
  '좋았던 점', '개선점', '재추천 의향', '자유의견',
]

// ── 코치 단가 시트 헤더 ─────────────────────────────────────
const COACH_RATE_HEADERS = [
  'ID', '이름', '이메일', '티어', '카테고리',
  '강의단가(메인)', '강의단가(보조)', '코칭단가(메인)', '코칭단가(보조)',
  '특강연사비', '코칭일당', '강의일당',
  '세금유형', '교통비필요', '교통비예상', '숙박필요', '숙박예상',
  '가용요일', '온라인가능', '최소리드타임(일)', '메모',
]

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!email || !key) {
    throw new Error('Google 서비스 계정 환경변수(GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY)가 설정되지 않았습니다.')
  }

  return new google.auth.GoogleAuth({
    credentials: {
      client_email: email,
      private_key: key,
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

/**
 * 스프레드시트에 행 추가
 * @param sheetId   스프레드시트 ID
 * @param sheetName 시트 탭 이름 (기본: "피드백")
 * @param row       추가할 행 데이터 (문자열 배열)
 */
export async function appendRow(
  sheetId: string,
  row: string[],
  sheetName = '피드백'
) {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [row],
    },
  })
}

/**
 * 시트에서 값 읽기
 */
export async function readSheet(
  sheetId: string,
  range: string,
  sheetName = 'Sheet1'
): Promise<string[][]> {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${sheetName}!${range}`,
  })

  return (res.data.values ?? []) as string[][]
}

/**
 * 시트 헤더 행 초기화 (A1이 비어있을 때만 삽입)
 */
export async function ensureSheetHeaders(
  sheetId: string,
  headers: string[],
  sheetName: string
) {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${sheetName}!A1`,
  })

  const existing = res.data.values?.[0]?.[0]
  if (!existing) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [headers] },
    })
  }
}

/**
 * 피드백 시트 초기화 (헤더 보장)
 */
export async function initFeedbackSheet(sheetId: string) {
  return ensureSheetHeaders(sheetId, FEEDBACK_HEADERS, '피드백')
}

/**
 * 코치 단가 시트 초기화 (헤더 보장)
 */
export async function initCoachRateSheet(sheetId: string) {
  return ensureSheetHeaders(sheetId, COACH_RATE_HEADERS, '코치단가')
}

/**
 * 코치 단가 행 포맷 생성
 */
export function buildCoachRateRow(coach: {
  id: string
  name: string
  email?: string | null
  tier: string
  category: string
  lectureRateMain?: number | null
  lectureRateSub?: number | null
  coachRateMain?: number | null
  coachRateSub?: number | null
  specialLectureRate?: number | null
  dailyRateCoach?: number | null
  dailyRateLecture?: number | null
  taxType: string
  needTransport: boolean
  transportEstimate?: number | null
  needAccomm: boolean
  accommEstimate?: number | null
  availableDays: string[]
  onlineAvailable: boolean
  minLeadTimeDays: number
}): string[] {
  return [
    coach.id,
    coach.name,
    coach.email ?? '',
    coach.tier,
    coach.category,
    String(coach.lectureRateMain ?? ''),
    String(coach.lectureRateSub ?? ''),
    String(coach.coachRateMain ?? ''),
    String(coach.coachRateSub ?? ''),
    String(coach.specialLectureRate ?? ''),
    String(coach.dailyRateCoach ?? ''),
    String(coach.dailyRateLecture ?? ''),
    coach.taxType,
    coach.needTransport ? 'Y' : 'N',
    String(coach.transportEstimate ?? ''),
    coach.needAccomm ? 'Y' : 'N',
    String(coach.accommEstimate ?? ''),
    coach.availableDays.join(', '),
    coach.onlineAvailable ? 'Y' : 'N',
    String(coach.minLeadTimeDays),
    '',
  ]
}

/**
 * 피드백 전용 행 포맷 생성
 */
export function buildFeedbackRow(data: {
  submittedAt: string
  projectName: string
  projectId: string
  sessionNo: string | number
  respondent: string
  role: string
  overallScore: string | number
  contentScore: string | number
  coachScore: string | number
  facilitationScore: string | number
  bestPart: string
  improvement: string
  wouldRecommend: string
  freeText: string
}) {
  return [
    data.submittedAt,
    data.projectName,
    data.projectId,
    String(data.sessionNo),
    data.respondent,
    data.role,
    String(data.overallScore),
    String(data.contentScore),
    String(data.coachScore),
    String(data.facilitationScore),
    data.bestPart,
    data.improvement,
    data.wouldRecommend,
    data.freeText,
  ]
}
