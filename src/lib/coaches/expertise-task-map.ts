/**
 * Coach Recommender — ProjectTaskType ↔ Coach EXPERTISE 매핑 (Wave V / F1)
 *
 * RFP 의 detectedTasks (6종) 와 coach.expertise (11종) 사이의 휴리스틱 매핑.
 * 또한 RFP keywords 의 빈출 단어 → expertise hint 매핑.
 *
 * 모든 매핑은 휴리스틱. ADR-016 (데이터 센터 통합) 후 과거 사업 데이터로 학습 가능.
 *
 * EXPERTISE_OPTIONS 11종 (coach-assign.tsx 와 동기화 필수):
 *   - 창업 일반 (기업가정신/팀빌딩)
 *   - 비즈니스 모델 (BM/가설검증)
 *   - 사업계획서/IR (투자유치/피칭)
 *   - 마케팅/브랜딩 (시장조사/퍼포먼스)
 *   - AI/DX (생성형 AI 활용/노코드)
 *   - 기술/R&D (제조/특허)
 *   - ESG/소셜임팩트
 *   - 조직문화/HR
 *   - 로컬 비즈니스 (지역자원/크리에이터)
 *   - 투자/심사
 *   - 글로벌코칭
 *
 * ProjectTaskType 6종 (program-profile.ts):
 *   - 모객 / 심사_선발 / 교류_네트워킹 / 멘토링_코칭 / 컨설팅_산출물 / 행사_운영
 */

import type { ProjectTaskType } from '@/lib/program-profile'

/**
 * EXPERTISE_OPTIONS 의 정규화 라벨 (괄호 부가 설명 제외).
 * coach-assign.tsx 의 `e.split('(')[0].trim()` 패턴과 일치.
 */
export const NORMALIZED_EXPERTISE = [
  '창업 일반',
  '비즈니스 모델',
  '사업계획서/IR',
  '마케팅/브랜딩',
  'AI/DX',
  '기술/R&D',
  'ESG/소셜임팩트',
  '조직문화/HR',
  '로컬 비즈니스',
  '투자/심사',
  '글로벌코칭',
] as const

export type NormalizedExpertise = (typeof NORMALIZED_EXPERTISE)[number]

/**
 * MappedCoach.expertise 의 raw string (예: "AI/DX (생성형 AI 활용/노코드)") 을
 * 정규화 라벨로 변환.
 */
export function normalizeExpertise(raw: string): string {
  return raw.split('(')[0].trim()
}

/**
 * ProjectTaskType → 매칭 가능한 NormalizedExpertise 후보 리스트.
 * 한 task 가 여러 expertise 와 매칭될 수 있음.
 *
 * 예: '컨설팅_산출물' = BM·AI/DX·기술·ESG 모두 후보 (deliverable 유형에 따라).
 */
export const TASK_TO_EXPERTISE_HINT: Record<ProjectTaskType, NormalizedExpertise[]> = {
  모객: ['마케팅/브랜딩', '로컬 비즈니스'],
  심사_선발: ['투자/심사', '사업계획서/IR'],
  교류_네트워킹: ['글로벌코칭', '로컬 비즈니스', '조직문화/HR'],
  멘토링_코칭: ['창업 일반', '비즈니스 모델', '사업계획서/IR'],
  컨설팅_산출물: ['비즈니스 모델', 'AI/DX', '기술/R&D', 'ESG/소셜임팩트'],
  행사_운영: ['로컬 비즈니스', '조직문화/HR'],
}

/**
 * RFP keywords 의 빈출 단어 → expertise hint.
 *
 * 매칭은 case-insensitive substring. 예를 들어 RFP 키워드에 "생성형 AI" 가 있으면
 * 'AI/DX' 가 boost.
 *
 * 추가 시 유지보수 위해 알파벳·가나다 순.
 */
export const KEYWORD_TO_EXPERTISE_HINT: ReadonlyArray<readonly [string, NormalizedExpertise]> = [
  // AI · 데이터 · 디지털
  ['AI', 'AI/DX'],
  ['ai', 'AI/DX'],
  ['생성형', 'AI/DX'],
  ['LLM', 'AI/DX'],
  ['데이터', 'AI/DX'],
  ['디지털', 'AI/DX'],
  ['노코드', 'AI/DX'],
  ['DX', 'AI/DX'],
  // 기술 · R&D · 제조
  ['기술', '기술/R&D'],
  ['R&D', '기술/R&D'],
  ['제조', '기술/R&D'],
  ['특허', '기술/R&D'],
  ['딥테크', '기술/R&D'],
  // 로컬 · 지역
  ['지역', '로컬 비즈니스'],
  ['로컬', '로컬 비즈니스'],
  ['소상공인', '로컬 비즈니스'],
  ['크리에이터', '로컬 비즈니스'],
  // 글로벌
  ['글로벌', '글로벌코칭'],
  ['해외', '글로벌코칭'],
  ['수출', '글로벌코칭'],
  // ESG · 소셜
  ['ESG', 'ESG/소셜임팩트'],
  ['소셜임팩트', 'ESG/소셜임팩트'],
  ['사회적', 'ESG/소셜임팩트'],
  ['임팩트', 'ESG/소셜임팩트'],
  // 마케팅 · 브랜드
  ['마케팅', '마케팅/브랜딩'],
  ['브랜드', '마케팅/브랜딩'],
  ['브랜딩', '마케팅/브랜딩'],
  ['퍼포먼스', '마케팅/브랜딩'],
  // BM · 사업계획
  ['비즈니스 모델', '비즈니스 모델'],
  ['BM', '비즈니스 모델'],
  ['가설검증', '비즈니스 모델'],
  ['사업계획', '사업계획서/IR'],
  ['IR', '사업계획서/IR'],
  ['투자유치', '사업계획서/IR'],
  ['피칭', '사업계획서/IR'],
  // 투자 · 심사
  ['투자', '투자/심사'],
  ['심사', '투자/심사'],
  ['VC', '투자/심사'],
  // 조직 · HR
  ['조직', '조직문화/HR'],
  ['HR', '조직문화/HR'],
  ['팀빌딩', '창업 일반'],
  ['기업가정신', '창업 일반'],
] as const

/**
 * RFP keywords 배열에서 매칭되는 expertise 를 추출.
 *
 * @param keywords RFP keywords (또는 targetStage / targetAudience tokens)
 * @returns 매칭된 NormalizedExpertise set (중복 제거)
 */
export function mapKeywordsToExpertise(keywords: string[]): Set<NormalizedExpertise> {
  const result = new Set<NormalizedExpertise>()
  if (!keywords || keywords.length === 0) return result

  const haystack = keywords.join(' ').toLowerCase()
  for (const [needle, expertise] of KEYWORD_TO_EXPERTISE_HINT) {
    if (haystack.includes(needle.toLowerCase())) {
      result.add(expertise)
    }
  }
  return result
}

/**
 * ProjectTaskType[] 에서 expertise 후보 set 추출.
 */
export function mapTasksToExpertise(tasks: ProjectTaskType[]): Set<NormalizedExpertise> {
  const result = new Set<NormalizedExpertise>()
  for (const t of tasks) {
    for (const e of TASK_TO_EXPERTISE_HINT[t] ?? []) {
      result.add(e)
    }
  }
  return result
}
