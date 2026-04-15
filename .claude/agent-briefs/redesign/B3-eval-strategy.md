# B3 Brief: 평가배점 전략 분석 유틸 (규칙 기반)

## 🎯 Mission (1 sentence)
`RfpParsed.evalCriteria` 를 입력으로 받아 최고배점 항목을 식별하고 제안서 섹션 매핑·가중치·가이드 메시지를 반환하는 **순수 유틸 함수** 를 `src/lib/eval-strategy.ts` 에 구현한다. AI 호출 없음.

## 📋 Context

**왜 규칙 기반인가.**
- RFP 평가배점표는 "항목명·점수" 의 테이블. 점수 비교·섹션 매핑·상위 N 선정은 모두 결정론적 계산.
- AI 를 쓰면 비용·지연 + 매번 결과가 달라 재현성 떨어짐.
- 평가위원 관점 해석은 장기적으로 AI 보강 가능하지만 1차는 룰 기반이면 충분.

**무엇을 하는가.**
1. evalCriteria 를 점수순 정렬 → 상위 3 추출
2. 각 항목을 표준 제안서 섹션에 매핑 (키워드 기반)
3. 가중치 normalize (점수 합 대비 비율)
4. PM 에게 보여줄 가이드 메시지 생성 ("커리큘럼 30점 최고배점 → Step 2 실습 중심 설계 필수")

**출력은 data-contract.md §1.2 `EvalStrategy` 타입과 일치.**

## ✅ Prerequisites
1. 작업 디렉토리: `c:\Users\USER\projects\ud-ops-workspace`
2. `npm run build` 통과
3. `src/lib/claude.ts` 에 `RfpParsed` 타입 정의 (`evalCriteria` 필드 확인)
4. `src/lib/pipeline-context.ts` 에 `EvalStrategy` 타입 정의

실패 시 STOP.

## 📖 Read These Files First

1. `CLAUDE.md`
2. **`docs/architecture/data-contract.md` §1.2 `EvalStrategy`** — 출력 스펙
3. `src/lib/pipeline-context.ts` — 현재 `EvalStrategy` 타입 정의 확인
4. `src/lib/claude.ts` — `RfpParsed.evalCriteria` 구조 (예: `Array<{ name: string; points: number }>` 형태 추정, 실제 확인 필요)
5. `src/lib/curriculum-rules.ts` — 기존 규칙 엔진 패턴 (유사한 구조로 가면 일관성)
6. `prisma/schema.prisma` Project 모델의 rfpParsed 주석 (있으면)

## 🎯 Scope

### ✅ You CAN touch
- `src/lib/eval-strategy.ts` (신규)
- `src/lib/eval-strategy.test.ts` (신규, 옵션) — 간단 단위 테스트 있으면 좋음 (필수 아님)

### ❌ You MUST NOT touch
- `prisma/schema.prisma`
- `src/lib/pipeline-context.ts` — 타입만 import
- `src/lib/claude.ts` — 수정 금지 (RfpParsed 구조 추정이 실제와 다르면 보고만)
- 어떤 API / UI / 컴포넌트 파일 수정 금지
- `package.json` — 의존성 추가 금지

## 🛠 Tasks

### Step 1: 타입 정의 확인

`EvalStrategy` 타입은 이미 pipeline-context.ts 에 있음. 구조 확인:

```typescript
// (참고 — 실제는 pipeline-context.ts 에서 import)
export interface EvalStrategy {
  topItems: Array<{
    name: string
    points: number
    section: ProposalSectionKey
    weight: number              // 0~1 정규화
    guidance: string            // PM 에게 보여줄 한 문장
  }>
  sectionWeights: Record<ProposalSectionKey, number>  // 섹션별 총 가중치
  overallGuidance: string[]     // 전체 가이드 메시지 2~4개
}

export type ProposalSectionKey =
  | 'proposal-background'
  | 'org-team'
  | 'curriculum'
  | 'coaches'
  | 'budget'
  | 'impact'
  | 'other'
```

`pipeline-context.ts` 의 실제 타입이 다르면 브리프 보고 후 중단. 타입 선언 변경 금지 — 맞춤만 가능.

### Step 2: 섹션 매핑 규칙

```typescript
// (한국어 + 영문 혼재 RFP 대응)
const SECTION_KEYWORDS: Record<ProposalSectionKey, string[]> = {
  curriculum: ['커리큘럼', '교육내용', '교육과정', '프로그램', '교과', 'curriculum'],
  'proposal-background': ['제안', '배경', '사업계획', '실행계획', '추진계획'],
  'org-team': ['조직', '전문성', '역량', '인력', '팀', '운영체계'],
  coaches: ['코치', '멘토', '강사', '전문가'],
  budget: ['예산', '비용', '경제성', '산출', '소요'],
  impact: ['성과', '평가', '임팩트', '효과', '측정'],
  other: [],
}

export function mapToSection(name: string): ProposalSectionKey {
  const lower = name.toLowerCase()
  for (const [section, keywords] of Object.entries(SECTION_KEYWORDS)) {
    if (section === 'other') continue
    if (keywords.some(k => lower.includes(k))) return section as ProposalSectionKey
  }
  return 'other'
}
```

**주의:** 하나의 항목이 여러 섹션 키워드에 걸리면 **첫 매칭 우선** (Object 순서 보장).

### Step 3: 메인 분석 함수

```typescript
export function analyzeEvalStrategy(
  evalCriteria: Array<{ name: string; points: number }> | null | undefined,
): EvalStrategy | null {
  if (!evalCriteria || evalCriteria.length === 0) return null

  const total = evalCriteria.reduce((s, c) => s + (c.points ?? 0), 0)
  if (total === 0) return null

  // 점수순 정렬 후 상위 3
  const sorted = [...evalCriteria].sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
  const top = sorted.slice(0, 3)

  const topItems = top.map(item => {
    const section = mapToSection(item.name)
    const weight = item.points / total
    const guidance = buildGuidance(item.name, item.points, section, weight)
    return { name: item.name, points: item.points, section, weight, guidance }
  })

  // 섹션별 총 가중치 합산
  const sectionWeights = buildSectionWeights(evalCriteria, total)

  // 전체 가이드 메시지 2~4개
  const overallGuidance = buildOverallGuidance(topItems, sectionWeights, total)

  return { topItems, sectionWeights, overallGuidance }
}
```

### Step 4: 가이드 문장 빌더

```typescript
function buildGuidance(name: string, points: number, section: ProposalSectionKey, weight: number): string {
  const pct = Math.round(weight * 100)
  const priority = pct >= 25 ? '최우선' : pct >= 15 ? '우선' : '주의'
  return `${name} ${points}점 (전체 ${pct}% · ${priority}) — 제안서 "${sectionLabel(section)}" 섹션에 집중.`
}

function sectionLabel(s: ProposalSectionKey): string {
  return {
    'proposal-background': '제안배경·추진계획',
    'org-team': '조직·운영체계',
    curriculum: '교육 커리큘럼',
    coaches: '코치·전문가',
    budget: '예산·경제성',
    impact: '성과·평가',
    other: '기타',
  }[s]
}

function buildOverallGuidance(topItems, sectionWeights, total): string[] {
  const guides: string[] = []
  // 1. 최고배점 항목
  if (topItems[0]) {
    guides.push(`최고 배점: ${topItems[0].name} (${topItems[0].points}점). ${sectionLabel(topItems[0].section)} 섹션에 분량·근거를 집중.`)
  }
  // 2. 상위 3 합계 비율
  const topSum = topItems.reduce((s, t) => s + t.points, 0)
  const topPct = Math.round((topSum / total) * 100)
  if (topPct >= 60) {
    guides.push(`상위 3개 항목이 전체의 ${topPct}% 차지. 이 세 영역에 리소스 집중 필요.`)
  }
  // 3. 커리큘럼 비중이 크면 Action Week 언급
  const curri = sectionWeights.curriculum ?? 0
  if (curri >= 0.2) {
    guides.push(`커리큘럼 비중 ${Math.round(curri * 100)}% — Action Week·실습 비율로 차별화 여지.`)
  }
  // 4. 예산 비중이 크면 정량·구조 강조
  const bud = sectionWeights.budget ?? 0
  if (bud >= 0.15) {
    guides.push(`예산 평가 ${Math.round(bud * 100)}% — 단가 근거·마진 구조 명시 필수.`)
  }
  return guides
}
```

### Step 5: Export + 간단 테스트 (옵션)

```typescript
export { mapToSection, analyzeEvalStrategy, sectionLabel }
```

간단한 단위 테스트 파일은 필수 아님. 하지만 있으면 좋음:
```typescript
// src/lib/eval-strategy.test.ts (만들지 않아도 됨)
// 테스트 러너는 현재 세팅 안 되어 있어 실행 안 함. 작성만.
```

테스트 러너가 없어서 실제로는 typecheck 만 실행. 브리프 작업 범위는 유틸 구현까지.

### Step 6: 검증

```bash
npm run typecheck
npm run build
```

둘 다 통과. eval-strategy.ts 는 import 없으면 build 산출물에 포함 안 될 수도 있음 (tree shaking). 문제 없음 — B1/B4 에서 import 하면 포함됨.

## 🔒 Tech Constraints

- **AI 호출 금지**
- **순수 함수** — side effect 없음, DB·network 접근 없음
- **TypeScript strict** — any 금지
- **의존성 추가 금지**

## ✔️ Definition of Done

- [ ] `src/lib/eval-strategy.ts` 생성
- [ ] `analyzeEvalStrategy(evalCriteria)` export
- [ ] `mapToSection(name)` export
- [ ] `sectionLabel(section)` export
- [ ] 출력 타입이 `pipeline-context.ts` 의 `EvalStrategy` 와 일치
- [ ] Input null/empty 방어 처리
- [ ] topItems 정확히 top 3 (데이터가 3개 미만이면 적은 개수)
- [ ] `npm run typecheck` 통과
- [ ] `npm run build` 통과
- [ ] 다른 파일 수정 없음

## 📤 Return Format

```
B3 Eval Strategy 완료.

생성 파일:
- src/lib/eval-strategy.ts

Export:
- analyzeEvalStrategy(evalCriteria) → EvalStrategy | null
- mapToSection(name) → ProposalSectionKey
- sectionLabel(section) → string

섹션 매핑 키워드 (요약):
- curriculum: 커리큘럼/교육내용/프로그램
- proposal-background: 제안/배경/실행계획
- org-team: 조직/전문성/인력
- coaches: 코치/멘토/강사
- budget: 예산/비용/경제성
- impact: 성과/평가/임팩트
- other: 미매칭

가이드 메시지 생성 규칙:
- 최고배점 항목 지적
- 상위 3 합계 비율 경고 (60%+)
- 커리큘럼 20%+ → Action Week 언급
- 예산 15%+ → 단가 근거 강조

검증:
- npm run typecheck: ✅
- npm run build: ✅

주의 / 이슈:
- [RfpParsed.evalCriteria 실제 타입이 추정과 다른 경우 등]

후속:
- B1 AI 가 이 함수 호출해서 프롬프트에 주입
- B4 UI 가 Step 1 우측 패널에 가이드 메시지 표시
- 향후 AI 기반 평가위원 시뮬 (Phase D5) 시 이 구조 확장
```

## 🚫 Do NOT

- AI / Claude API 호출 금지
- DB 접근 금지 (순수 함수)
- React / UI 코드 없음
- Prisma schema 수정 금지
- pipeline-context.ts 타입 수정 금지 (맞춤만)
- 의존성 추가 금지

## 💡 Hints

- `RfpParsed.evalCriteria` 실제 구조를 `src/lib/claude.ts` 에서 확인. 배열 안의 객체 필드명이 `name/points` 가 맞는지, 다르면 보고.
- 섹션 키워드는 휴리스틱. 매칭 정확도 낮으면 journey 에 기록 후 Phase C 에서 확장.
- `EvalStrategy.sectionWeights` 가 모든 섹션 키를 포함해야 한다면 누락값은 0 으로 채울 것.
- 테스트 러너가 없지만, 함수가 순수하므로 브라우저/node 콘솔에서 빠르게 수동 테스트 가능 (optional).

## 🏁 Final Note

1~2시간 작업. 가장 복잡도 낮은 브리프 중 하나. 다만 **섹션 매핑 키워드는 장기 자산** 이 됨 — B4 UI, Phase D pm-guide, 제안서 생성까지 같이 씀. 키워드 목록을 `EVAL_SECTION_KEYWORDS` 상수로 export 해서 다른 모듈이 재사용 가능하게 하자.
