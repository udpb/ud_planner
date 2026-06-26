# Brief BR-WS-25 — 예산 적산 후속 (진단 단일화 + costingDefaults 정교화, ADR-030 범위 내)

> **자급자족.** 본 파일 + `docs/decisions/030-budget-costing-calibration.md` + `budget-calc.ts` + `budget-rules.json`. 막히면 STOP·보고.

| 메타 | 값 |
|------|----|
| ID | `BR-WS-25-budget-refine` · 2026-06-26 |
| 격리 | ud-ops `feat/sroi-integration` in-place |
| 근거 | **ADR-030(Accepted) 범위 내 정교화** — 결정 변경 금지(OR 잔차·단가·워터폴·강제재분배금지 동결). |

## 🎯 Mission
ADR-030 Negative 2건 해소: ① **진단 로직 이중화 제거**(엔진+canvas 중복 → 단일 소스) ② **costingDefaults 정교화**(현 flat 근사 → 세션 밀도·기간·채널 반영, costingExamples 정합).

## 📋 현재 (정독)
- `src/lib/program-design/budget-calc.ts` — `calcBudget(rules,input)` 워터폴+AC bottom-up+PC+OR잔차+`split`+warnings. costingDefaults에서 opsFte·pmInputRate 읽음(BR-WS-18). 진단(split/관찰비교 warning) 산출.
- `src/components/projects/workspace/BudgetCalcCanvas.tsx` — PM 라인 편집(acEdits/pcEdits) 반영 위해 **진단 로직을 useMemo로 재구현**(엔진과 1:1 미러 — 중복). 관찰분할 참조 카드.
- `data/program-design/budget-rules.json` — `costingDefaults`(opsFte short/long·pmInputRate·coachingRatio…) + `costingExamples`(해커톤 단기·아산두어스 장기) + `drSplitObserved`.

## 🎯 Scope
### CAN touch
- `src/lib/program-design/budget-calc.ts` (진단 순수 헬퍼 export + costingDefaults 정교화)
- `data/program-design/budget-rules.json` (`costingDefaults` 보강만 — 단가/워터폴/drSplitObserved 불변)
- `src/components/projects/workspace/BudgetCalcCanvas.tsx` (중복 진단 제거 → 헬퍼 재사용)
### MUST NOT touch
- 워터폴 비율·단가(coachRates2026·personnel·design)·`drSplitObserved` — **불변**
- OR 공식(`DR−PC−AC` 잔차)·강제 재분배 금지(ADR-030) · `infer-budget.ts` · prisma · `invokeAi` · `components/ui/**` · 다른 컴포넌트

## 🛠 Tasks
1. **진단 단일 소스(budget-calc.ts)** — 순수 헬퍼 `export function computeBudgetDiagnostics(rules, { Rprime, DR, ac, pc }): { split:{pcRate,acRate,orRate}, warnings: string[] }` 추출. `calcBudget`이 이걸 호출(현 인라인 진단 대체). **canvas도 편집 후 ac/pc로 이 헬퍼 호출** → 중복 제거. 결과 동일성 보장(리팩터, 동작 무변경).
2. **costingDefaults 정교화(JSON + 엔진)** — flat opsFte(단기0.3/장기0.5)를 **세션 밀도·기간 반영**으로:
   - 새 키 예: `opsFte: { perSessionBump, base, cap }` 또는 `sessionDensityBands`(회차수/개월 → FTE). costingExamples(해커톤 운영 ratio 0.1~0.2 단기 / 아산두어스 0.2 장기·다회차)에 모순 없게 calibrate.
   - 코치 등급 기본 믹스(현 전부 '메인') → `coachGradeMixDefault`(예: 메인 다수 + 보조 일부)로 AC 현실화 가능하게(엔진이 읽어 가중). **단가는 기존 키 그대로**, 믹스 비율만 데이터.
   - 모든 신규 수치 = `costingDefaults`(데이터). 하드코딩 0. 값 부재 시 기존값 graceful fallback.
3. **canvas 정리** — 중복 진단 useMemo 삭제, `computeBudgetDiagnostics` 재사용. 관찰분할 참조 카드·편집 반영 동작 보존.
4. ⚠️ **범위 한계 명시(보고)**: "추가 실예산 전수 재분석으로 프로그램별 완전 정합"은 본 브리프 밖(원본 XLSX 재분석 필요) — costingExamples 기반 근사 개선까지만. ADR 후보로 보고.

## 🧪 Self-Verification
- [ ] `typecheck`·`lint`(신규0)·`check:manifest`·`build` 통과 · `git diff` ⊆ 3파일
- [ ] 진단 단일 소스(canvas 중복 제거) — 같은 입력서 엔진/canvas 진단 동일. OR 잔차·단가·워터폴 불변.
- [ ] costingDefaults 신규 수치 전부 JSON. 부재 시 fallback(throw X). 강제 재분배 없음.
- [ ] sanity: 6회차·예산충분 케이스서 마진이 0회차 때보다 현실 범위에 가까워짐(AC 증가). (완전 수렴은 실예산 데이터 후속.)
- [ ] ⚠️ 메인이 프리뷰+Chrome 예산 단계 사후 검수 → **코드 ✓**. 백그라운드 dev·커밋 금지.

## 📤 Return (5섹션): ✅한일/❌못한일/🤔결정/🔬검증(`코드 ✓`+git diff/`시각 미확인`)/⚠️위험

## ⚠️ 주의
- ADR-030 동결 준수(OR 잔차·단가·워터폴·강제재분배금지). 정교화는 costingDefaults·진단 리팩터만. 커밋은 메인.
