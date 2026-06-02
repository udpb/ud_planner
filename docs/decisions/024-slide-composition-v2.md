# ADR-024: 슬라이드 합성 모델 v2 — 레이아웃 아키타입 + 고밀도 + detail 레이어

- **상태**: Proposed (2026-06-01)
- **결정일**: 2026-06-01
- **결정자**: udpb@udimpact.ai + AI Architect (메인 세션)
- **Scope**: `src/lib/diagrams/*`(렌더러·패턴 스키마) · `src/lib/express/produce-slide-specs.ts`(생성) — **본문/제안 스키마(express/schema.ts)·invokeAi·Prisma 불변**
- **관련**: ADR-021(단일 엔진 — slideSpecs 소비), ADR-014(디자인 토큰), 디자인 킷(공식 템플릿), `learned-slide-patterns.json`(당선 109덱 학습)

---

## 배경 (Context)

QUAL-2 산출 PPTX(`docs/samples/sample-draft-B2G-v2.pptx`, 22슬라이드)에 대한 사용자 피드백(2026-06-01):

1. **근거가 출처 태그뿐.** "• …10년 노하우 (언더독스 내부 실적)" — 키메시지를 *세부 디테일이 받치지 않고* 출처만 달림.
2. **각 슬라이드에 어울리는 레이아웃이 없음.** 모든 본문 슬라이드가 `specSlide()` 단일 골격(키커→헤드라인→캡션→선→도식1개→근거박스→푸터). 패턴은 가운데 도식만 교체.
3. **페이지 밀도가 너무 낮음.** 도식 하단 ~40% 공백. 실제 당선 평균(`avgBlocksPerSlide 12.5`)의 절반 이하.
4. **도식 다이나믹스 약함.** 슬라이드당 도식 1개·짧은 라벨·복합 배치 없음.

근본 원인(코드 추적):
- **단일 템플릿**: 본문 슬라이드 렌더 함수가 `specSlide()` 하나뿐.
- **밀도 억제 가드**: `produce-slide-specs.ts` 프롬프트가 "한 슬라이드=한 메시지", "초과 위험이면 2개로 분할", "도식 항목 상한(process≤6·kpi≤6셀…)", 라벨 "≤40자"를 강제 → 학습 목표(블록 12.5)보다 낮게 수렴. "풍부하게"와 "넘치지 마"를 동시에 시키니 가드가 이긴다.
- **근거 2필드**: `SlideSpec.evidence = {text, source}` 뿐 → 구조상 "주장+출처"만 가능. 메커니즘·how·세부를 담을 **본문(body) 레이어 부재.**

사용자 지시: "좋은 제안서가 1번, 토큰 무제한"(2026-06-01). 스코프 확정: **레이아웃+밀도+근거구조 먼저, 실데이터 grounding(DATA-2)은 다음.**

안 하면: PPTX가 영원히 "헤드라인+빈약 도식+출처태그"에 머물러 당선 덱 수준에 못 닿음.

---

## Options Considered

### Option A — 프롬프트만 튜닝 (밀도 상한만 올림)
- 기각: 단일 템플릿·근거 2필드라는 *구조* 한계가 남음. 밀도를 올려도 담을 그릇(레이아웃·body 필드)이 없어 잘리거나 공백.

### Option B — 슬라이드 합성 모델 자체를 v2로 재설계 (채택)
- 레이아웃 아키타입(목적별 N종) + 페이지 채움 + `SlideSpec`에 body/detail 레이어 + evidence를 정량+메커니즘으로.
- 장점: 4개 지적 모두 구조적으로 해소. 당선 덱(109) 기준 밀도. DB·LLM 무관하게 렌더러는 결정론적 검증 가능.
- 단점: 렌더러 + 스키마 + 생성 프롬프트 동시 변경. → 하위호환(신 필드 optional)으로 회귀 방어.
- **채택.**

---

## Decision

**슬라이드를 "단일 템플릿 + 단일 도식"에서 "목적별 레이아웃 아키타입 + 고밀도 + detail 레이어"로 재설계한다.**

### 1. 레이아웃 아키타입 (단일 → 목적별 선택)
`SlideSpec`에 `layout` 필드 추가. 렌더러는 layout별 전용 배치 함수를 가진다(최소 6종):
- `hero-stat` — 지배적 빅넘버/핵심 주장 + 보조 밴드 (임팩트·실적 헤드라인)
- `split-visual` — 좌 서술(body 프로즈)/우 도식 (본문 다수)
- `full-diagram` — 도식 풀폭 지배 (process-flow·timeline·matrix)
- `detail-grid` — 다셀 고밀도 그리드 (주차 커리큘럼·모듈)
- `comparison` — 전후/대비 지배 (before-after·comparison-table)
- `narrative` — 콜아웃이 있는 텍스트 고밀도 (배경·논거)

layout은 **섹션 + 컨텐츠 목적**으로 선택(생성 시 LLM이 태깅, 학습된 섹션별 패턴 빈도를 시드로). 표지·INDEX·디바이더·마무리는 공식 템플릿(`underdogs-proposal-template-v01-16-9.pptx`) 충실 반영.

### 2. 페이지 채움 (밀도 목표 = 당선 평균)
- 목표: 슬라이드당 블록 ~12(학습값 12.5), 근거 ~3.
- "2개로 분할/항목 상한" **억제 가드 제거** → 컨텐츠를 슬라이드 가용 높이에 맞춰 *채우는* 분배 알고리즘. 진짜 넘칠 때만 spill.
- 하단 dead space 최소화(가용 높이의 일정 비율 이상 채움).

### 3. detail 레이어 (근거 = 진짜 뒷받침)
- `SlideSpec`에 `body` 추가: 키메시지를 받치는 세부(메커니즘·how·구체 절차). optional, 하위호환.
- `evidence` 업그레이드: 정량 수치 + 메커니즘을 요구. **출처만 단 빈 근거 금지**(생성 프롬프트 가드). 예: "(언더독스 내부 실적)" 단독 금지 → "누적 20,211명 육성, 평균 생존율 X% (언더독스 2015–2025)" 형태.
- ⚠️ 실제 *숫자 truthfulness*(허위·미검증 차단)는 본 ADR 범위 밖 = **DATA-2(실 자산 grounding)**.

### 4. 검증 분리
- **렌더러/레이아웃/밀도**: fixture `slideSpecs.json`에서 `.pptx` 빌드 → 슬라이드별 도형 수·텍스트량·dead space 측정. **DB·LLM 무관, 결정론적.** 메인 직접 검증.
- **생성(layout 선택·body·evidence 품질)**: LLM 필요 → 환경 가용 시 샘플 재생성으로 검증.

### 5. 불변 (변경 금지)
- `express/schema.ts` 섹션 키 1~7·슬롯 enum (ADR-021 §2 동결).
- `invokeAi` 시그니처 · Prisma 핵심 모델.
- 디자인 킷: 단일 accent(F05519)·라운드/그림자/이모지 금지·tint vs stroke 박스.

---

## Consequences

### Positive
- 4개 피드백 모두 구조적 해소. 당선 덱(109) 기준 밀도·레이아웃.
- 렌더러가 결정론적 검증 가능 → 품질 회귀 방어.
- detail 레이어가 DATA-2(실 grounding) 도착 시 "진짜 숫자"를 담을 그릇이 됨.

### Negative / Trade-offs
- 렌더러 코드량 증가(layout별 함수). → 공통 헬퍼로 중복 억제.
- 생성 프롬프트 변경 → 기존 slideSpecs와 형태 차이. 신 필드 optional로 하위호환.

### Follow-ups
- [ ] EX-3 브리프 — 스키마(layout·body) + 렌더러 아키타입 6종 + 생성 프롬프트 밀도/디테일 + fixture 검증 하니스
- [ ] 메인 직접 검증: fixture 렌더 밀도(블록 수·dead space) before/after 비교
- [ ] **DATA-2** — 실 당선 전문/숫자 grounding(`learn-winning-fulltext` + `embed-winning-chunks` 운영화)로 evidence truthfulness 확보 (별 ADR/브리프)

## References
- 피드백: 사용자 PPTX 리뷰 2026-06-01
- 관련 코드: `src/lib/diagrams/{slide-pattern,pptx-builder,learned-patterns,pptx-extractor}.ts` · `src/lib/express/produce-slide-specs.ts`
- 레퍼런스: `design-kit/templates/underdogs-proposal-template-v01-16-9.pptx` · `design-kit/learned-slide-patterns.json`(109덱·블록12.5) · `design-kit/diagram-samples/*`
- 관련 ADR: 021(단일 엔진)·014(디자인 토큰)

## Teaching Notes
- 밀도를 못 올리는 건 모델이 게을러서가 아니라 **담을 그릇(레이아웃·필드)이 없어서**다. 프롬프트로 "풍부하게"를 외쳐도 가드와 단일 템플릿이 이긴다.
- "근거"가 출처 태그로 수렴하는 건 evidence가 `{text, source}` 2필드라서다. 구조가 메시지를 결정한다.
- 레이아웃은 발명하지 말고 **실제 당선 덱(109)에서 학습**한다. `learned-slide-patterns.json`이 정답지.
- 렌더러는 LLM/DB 없이 fixture로 결정론적 검증되게 분리하라 — 품질 회귀를 숫자로 잡는다.
