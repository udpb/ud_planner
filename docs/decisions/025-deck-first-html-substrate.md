# ADR-025: 덱-우선 저작 + HTML 렌더 기질 + 리치 컴포넌트 어휘 (제안서 출력 구조 전환)

- **상태**: Proposed (2026-06-01)
- **결정일**: 2026-06-01
- **결정자**: udpb@udimpact.ai + AI Architect (메인 세션)
- **Scope**: 신규 `src/lib/deck/*`(렌더 파이프라인·스토리라인·비평) · `src/components/express/slides/*`(컴포넌트 어휘 확장) · 렌더 라우트 · 렌더 의존성(headless browser). **본문/제안 스키마(express/schema.ts)·invokeAi·Prisma 불변.**
- **관련/승계**: **ADR-024(슬라이드 합성 v2 — OOXML 레이아웃)를 부분 supersede** — OOXML 렌더러를 *보조 편집용 export*로 강등, 레이아웃/밀도 원칙은 HTML 컴포넌트로 계승. ADR-021(단일 엔진)·ADR-014(디자인 토큰)·ADR-011(Express).

---

## 배경 (Context)

ADR-024(EX-3)로 OOXML 레이아웃 아키타입·밀도를 올렸으나, 사용자 평가(2026-06-01): **"기존 당선 제안서의 20-30% 수준."** 코드 추적으로 확인된 구조적 천장 3개(튜닝으로 못 넘음):

1. **표현 어휘가 작다.** 모든 슬라이드가 **8개 추상 도식 패턴 + JSON `SlideSpec`** 을 통과. 실제 당선 덱은 아이콘·사진·로고·배지·지도·사진 조직도·마일스톤 간트·주석 비주얼·맞춤 다이어그램 등 사실상 무한 어휘. "색칠한 사각형 8종"으로는 못 담음. **OOXML이든 React든 같은 어휘를 공유** → 렌더러 폴리시로 못 넘는다.
2. **산출 기질이 손코딩 사각형(OOXML).** 이미지·아이콘·실제 디자인이 원천적으로 안 들어감 → 와이어프레임 룩.
3. **저작 순서가 거꾸로.** 7섹션 산문 먼저 → 슬라이드로 "썰기". 당선 덱은 반대 — 덱=논증, 슬라이드=설계된 한 비트(액션 타이틀+so-what+근거).

사용자 지시: "좋은 제안서 1번, 토큰 무제한." 사용자 결정(2026-06-01): 기질 = **HTML→PDF 고해상**, 저작 = **스토리라인 먼저 + 슬라이드별 비평 루프(풀)**.

---

## Options Considered

### 기질(deliverable)
- **A. HTML/CSS → 고해상 PDF/PNG (Playwright 렌더) [채택]** — 웹 디자인 어휘 전체 해금(아이콘·이미지·실타이포·SVG·표). 디자인 킷을 CSS로 적용. 편집 PPTX는 보조 병행. 단점: PowerPoint 네이티브 편집 불가(보조 export로 완화), 서버리스 chromium 패키징·폰트 임베드 필요.
- B. 편집 PPTX 유지 + 이미지/아이콘 주입 — 편집성 유지하나 OOXML 모델 제약으로 아름다움 천장 낮음. 기각(천장 그대로).
- C. Google Slides/Figma API — 편집+디자인, 외부 의존·인증·제어 제한. 후속 옵션으로 보류.

### 저작
- **스토리라인 먼저 + 슬라이드별 비평 루프(풀) [채택]** — 컨설팅 ghost-deck/액션타이틀 방식. + 유사 당선 덱 골격 미러링.

---

## Decision

**제안서 덱을 "산문→슬라이드 슬라이싱 + 8패턴 OOXML"에서 "덱-우선 저작 + 리치 HTML 컴포넌트 + headless 렌더(PDF/PNG)"로 전환한다.**

### 1. 렌더 기질 (substrate)
- 슬라이드를 **HTML/CSS 컴포넌트**로 렌더(기존 React `PpProposalSlides`/`SlideShell`/`underdogs-slide.css` 확장). headless browser(Playwright 또는 puppeteer-core+chromium)로 **고해상 PNG/PDF** 출력. 대표 산출물 = **디자인 완성 PDF/HTML 덱**.
- **편집 PPTX는 보조**: 기존 `pptx-builder.ts`(ADR-024)를 유지하되 "rough 편집용 export"로 강등. 또는 PNG-per-slide 임베드 PPTX.
- 16:9, 디자인 킷 100%(단일 accent F05519, 라운드/그림자/이모지 금지, NanumHuman/Poppins). 한글 폰트 임베드 필수.

### 2. 어휘 폭발 (component vocabulary)
- 8 추상 패턴 → **큰 컴포넌트 라이브러리**: 아이콘(lucide/SVG), 이미지/로고 슬롯, 인증 배지, 표, 콜아웃, 지도, 주석 블록, 사진 조직도, 마일스톤 간트, 재무 표, 파트너 생태계, KPI 빅넘버 등. ADR-024의 레이아웃 아키타입(hero/split/full/grid/comparison/narrative)은 **HTML 레이아웃 컴포넌트로 계승**.
- 슬라이드 표현은 "고정 8패턴 선택"이 아니라 **컴포넌트 조합**(브랜드 안전 위해 큐레이션된 라이브러리에서 조합; 자유 HTML 생성은 brand-guard 통과 시 제한적 허용).

### 3. 덱-우선 저작 (authoring inversion)
- **①스토리라인 아키텍트**: RFP+grounding → 슬라이드별 **액션 타이틀 + so-what + 근거 요건 + 권장 컴포넌트**(수평 논리). 유사 당선 덱(109 추출본)의 실제 슬라이드 골격을 **시드/미러링**.
- **②슬라이드별 저작**: 장마다 grounding 호출 → 컴포넌트로 HTML 조합.
- **③슬라이드별 비평 루프(풀)**: 디자인+설득 critic("타이틀에 so-what? 밀도? 비주얼 적합? 모든 주장 근거?") → 통과까지 정제(멀티 에이전트).
- 섹션 산문(텍스트 제안서)은 덱에서 **파생**.

### 4. grounding (substance)
- 실 당선 전문/숫자·방법론·케이스 = **DATA-2**(별 트랙, 본 파이프라인의 ②에 주입). 출력 구조와 독립적으로 진행하되 ②가 소비.

### 5. 불변
- `express/schema.ts` 섹션 키 1~7·슬롯 enum · `invokeAi` 시그니처 · Prisma 핵심 모델 · 모듈 manifest.

### 6. Phasing (게이트마다 재검토)
- **DECK-1** — 렌더 기질 수직 슬라이스: HTML 슬라이드 → PDF 고해상 렌더 파이프라인 + 리치 컴포넌트 6~8장 proof. **인프라 de-risk + 사용자 육안 검증**(샘플 PDF).
- **DECK-2** — 전체 컴포넌트 라이브러리 + 슬라이드 표현 모델(스키마/조합) + 편집 PPTX export 병행.
- **DECK-3** — 스토리라인 아키텍트(액션타이틀·수평논리·당선 골격 미러링).
- **DECK-4** — 슬라이드별 비평 루프(멀티 에이전트 정제).
- **DATA-2** — 실 grounding(병행).

---

## Consequences

### Positive
- 표현 어휘·기질·저작순서 3개 천장 동시 제거 → 당선 덱 수준에 도달 가능한 경로.
- 디자인 킷이 CSS로 직접 적용 → 브랜드 일관성↑.
- 기존 React 슬라이드/CSS 자산 재사용(새로 안 만듦).

### Negative / Trade-offs
- PowerPoint 네이티브 편집 상실(보조 export로 완화).
- 인프라: headless chromium 서버리스 패키징(@sparticuz/chromium 등)·한글 폰트 임베드·렌더 시간(maxDuration). DECK-1에서 de-risk.
- 멀티 에이전트 비평 루프 = 토큰·시간↑(사용자 무제한 전제와 부합).

### Follow-ups
- [ ] DECK-1 브리프 — 렌더 기질 수직 슬라이스(HTML→PDF) + 리치 컴포넌트 proof + 샘플 PDF
- [ ] DECK-2/3/4 브리프 — 게이트별
- [ ] ADR-024 상태 메모: OOXML = 보조 편집 export 로 강등(EX-3 산출물 유지)
- [ ] Vercel chromium 패키징 결정(DECK-1 발견사항 반영)

## References
- 사용자 피드백 2026-06-01("20-30%", 구조적 전환 요청) · 결정 2분기(기질·저작)
- 관련 코드: `src/components/express/slides/{PpProposalSlides,SlideShell}.tsx` · `src/components/express/slides/diagrams/*` · `src/styles/underdogs-slide.css` · `src/lib/diagrams/pptx-builder.ts`(보조 강등) · `design-kit/learned-slide-patterns.json` · `design-kit/diagram-samples/*`(당선 골격)
- 관련 ADR: 024(부분 supersede)·021·014

## Teaching Notes
- 와이어프레임을 아무리 정렬해도 디자인 덱이 안 된다 — **기질(substrate)이 천장**이다. 손코딩 사각형 OOXML이 아니라 브라우저가 그리게 하라.
- 8개 추상 패턴은 표현을 *압축*한다. 당선 덱의 힘은 어휘의 폭(아이콘·사진·맞춤 비주얼)에서 온다.
- 좋은 덱은 산문을 썰어 만든 게 아니라 **논증으로 설계**된다. 액션 타이틀을 먼저 세우면 "조립"이 "주장"이 된다.
- 발명하지 말고 **이긴 덱의 골격을 빌려라** — 골격은 이미 109개 추출돼 있다.
