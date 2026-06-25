# ADR-030: 예산 적산 캘리브레이션 — 정직한 bottom-up + drSplitObserved 가드(강제 끼워맞춤 금지)

**Status:** Accepted (2026-06-25, 사용자 "예산 적산 매핑 정교화" 지시 + 메인 세션 설계)
**Date:** 2026-06-25
**Deciders:** 사용자 (예산 지식화·"모두 지식화"·보수적 원칙) + 메인 세션
**관련:** BR-WS-14(적산 엔진)·BR-WS-15(단계 라이브 연동) · 데이터 = `data/program-design/budget-rules.json`(권위)

## Context

`src/lib/program-design/budget-calc.ts`의 bottom-up 적산이 **마진(OR)을 과대 산출**한다 — 6회차 플랜에서 OR = DR의 77.7% (관찰 중앙 15.9%의 ~5배).

근본 원인 (코드 확인):
- AC(실비)가 **구조적으로 과소**다. 운영비 = `months × perMonth × 0.5 FTE`(flat), 행사비 = 세션에 event/milestone 있을 때만, 홍보·디자인 = 1식. sparse 커리큘럼이면 AC ≪ DR.
- PC(인건비) = `months × PM monthly × 0.3`(flat 투입률).
- OR = **잔차** `DR − PC − AC` → AC/PC가 보수적으로 낮으면 OR이 그만큼 부푼다.
- 매직넘버(`OPS_FTE=0.5`, `PC_RATE=0.3`, 코칭 `× coaches` 암묵 비율)가 **코드 하드코딩** — "가변=데이터" 원칙 위반.

이미 가진 진실: `budget-rules.json.waterfall.drSplitObserved` = 26개 실예산의 DR 분할 관찰값.
- **PC median 8.3%** (range 1.9–25.1%) of DR
- **AC median 60.4%** (range 12.9–83.8%) of DR
- **OR median 15.9%** (range 0.9–76.8%, recommendedTarget 10%, guard: OR<5% 경고·OR>20% 재검토) of DR

`costingExamples`(해커톤·아산두어스)는 실제 적산 패턴(role×grade×qty×ratio)을 보여준다.

## Decision

**bottom-up 정직성 유지 + 수량 현실화(데이터화) + drSplitObserved를 캘리브레이션 앵커·가드로.** **강제 끼워맞춤(top-down 재분배) 금지** — 보수적·투명 원칙(SROI/예산은 렌즈, 부풀리지 않음)과 충돌하므로.

### 1) 매직넘버 → 데이터 (budget-rules.json `costingDefaults` 신설)
코드의 `OPS_FTE`·`PC_RATE`·코칭/강의 암묵 비율·행사 배수를 `budget-rules.json`의 새 `costingDefaults` 섹션으로 이관. 코드는 읽기만. (예: `opsFteByDuration`, `pmInputRate`, `coachingRatioDefault`, `eventCountMultiplier`.) **하드코딩 0 복원.**

### 2) 수량 현실화 ("회차당 보수적 2씩" 교정)
`costingExamples` 패턴을 템플릿으로:
- **운영비 FTE를 기간·강도에 비례**(flat 0.5 폐기) — costingDefaults에서.
- **코칭/강의 qty·ratio**를 costingExamples 패턴에 맞춤(코치 수 중복곱 점검 — 아산두어스 예시는 amount=rate×qty, 코치수는 qty에 내재).
- **누락 AC 카테고리 보강**(운영·홍보·공간·모집 등 acItemPatterns 활용)이 가능하도록 매핑 확장.

### 3) drSplitObserved 가드 + 참조 (핵심 — 정직한 가시화)
적산 후 `pcRate/acRate/orRate = 각/DR` 산출 → 관찰 median·range와 비교:
- **가드 경고**: OR < 5% 또는 OR > 20% → 기존 경고 유지·강화.
- **참조 진단**(신규): OR가 관찰 range 밖이면 *왜*를 짚는다. 예: `"AC 계산값 X원(DR의 Y%) vs 관찰 중앙 60% — 운영비/행사/회차 누락 가능. 회차·코치등급·투입률 점검."` **숨은 재분배 없이** PM이 직접 고치게.
- 캔버스에 **관찰 분할 참조 카드**(PC 8% / AC 60% / OR 16% 중앙) 표기 → PM이 현실 기준 인지.

### 동결 (계약)
- 워터폴 비율(vat/ic/idc/dr) = 29건 편차0 수렴 → **불변**.
- 단가(코치/강의/운영/특강/디자인/인건비) = 2026 단가표 SSoT → **불변**(coach-finder 정합).
- OR = 잔차(`DR−PC−AC`) 정의 **유지**. 캘리브레이션은 AC/PC **수량**만 손댄다, OR 공식 아님.
- **top-down 강제 재분배·target 마진 끼워맞춤 금지.**

## Consequences

### Positive
- 마진이 현실(관찰 range)에 수렴 — sparse 커리큘럼의 비현실적 77% 제거.
- 매직넘버 데이터화 → "가변=데이터" 복원, PM·관리자가 단가표만 고치면 반영.
- **정직성 유지** — 진짜 저비용 프로그램이면 그대로 낮게 나오고, 대신 *가드가 가시화*. 숨은 보정 없음.
- 관찰 분할 참조로 신입 PM도 "이 예산이 현실적인지" 자가 판단.

### Negative / Trade-offs
- costingDefaults 캘리브레이션은 근사 — 완벽한 프로그램별 정합은 추가 실예산 학습 필요(후속).
- 여전히 "PM 편집 초안" — 자동 산출이 정답을 보장하진 않음(설계 의도).

### 왜 강제 끼워맞춤이 아닌가
실제로 2회 코칭만 필요한 프로그램에 12회분 비용을 강제로 채우면 *거짓 예산*이다. 사용자의 보수적·투명 원칙(SROI=렌즈, 부풀리지 않음)과 정면 충돌. 그래서 **수량 현실화 + 가드 가시화**가 정직한 해법.

## References
- 데이터: `data/program-design/budget-rules.json` (waterfall.drSplitObserved · costingExamples · acItemPatterns · costingDefaults[신설])
- 엔진: `src/lib/program-design/budget-calc.ts` · 캔버스: `src/components/projects/workspace/BudgetCalcCanvas.tsx`
- 별개 엔진(불변): `src/lib/express/infer-budget.ts`(top-down 비율, 교차검증용)
- 브리프: BR-WS-18(본 ADR 구현)
