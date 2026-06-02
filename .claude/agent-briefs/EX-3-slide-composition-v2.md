# EX-3 — 슬라이드 합성 모델 v2 (레이아웃 아키타입 + 고밀도 + detail 레이어)

> 자급자족 브리프. `이 브리프 + CLAUDE.md + AGENTS.md + docs/glossary.md + docs/decisions/024-slide-composition-v2.md` 만으로 작업. 의문 = 추측 금지, STOP 후 메인 보고.

- **트랙/ID**: EX-3
- **상태**: 🟡 in-progress
- **근거 ADR**: ADR-024 (Proposed) — 반드시 정독.
- **선행 사실**: 사용자 PPTX 피드백 — ①근거가 출처 태그뿐 ②슬라이드마다 어울리는 레이아웃 없음(단일 템플릿) ③페이지 밀도 너무 낮음(하단 ~40% 공백) ④도식 다이나믹스 약함.

---

## 1. 목표 (한 문장)
`docs/samples/sample-draft-B2G-v2.pptx` 처럼 "헤드라인+빈약 도식 1개+출처태그+빈 하단" 슬라이드를, **목적별 레이아웃 아키타입 + 당선 덱 수준 밀도(블록 ~12) + 키메시지를 받치는 detail/근거** 슬라이드로 바꾼다.

## 2. 스코프 — CAN touch / MUST NOT touch

**CAN touch (이것만):**
- `src/lib/diagrams/slide-pattern.ts` — `SlideSpec` 스키마에 `layout`·`body` 추가 (optional, 하위호환), 패턴 데이터 상한 상향.
- `src/lib/diagrams/pptx-builder.ts` — 렌더러 재설계 (레이아웃 아키타입 함수들 + 페이지 채움 + 도식 렌더 고도화).
- `src/lib/express/produce-slide-specs.ts` — 생성 프롬프트 (밀도 목표·layout 선택·body/근거 디테일 강제·억제 가드 제거).
- `src/lib/diagrams/learned-patterns.ts` — 필요 시 export 추가만 (읽기 강화).
- **신규**: `scripts/_render-fixture.ts` (검증 하니스), `docs/samples/fixtures/slidespecs-B2G.json` (fixture).

**MUST NOT touch:**
- `src/lib/express/schema.ts` 섹션 키 1~7·슬롯 enum (ADR-021 §2 동결).
- `src/lib/ai-fallback.ts` `invokeAi` 시그니처.
- `prisma/schema.prisma` 어떤 모델도.
- 모듈 manifest `reads/writes` 계약.
- `pptx-extractor.ts` 로직 (읽기 참조만 — 레퍼런스 파싱에 import OK, 수정 X).
- 다른 트랙(Express turn/Deep/Brain) 컴포넌트.

## 3. 레퍼런스 (반드시 활용 — 레이아웃을 발명하지 말 것)
- `design-kit/learned-slide-patterns.json` — 실제 당선 109덱/120슬라이드 학습. `avgBlocksPerSlide: 12.5`, `avgEvidencePerSlide: 3.4`, 섹션별 패턴 빈도(섹션2 kpi-grid 40회 등), 실제 당선 헤드라인 30개. **밀도·패턴·헤드라인 톤의 정답지.**
- `design-kit/templates/underdogs-proposal-template-v01-16-9.pptx` — 공식 브랜드 템플릿. `pptx-extractor.ts`의 `extractPptxSlides(buffer)` + `reconstructSlide()` 로 파싱해 표지/디바이더/본문 그리드 좌표·폰트크기·색을 확인하고 **표지·INDEX·디바이더·마무리는 이 템플릿에 충실하게** 맞춰라. (스크립트로 1회 파싱해 구조 파악 후 상수로 반영. 런타임 의존 추가 금지.)
- `design-kit/diagram-samples/*.json` — 실제 당선 슬라이드 도형 추출(좌표·색·텍스트). 레이아웃 아키타입의 존(zone) 배치·도형 크기 감각 참조.
- 디자인 킷 규칙(메모리 `reference_underdogs_design_kit` 정신): 단일 accent `#F05519`(전체 10~15%), 라운드/그림자/이모지/그라데이션 금지, tint(`F0F0F0`)·accentTint(`FDEBE3`) 면 vs stroke 박스. 폰트 NanumHuman(KR)/Poppins(EN·숫자).

## 4. 구현 (ADR-024 Decision 1~4 구체화)

### 4-1. 스키마 (`slide-pattern.ts`)
- `SlideSpecSchema`에 추가:
  - `layout: z.enum(['hero-stat','split-visual','full-diagram','detail-grid','comparison','narrative']).optional()` — 없으면 렌더러가 pattern+sectionNum으로 자동 추론(하위호환).
  - `body: z.array(z.object({ heading: z.string().max(40).optional(), text: z.string().max(400) })).max(4).optional()` — 키메시지를 받치는 세부(메커니즘·how). split-visual/narrative의 좌측 프로즈.
- 패턴 데이터 상한 상향(밀도): process-flow steps max 7→유지하되 description 활용, kpi-grid kpis max 10 유지(렌더는 최대 8 노출), comparison rows max 8, architecture layers max 6, timeline tracks max 6. **`clampDiagramData`는 drop 대신 clamp 유지.** `order` max 5→유지.
- `evidence.text` 의미 가드는 스키마가 아니라 **생성 프롬프트**에서(아래 4-3).
- 신 필드는 전부 optional → 기존 slideSpecs 그대로 통과해야 함.

### 4-2. 렌더러 (`pptx-builder.ts`) — 핵심
- 본문 슬라이드 단일 `specSlide()`를 **layout별 분기**로 교체. layout 미지정 시 추론 규칙:
  - kpi-grid + (impact|track) → `hero-stat`; timeline|process-flow + 풀폭 → `full-diagram`; before-after|comparison-table → `comparison`; body 有 → `split-visual`; 주차/모듈성 grid → `detail-grid`; else → `narrative`.
- **레이아웃 6종** 각각 전용 배치(존 좌표는 16:9 EMU, 기존 `px()`·`textBox()`·`rect()` 헬퍼 재사용):
  - `hero-stat`: 좌 빅넘버(대형 accent, 60~96pt급) + 우/하 보조 도식·근거.
  - `split-visual`: 좌 40% body 프로즈(heading+text 블록들) / 우 60% 도식. 양쪽 높이 채움.
  - `full-diagram`: 헤드라인 아래 도식이 가용 폭·높이 지배. 도식 항목 크게.
  - `detail-grid`: 3~4열 × 2~4행 셀 그리드(주차/모듈). 셀마다 제목+세부.
  - `comparison`: 좌/우 대비 박스 크게 + 행별 근거.
  - `narrative`: 좌 본문 다단 + 우 콜아웃(accent stroke) 박스.
- **페이지 채움 알고리즘**: 가용 세로 영역(헤드라인 하단 ~ footer 위, 대략 y=240~640px)을 컨텐츠로 채운다. 도식/그리드 높이를 가용 높이에 맞춰 신축. dead space(빈 세로 비율) 목표 < 20%. 컨텐츠가 진짜 넘치면 다음 슬라이드로 spill(order+1).
- 도식 렌더 고도화: 라벨 폰트 위계 강화, description/sublabel 적극 노출, 항목 수 상한을 렌더에서도 상향(process 6, kpi 8(2행), table 7, layers 6, timeline 6트랙, hierarchy 5자식).
- 표지/INDEX/디바이더/마무리: 4-3 템플릿 좌표·폰트에 맞춰 정돈(과한 변경 금지, 충실 반영).
- 브랜드 가드 유지: accent 비율 과다 금지, 라운드/그림자/이모지 X.

### 4-3. 생성 프롬프트 (`produce-slide-specs.ts`)
- **억제 문구 제거/완화**: "한 슬라이드=한 메시지"→"한 슬라이드=한 주장 + 그것을 받치는 충분한 세부", "초과 위험이면 2개로 분할"·"도식 항목 상한" 가드 → **밀도 목표(블록 ~12, 근거 ~3)로 교체**. 분할은 "정말 넘칠 때만".
- 슬라이드마다 `layout` 선택을 LLM에 요구(6종 설명 + 섹션별 학습 패턴 빈도를 시드로).
- `body` 생성 요구: 키메시지를 받치는 세부(메커니즘·절차·how) 1~4블록.
- **근거 디테일 강제**: evidence는 "정량 수치 + 무엇을 증명하는지(메커니즘)"를 담아라. **출처만 단 빈 근거 금지** — 예: "(언더독스 내부 실적)" 단독 금지 → 반드시 숫자/사실 + 출처. 단, **수치 창작·부풀림 금지**(기존 가드 유지, 모르면 정성 사실로). 자산 ID·인용마커 금지 가드 유지.
- maxTokens 충분히(LARGE 유지 또는 상향). 섹션당 1~2 슬라이드 유지하되 각 슬라이드가 밀도 목표 충족.

## 5. 검증 (필수 — 메인이 재확인할 근거)
- **결정론적 렌더 하니스** `scripts/_render-fixture.ts`: fixture `docs/samples/fixtures/slidespecs-B2G.json`(신 필드 포함한 대표 6~8 슬라이드, 각 layout 1개 이상 커버)을 읽어 `buildPptx()`로 `.pptx` 생성 + **슬라이드별 측정 출력**: 도형 수, 텍스트 블록 수, 추정 dead space 비율. DB·LLM 없이 `npx tsx scripts/_render-fixture.ts` 로 실행되게.
  - fixture는 직접 손으로 작성(현실적인 B2G 청년창업 예시, body·evidence 풍부).
  - 측정에 `pptx-extractor.ts`의 `extractPptxSlides`+`reconstructSlide` 재사용(읽기) → blocks/withText 통계 출력.
  - **합격선**: 본문 슬라이드 평균 텍스트 블록 ≥ 9 (목표 12), 6 layout 모두 1회 이상 렌더, dead space 평균 < 25%, 생성된 .pptx가 유효 OOXML(JSZip 로드 성공).
- `npm run typecheck` 0, `npm run lint` 통과, `npm run check:manifest` 통과.
- 기존 slideSpecs 하위호환: 신 필드 없는 spec도 렌더 성공(추론 layout).
- ⚠️ **금지**: 긴 LLM 생성 run을 백그라운드로 띄우고 종료하지 말 것. 생성(LLM) 검증은 환경/쿼터 의존이라 **본 브리프 합격 기준은 결정론적 fixture 렌더로 한정**한다. LLM 생성 재현은 메인이 환경 가용 시 직접 수행.

## 6. Return Format (5섹션 — 그대로)
- ✅ 한 일 / ❌ 못한 일 / 🤔 결정(ADR 후보만 보고) / 🔬 검증(fixture 측정 수치·typecheck·lint·manifest 결과 붙일 것) / ⚠️ 위험
- `git diff --name-only` 이 CAN-touch 부분집합인지 확인해 보고.

## 7. Hints (실행 중 교훈 누적)
- 기존 `textBox`/`rect`/`px`/`footer`/`wrapSlide` 헬퍼는 견고하니 재사용. 좌표계는 px→EMU(`px()`).
- 공식 템플릿 파싱은 1회성(상수 추출용). 런타임에 `.pptx`를 읽는 의존 추가 금지(파일 부재 환경 깨짐).
- `learned-patterns.ts`는 파일 없으면 fallback 하므로 CI 안전.
