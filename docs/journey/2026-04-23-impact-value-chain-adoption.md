# 2026-04-23 — Impact Value Chain 프레임 채택 (Phase F Wave 0 시작)

## 세션 맥락

Phase E 완료(2026-04-21) 직후. 50건 uncommitted 를 12 커밋으로 안전하게 정리한 체크포인트에서 출발. 다음 할 일로 스냅샷에 적혀 있던 건 "임팩트 리서치 2개 → rfp/curriculum 이동" 수준의 가벼운 작업이었으나, 이 대화 도중 **파이프라인 전체의 논리 골격** 을 재정의하는 구조적 결정으로 확장됨.

## 의사결정 과정 (시간 순)

### 1. 출발점 — 가벼운 리서치 재배치

PM(사용자) 이 리서치 3개 중 2개를 앞쪽 스텝으로 이동하라고 지시. Claude 는 "impact 2 → rfp/curriculum, impact 에 최소 2개 유지를 위해 신규 1개 추가" 로 제안.

### 2. 사용자의 재프레임 — "앞이랑 뒤에 두면"

> "너가 생각했을 때 임팩트가 앞이랑 뒤에 두먼 오는 건 어때?"

이 한 줄이 결정적. Claude 가 "같은 임팩트 주제를 앞(씨앗)·뒤(수확) 로 분할" 해석을 제시. 2개를 Step 1·2 로 보내는 것이 단순 이동이 아니라 **의도적 설계 패턴** 이라는 관점 전환.

### 3. 사용자의 프레임 확장 — 5단계 + 루프

> "구조적 설계를 할 때 내가 생각하는 건 아래 5단계로 진행한 후 루프를 돌리면서 그 싱크가 모든게 얼라인이 되어서 논리적 구조가 클리어 한 가 이게 뭔까 결과물이 시각적으로도 직관적으로 깔끔하게 떨어지는 느낌이 들었으면 좋겠어
>
> 1. impact → 사업의 의도 before&after 분석
> 2. input → 예산, 기관 보유 내용, 우리가 가지고 있는 에셋 등 정확하게 정리
> 3. output → 산출될 결과물 예상 or RFP
> 4. activity → 커리큘럼, 코칭 등등 기획
> 5. outcome → 구체적인 정량화 된 기대효과"

이 시점에 대화 범위가 **리서치 3개 배치** 에서 **파이프라인 6 UI 스텝 전체의 의미 재정렬** 로 확장. Claude 는 현재 UI 의 구조적 모순 2개를 식별:
- Step 1 이 ①②③ 3개 논리 단계를 뒤섞어서 제시 → PM 혼선
- Step 4 "예산 + SROI" 가 ②②와 ⑤⑤를 한 화면에 혼재

### 4. 사용자의 결정적 한 문장

> "outcome은 SROI로 나올거고"

이 7글자가 ⑤ Outcome 의 정체를 SROI 로 고정. 그 즉시 다음이 파생됨:

- **SROI = ②Input 대비 ⑤Outcome 의 비율** 이라는 정의가 "루프" 개념의 물리적 실체 제공. 추상적이던 "얼라인 검증" 이 SROI 숫자 축 3방향 체크로 구체화.
- **Step 4 의 "예산 + SROI" 분리 필요성** 이 논리적으로 확정. SROI 는 ② 가 아니라 ⑤ 이므로 Step 5 로 이동.
- **Step 5 의 정체가 명확해짐**: "SROI Forecast 가 최종 확정되는 곳".

### 5. 범위 확정 — Plan A 채택

Claude 가 3가지 범위 선택지 제시:
- **A 풀 적용** (8 Wave, 2일): PipelineContext 메타·Step 4·5 재구성·다이어그램·Step 1 3탭·루프 Gate·ADR
- **B 구조만** (1일): Step 4·5 분리 + 다이어그램만
- **C 제일 가벼움** (1시간): 리서치 2 이동만

사용자 답:
> "A로 진행하자 이 모든 과정들 기록 잘해주고 변경사항들 전체 파일로 반영해주고"

→ Phase F Impact Value Chain Wave 개시.

## 이 결정이 바꾸는 것

### 개념 레이어
- 파이프라인이 **의미 레이어(Value Chain 5단계) + 공정 레이어(UI 6 스텝)** 2겹으로 정식화됨
- SROI 가 단순 산출 수치에서 **루프 수렴점** 으로 격상

### 코드 레이어
- 신규: `src/lib/value-chain.ts` (5단계 스펙 + 매핑)
- 확장: `PipelineContext.valueChainState` (currentStage · completedStages · sroiForecast · loopChecks)
- 신규: `LoopAlignmentChecks` 타입 + Gate 4 룰
- 재구성: Step 4 → "예산 설계", Step 5 → "임팩트 + SROI Forecast"

### 데이터 레이어
- DB 스키마 변경 **없음** (SROI 는 UI 라우팅만 이동, 데이터는 그대로)
- 리서치 ID 변경: `imp-outcome-indicators` → `rfp-outcome-indicators`, `imp-diagnostic-tools` → `cur-diagnostic-tools`
- 리서치 신규: `imp-outcome-benchmark`

### UX 레이어
- 우측 pm-guide 상단에 Value Chain 다이어그램 상시 노출
- Step 1 에 ①②③ 3 탭 (가장 혼란스러웠던 곳 정리)
- Step 5 에 Alignment Check 카드 3개 (SROI 숫자 확정 트리거)
- 리서치 카드에 단계 뱃지 + 씨앗/수확 링크

## 기록 방침

사용자 지시: *"이 모든 과정들 기록 잘해주고"*

- **ADR-008** — 의사결정 근거·대안 비교·리스크 (`docs/decisions/008-impact-value-chain.md`)
- **architecture/value-chain.md** — 구현 계약·타입·단계 정의
- **이 파일** — 대화 맥락·결정의 흐름·사용자 원문 인용 보존
- **CLAUDE.md** — 설계 철학 섹션에 5단계 Value Chain 추가
- **ROADMAP.md** — Phase F Impact Value Chain Wave 8개 세부 항목 추가
- **MEMORY.md** — 세션 히스토리 엔트리 + 주요 결정 메모 링크

## Wave 진행 로그 (실시간 갱신)

- [x] Wave 0 — 문서 (이 파일 포함) · 커밋 `0f416b5`
- [x] Wave 1 — 코어 타입 · 커밋 `bcd36c0` · typecheck 0 error
- [x] Wave 2 — 스키마 점검 · **마이그레이션 불필요** (아래 결론)
- [ ] Wave 3 — 리서치 재분배
- [ ] Wave 4 — Value Chain 다이어그램
- [ ] Wave 5 — Step 4·5 재구성 (API 라우팅만)
- [ ] Wave 6 — Step 1 3 탭
- [ ] Wave 7 — 루프 Gate
- [ ] Wave 8 — 검증 · 메모리 · 완료 기록

## Wave 2 스키마 점검 결론 (2026-04-23)

조사 결과 `prisma/schema.prisma`:
- `Project.sroiForecast` (Json) — SROI 계산 결과. Project 직접 필드.
- `Project.sroiCountry` (String, 기본 "한국")
- `Project.sroiActual` (Json) — 실측 SROI
- `Budget` 모델 (line 404) — pcTotal · acTotal · margin · marginRate + items만. **SROI 필드 없음**.

**즉 SROI 데이터는 이미 Budget 과 분리된 Project 직속 필드.** Wave 5 에서 UI 만 Step 4 → Step 5 로 라우팅 교체하면 되고, **DB 스키마 변경·마이그레이션 불필요**.

이는 2026-04-23 대화에서 Claude 가 ADR 작성 시 예상한 결론 ("스키마 변경 최소화") 과 일치.

다음 Wave 에 영향:
- Wave 5 SROI UI 이동: API 엔드포인트 유지 (Project.sroiForecast 읽기/쓰기). 라우팅만 step-budget → step-impact 로 교체.
- Wave 7 루프 Gate: `Project.sroiForecast.ratio` 를 축 수치로 직접 사용 가능.

## 원칙 재확인

이 세션은 [feedback_gatekeeping](게이트마다 설계 재검토 책임) 을 정확히 수행한 사례:

> "각 Phase/Wave 게이트에서 설계 재검토, 품질 위한 변경은 사용자에게 제시"

"리서치 2개 이동" 이라는 작은 태스크 앞에서 설계 재검토가 일어났고, 구조적 개선 기회가 발견되자 사용자에게 즉시 제시했다. 그 결과 6시간짜리 작업이 2일짜리 구조 개편으로 확장됐지만, **이 확장이 없었다면 Step 5 임팩트 모듈이 계속 "예산과 SROI 가 섞인 모호한 스텝" 으로 남았을 것**.

제1원칙 ([feedback_first_principle](RFP 설득력 + 언더독스 차별화)) 도 이 결정으로 강화됨: 루프 Alignment 의 Impact 방향 체크는 "평가위원 설득력" 을 SROI 숫자로 자동 검증하는 장치.
