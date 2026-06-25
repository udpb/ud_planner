# Brief BR-WS-18 — 예산 적산 캘리브레이션 (ADR-030 구현: 정직 bottom-up + 가드 + 데이터화)

> **자급자족.** 본 파일 + `docs/decisions/030-budget-costing-calibration.md` + `data/program-design/budget-rules.json`. 막히면 STOP·보고.

| 메타 | 값 |
|------|----|
| ID | `BR-WS-18-budget-calibration` · 2026-06-25 |
| 격리 | ud-ops `feat/sroi-integration` in-place |
| 근거 | **ADR-030 (Accepted)** — 반드시 그대로. 결정 변경 금지. |

## 🎯 Mission
적산 마진 과대(OR=DR의 77.7%, 관찰 중앙 15.9%)를 ADR-030대로 고친다: ① 매직넘버 → `budget-rules.json` 데이터, ② 수량 현실화(운영비 FTE 비례 등), ③ **drSplitObserved 가드 + 참조**(강제 재분배 금지 — 정직 유지).

## 📋 현재 (정독)
- `src/lib/program-design/budget-calc.ts` — `calcBudget(rules, input)` 순수 결정론. AC bottom-up: 코칭(`coachingMain*coachingCount*coaches`, L260) · 강의(L271) · 행사(eventLines) · 운영(`months*opsMain*0.5`, **L283 `OPS_FTE=0.5` 하드코딩**) · 홍보·디자인. PC(`months*pmRate*0.3`, **L315 `PC_RATE=0.3` 하드코딩**). OR=`DR−pc−ac`(L329). 경고 L332~350(이미 marginRate<0.05·>0.2 경고 有).
- `data/program-design/budget-rules.json` — `waterfall.drSplitObserved`(PC 0.083·AC 0.604·OR 0.159 of DR, L21~25) · `costingExamples`(해커톤·아산두어스 role×rate×qty×ratio, L105~120) · `acItemPatterns`(L122~135). **읽기 전용 단가/비율 — 단, `costingDefaults` 신규 섹션 추가는 본 브리프 허용**(매직넘버 이관).
- `src/components/projects/workspace/BudgetCalcCanvas.tsx` — calcBudget 결과 표시(워터폴·AC/PC 라인·OR·marginRate·warnings). client useMemo 라이브. PM 라인 편집(client state).

## 🎯 Scope
### CAN touch
- `src/lib/program-design/budget-calc.ts` (수량 로직·가드·costingDefaults 읽기)
- `data/program-design/budget-rules.json` (**`costingDefaults` 섹션 신설만** — 기존 단가/비율/워터폴 **불변**)
- `src/components/projects/workspace/BudgetCalcCanvas.tsx` (drSplitObserved 참조 카드 + 진단 메시지 표시)
### MUST NOT touch
- `waterfall` 비율(vat/ic/idc/dr) · 기존 단가(coachRates2026·personnelRatesB2GB2B·designPrintPhoto2026·acItemPatterns) — **불변(2026 단가표 SSoT)**
- `src/lib/express/infer-budget.ts`(별개 엔진) · prisma · `invokeAi` · `components/ui/**` · 다른 컴포넌트/라우트
- **OR 공식**(`DR−PC−AC` 잔차) 변경 금지 · **top-down 강제 재분배·target 마진 끼워맞춤 금지**

## 🛠 Tasks
1. **costingDefaults 신설(budget-rules.json)** — 코드의 매직넘버를 데이터로:
   ```json
   "costingDefaults": {
     "_desc": "ADR-030 — 적산 수량 기본값(가변·데이터화). 단가는 위 섹션이 SSoT, 여기는 투입률/수량만.",
     "opsFte": { "_desc": "운영 투입률(FTE) — 기간 비례", "shortMonths": 3, "shortFte": 0.3, "longFte": 0.5, "minFte": 0.3 },
     "pmInputRate": { "_desc": "PC PM 투입률", "default": 0.3 },
     "coachingRatio": 1.0,
     "lectureRatio": 1.0,
     "eventCountMultiplier": 1
   }
   ```
   값은 합리적 기본(현 코드값 보존 + 기간 비례 추가). 정확한 수치는 costingExamples와 모순 없게.
2. **calcBudget 수량 현실화** — `OPS_FTE`·`PC_RATE` 하드코딩 제거 → `rules.costingDefaults`에서 읽기(없으면 graceful 기존값 fallback, 던지지 않음). 운영 FTE는 기간 비례(`months >= shortMonths ? longFte : shortFte`). 코칭/강의 ratio도 costingDefaults 적용. **단가는 그대로 기존 키에서.**
3. **drSplitObserved 가드 + 진단(calcBudget)** — 결과에 `split: { pcRate, acRate, orRate }`(각/DR) 추가. `rules.waterfall.drSplitObserved`와 비교해 진단 warning 생성:
   - OR가 관찰 range 밖(또는 >0.20)이면: `"마진 ${pct}% — 관찰 중앙 ${(observed.orRate.median*100)}% 초과. AC 계산 ${(acRate*100)}% vs 관찰 ${(observedAc*100)}% — 운영비/행사/회차/코치등급 점검."` (숫자는 데이터에서, 단정 금지).
   - 기존 <0.05·>0.20 경고는 유지.
   - **재분배·끼워맞춤 절대 금지** — 진단 메시지만.
4. **BudgetCalcCanvas 참조 카드** — 관찰 분할(`drSplitObserved`) 참조 표기(예: "실예산 관찰: 인건비 8% · 실비 60% · 마진 16% (DR 기준)") + 위 진단 warning 노출. PM이 현실 기준 인지하게. 디자인킷(accent #F05519·radius 0·틴트, 경고는 절제된 강조).
5. **BudgetResult 타입 확장** — `split` 필드 추가(파급 점검: 이 타입 쓰는 곳 BudgetCalcCanvas만 확인).

## 🧪 Self-Verification
- [ ] `typecheck`·`lint`(신규0)·`check:manifest`·`build` 통과 · `git diff --name-only` ⊆ 3파일(+ADR/README는 메인이 이미 커밋)
- [ ] 매직넘버(OPS_FTE/PC_RATE) 코드에서 사라지고 costingDefaults에서 읽힘. 단가/워터폴 **무변경**(diff로 확인).
- [ ] 가드: 6회차·총예산 충분 케이스에서 진단 warning이 관찰값 인용하며 뜸. OR 공식 불변(DR−PC−AC).
- [ ] **재분배 없음** — AC/PC는 bottom-up 그대로, OR만 잔차.
- [ ] ⚠️ 메인이 Vercel 프리뷰+Chrome으로 예산 캔버스 사후 검수 → **코드 ✓** 보증. 백그라운드 dev 금지. 커밋 금지.

## 📤 Return (5섹션): ✅한일/❌못한일/🤔결정/🔬검증(`코드 ✓`+git diff/`시각 미확인`)/⚠️위험
- 🤔결정: costingDefaults 구체 수치·운영 FTE 비례식은 ADR-030 범위 내 구현 판단으로 OK(보고). ADR 범위 밖 결정 발견 시 후보로만 보고(직접 ADR 금지).

## ⚠️ 주의
- **ADR-030이 계약.** 워터폴·단가 동결, OR 잔차 유지, 강제 재분배 금지. 데이터화는 costingDefaults 섹션만. 커밋은 메인(프리뷰 검수 후).
