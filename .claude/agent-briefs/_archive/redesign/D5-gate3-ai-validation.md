# D5 Brief: Gate 3 AI 검증 통합 — 당선 패턴 대조 + 평가위원 시뮬 + 논리 체인 검증

## 🎯 Mission

제안서 생성 시 **3가지 AI 검증** 을 자동 실행하여 `ScoreSimulationResult` 를 반환하는 모듈. `src/modules/gate3-validation/` 신규. `/api/ai/proposal` (C3) 응답에 통합.

## 📋 Context

**quality-gates.md §1 Gate 3:**
1. **3a. 당선 패턴 대조** — 생성물 vs WinningPattern (D1) 유사도
2. **3b. 평가위원 시뮬레이션** — 채점 + 감점 사유 + 예상 질문
3. **3c. 논리 체인 검증** — RFP → 컨셉 → 커리큘럼 → Activity → Outcome 끊김 감지

**자동 블록 안 함** (quality-gates.md 명시): 리포트만. PM 이 최종 결정.

## ✅ Prerequisites

1. D1 완료 (WinningPattern 있음 — 없어도 동작, empty fallback)
2. C3 완료 (`/api/ai/proposal` 작동)
3. `src/modules/predicted-score/` 완료 (D4) — 결과 병합 지점

## 📖 Read

1. `docs/architecture/quality-gates.md` §1 Gate 3 전체
2. `src/lib/proposal-ai.ts` (C3)
3. `src/lib/winning-patterns.ts` (D1)
4. `src/lib/pipeline-context.ts` §ScoreSimulationResult
5. `src/lib/planning-direction.ts` — Claude 호출 패턴

## 🎯 Scope

### ✅ CAN
- `src/modules/gate3-validation/`
  - `manifest.ts`
  - `types.ts`
  - `pattern-comparison.ts`
  - `evaluator-simulation.ts`
  - `logic-chain.ts`
  - `run.ts` — 3개 통합
- `src/app/api/ai/proposal/validate/route.ts` (신규 POST)
- C3 `src/app/api/ai/proposal/route.ts` 에 **옵션 flag** (`?validate=true`) 추가로 호출 가능하게 (선택)

### ❌ MUST NOT
- proposal-ai.ts 내부 로직 수정
- 기존 API 응답 형태 변경
- WinningPattern / ChannelPreset 수정
- schema

## 🛠 Tasks

### Step 1: Type

```typescript
export interface Gate3Report {
  sectionNo: ProposalSectionNo
  patternComparison: {
    similarityScore: number     // 0~100
    matchedPatterns: Array<{ id, sourceProject, snippet }>
    missingElements: string[]
  }
  evaluatorSimulation: {
    expectedScore: number        // 해당 섹션 예상 점수
    maxScore: number
    deductionReasons: string[]
    likelyQuestions: string[]    // 3~5개
  }
  logicChain: {
    passed: boolean
    breakpoints: string[]        // 끊긴 연결 설명
  }
  overallFeedback: string
  runAt: string
}
```

### Step 2: Pattern Comparison

`pattern-comparison.ts`:
- WinningPattern 중 `sectionKey === current && outcome === 'won'` top 3 조회
- Claude 프롬프트: "현재 섹션 내용과 당선 패턴 3개의 일치도 분석. 부족한 요소 나열"
- safeParseJson 패턴 복제 (B1 방식)

### Step 3: Evaluator Simulation

`evaluator-simulation.ts`:
- ChannelPreset.evaluatorProfile + RFP.evalCriteria 주입
- Claude 프롬프트: "당신은 이 발주처 평가위원입니다. 이 섹션 채점·감점·예상 질문"

### Step 4: Logic Chain

`logic-chain.ts`:
- 전체 PipelineContext 요약을 프롬프트에 주입
- "각 단계 인과 체인 점검. 끊긴 지점 나열"
- 프롬프트에 Ch.3 §3.7 함정 1 ("그래서?" 테스트) 반영

### Step 5: Run

```typescript
export async function runGate3(sectionNo, sectionContent, context): Promise<Gate3Report> {
  const [pattern, evaluator, logic] = await Promise.all([
    comparePatterns(sectionNo, sectionContent, context),
    simulateEvaluator(sectionNo, sectionContent, context),
    validateLogicChain(sectionNo, context),
  ])
  return { sectionNo, ...pattern, ...evaluator, ...logic, runAt: ... }
}
```

### Step 6: API

`POST /api/ai/proposal/validate`:
- body: `{projectId, sectionNo, sectionContent}`
- buildPipelineContext → runGate3
- 반환: Gate3Report

### Step 7: 검증

typecheck · build.

## ✔️ Definition of Done

- [ ] 3개 검증 함수 구현
- [ ] runGate3 병렬 실행
- [ ] POST /api/ai/proposal/validate
- [ ] manifest
- [ ] WinningPattern 0건 fallback (similarity 0, 안내)
- [ ] typecheck · build

## 📤 Return Format

- 각 검증의 프롬프트 길이 (토큰 관점)
- 병렬 실행 시 총 지연 예상
- 후속: step-proposal UI 에 Gate3 버튼 추가 (별도)

## 🚫 Do NOT

- 자동 블록 (report only)
- proposal-ai 수정
- WinningPattern / ChannelPreset 수정
- schema 변경

## 🏁 Final

"쌓일수록 강해지는" 축이 여기서 선명해짐. WinningPattern 늘어날수록 comparison 정확도 상승.
