# DECK-2 — 슬라이드 상세 화면기획: 당선 덱 밀도·디테일 proof + 리치 컴포넌트 라이브러리

> 자급자족 브리프. `이 브리프 + CLAUDE.md + AGENTS.md + docs/glossary.md + docs/decisions/025-deck-first-html-substrate.md` 만으로 작업. 의문 = 추측 금지, STOP 후 메인 보고.

- **트랙/ID**: DECK-2 (ADR-025 Phase 2)
- **상태**: 🟡 in-progress
- **선행**: DECK-1(✅) — HTML→PDF 렌더 기질·기본 어휘 증명. `src/lib/deck/render-html.ts`, `src/components/express/slides/rich/{icons,index}.tsx`, fixture `docs/samples/fixtures/deck-v3.tsx`, 하니스 `scripts/_render-deck.ts` 존재.

---

## 0. 왜 (맥락 — 중요)
DECK-1로 기질은 뚫렸으나, 렌더된 PDF를 메인이 육안 검증한 결과: **커리큘럼·코치 슬라이드 하단 ~40%가 비고, 요소당 내용이 "아이콘+제목+한 줄"로 얕다.** 사용자 핵심 불만("당선 덱의 20-30%")이 *여전히* 남음. 원인 = 기질이 아니라 **밀도·디테일(=상세 화면기획)**. DECK-2의 임무는 **"이 기질이 실제 당선 덱만큼 조밀하고 디테일하게 채워질 수 있다"를 손으로 증명**하고, 그 과정에서 **DECK-3 자동저작이 목표로 삼을 리치 컴포넌트 라이브러리 + 밀도 규격**을 확정하는 것.

## 1. 목표 (한 문장)
fixture 덱의 본문 슬라이드(최소 커리큘럼·코치·전략·실적/임팩트 등 4~5장)를 **실제 당선 덱 밀도(슬라이드당 정보 블록 ~12, learned `avgBlocksPerSlide 12.5`)와 요소별 디테일(코치 약력+실적, 주차별 세부+산출물, 정량 근거+메커니즘)**로 꽉 채워, 페이지 공백을 없애고(목표 dead-space < 12%) "당선 덱 근접" 품질을 PDF로 시연한다. **LLM·DB 없이 결정론적.**

## 2. 스코프 — CAN touch / MUST NOT touch

**CAN touch:**
- `src/components/express/slides/rich/*.tsx` — **밀도 높은 신규 컴포넌트 추가/확장**: 예) 코치 상세 카드(사진+이름+직함+약력 2~3줄+정량 실적 배지), 주차별 커리큘럼 상세(주차×트랙 매트릭스, 셀마다 핵심활동+산출물), 근거 콜아웃 밴드(수치+메커니즘+출처), 다중 KPI+해설, 전략 캔버스(2~3존 복합), 비교 표(행 6~8+우위 강조), 스탯+서술 혼합 hero.
- `src/components/express/slides/diagrams/index.tsx` — 기존 8 패턴을 **고밀도로** 보강(라벨/설명/항목수 확장, 셀 내부 디테일).
- `src/components/express/slides/SlideShell.tsx` — 필요 시 density/zone helper (하위호환).
- `src/styles/underdogs-slide.css` — 신 컴포넌트 스타일(디자인 킷 준수).
- `docs/samples/fixtures/deck-v3.tsx` — 본문 슬라이드를 **당선 밀도로 재작성**(예시 내용 충실히: 코치 4명 약력·실적, 24주 커리큘럼 주차별 세부, 임팩트 KPI+산출 논리, 전략 매트릭스+근거).
- `scripts/_render-deck.ts` — **전체 페이지 PNG 스냅샷 출력**으로 확장(메인 육안 검증용) + 슬라이드별 밀도 측정(블록 수·dead-space).
- 신규 샘플 자산 `public/design-kit/sample/*` 추가 가능.

**MUST NOT touch:**
- `src/app/**` (라우트·페이지·UI 배선) — 자동저작·UI 통합은 DECK-3/별 브리프.
- `src/lib/express/produce-slide-specs.ts`·`engine/*` (생성 파이프라인) — 저작은 DECK-3.
- `src/lib/diagrams/pptx-builder.ts` (OOXML 보조 — 무관).
- `src/lib/express/schema.ts` 섹션 키·슬롯 enum · `invokeAi` · `prisma/schema.prisma` · 모듈 manifest.
- 다른 트랙(Express turn/Deep/Brain).

## 3. 레퍼런스 (밀도·디테일의 정답지 — 발명 금지)
- `design-kit/learned-slide-patterns.json`: `avgBlocksPerSlide 12.5`·`avgEvidencePerSlide 3.4`·섹션별 패턴 빈도·실제 당선 헤드라인 30개(액션 타이틀 톤). **밀도·톤 기준.**
- `design-kit/diagram-samples/*.json`(당선 109덱 추출 도형): 한 슬라이드가 실제로 몇 개 블록·어떤 배치였는지 감각.
- `design-kit/templates/underdogs-proposal-template-v01-16-9.pptx`.
- 디자인 킷 가드: 단일 accent `#F05519`(면적 10~15%), 라운드/그림자/이모지/그라데이션 **금지**, tint vs stroke 박스, NanumHuman(KR)/Poppins(EN·숫자), 아이콘=단색 라인. **밀도를 높이되 여백 호흡·정렬은 유지**(빽빽함 ≠ 난잡함).
- Coach 단일 source = Supabase `coaches_directory`(715명) — fixture 약력은 예시여도 **현실적**으로(실데이터는 DATA-2에서 주입).

## 4. 구현 원칙 (상세 화면기획)
- **슬라이드 = 한 주장 + 그것을 다층으로 받치는 증거.** 각 본문 슬라이드는: 액션 타이틀(so-what) + 핵심 비주얼/도식 + **디테일 레이어**(요소별 세부) + **근거 밴드**(정량 수치+메커니즘+출처) 가 페이지를 **채운다**.
- **요소별 디테일 의무**:
  - 코치: 사진+이름+직함+약력(전 직장/전문/성과 2~3줄)+정량 배지(예 "누적 멘토링 120팀").
  - 커리큘럼: 24주를 6트랙×주차로, 셀마다 핵심활동+산출물(deliverable). Action Week 강조.
  - 실적/임팩트: KPI 빅넘버 + 산출 논리(어떻게 그 숫자가 나오는지) + SROI.
  - 전략: 매트릭스/캔버스 + 각 사분면·블록의 근거 한 줄.
- **페이지 채움**: 가용 영역(헤더 하단~footer 위)을 컨텐츠로 채워 dead-space < 12% 목표. 진짜 넘치면 다음 장 분할.
- **근거는 출처 태그 금지** — "수치+무엇을 증명+출처" 형태. (실 숫자 진위는 DATA-2; fixture는 현실적 예시.)

## 5. 검증 (결정론적 — 메인이 PNG로 육안 재확인)
- `npx tsx scripts/_render-deck.ts` → `docs/samples/sample-deck-v3.pdf` + **전 페이지 PNG**(`docs/samples/snaps/p{n}.png` 또는 유사) 출력 + 슬라이드별 측정표(블록 수·dead-space).
- **합격선**: 본문 슬라이드 평균 정보 블록 ≥ 11(목표 12) · 본문 슬라이드 평균 dead-space < 15% · 모든 본문 슬라이드에 디테일 레이어 + 근거 밴드 존재 · 한글 정상 · 16:9 · 유효 PDF · 디자인 킷 가드 위반 0(라운드/그림자/이모지 없음, accent 과다 없음).
- `npm run typecheck` 0 · `npm run lint`(touch 파일) · `npm run check:manifest` 통과.
- ⚠️ 백그라운드 장기 프로세스 금지. LLM·DB 호출 금지. 1커맨드 결정론적 재현.

## 6. Return Format (5섹션)
- ✅ 한 일 / ❌ 못한 일 / 🤔 결정(ADR 후보만) / 🔬 검증(슬라이드별 밀도·dead-space 측정표 + PNG 경로 + typecheck/lint/manifest) / ⚠️ 위험
- `git diff --name-only` ⊆ CAN-touch 확인. 신규 의존성 명시(없어야 정상).

## 7. Hints
- DECK-1 컴포넌트(`rich/index.tsx`: IconProcess·PhotoOrgGrid·BigNumberHero·MilestoneTimeline 등) 재사용·확장. 밀도가 부족하면 새 컴포넌트를 만들되 디자인 킷 토큰(`underdogs-slide.css` `:root` 변수) 사용.
- 정적 렌더 안전(`renderToStaticMarkup`) — 클라 상태/이펙트 쓰지 말 것.
- 빽빽하게 채우되 **4단계 텍스트 위계**(kicker/heading/body/caption)와 정렬 그리드를 지켜 "난잡"이 아니라 "조밀+정돈"으로.
- 작게: 커리큘럼 1장을 당선 밀도로 먼저 통과시키고 나머지 본문으로 확장.
