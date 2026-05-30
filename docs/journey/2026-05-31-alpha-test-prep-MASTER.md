# Alpha-Test Prep — 종합 정리 (K · L · M · N · O · P 전체)

**작성**: 2026-05-31 (compact 직전 손실 방지용 마스터 문서)
**브랜치**: `feat/alpha-test-prep` (HEAD `db9d569`, master 대비 26 커밋, 전부 push 완료)
**PR**: [#52](https://github.com/udpb/ud_planner/pull/52)
**누적 작업**: K1~K7 · L1~L5 · M0~M4 · N1~N5 · O0~O6 · P1 (모두 완료)

> **이 문서 하나로 compact 후 전체 맥락 복원 가능.** 세부 시리즈별 journey 문서:
> - `2026-05-29-k-series-fixes.md`
> - `2026-05-29-alpha-test-prep.md` (L)
> - `2026-05-30-diagram-learning-mno.md` (M·N·O)
> - `2026-05-30-m4-ab-comparison.md`

---

## 0. 큰 그림 — 무엇을 위한 작업이었나

사용자 목표(원문 인용):
- *"알파테스트를 해도 정말 괜찮을 정도의 결과물"*
- *"단순 단어 출력이 아니라 핵심메세지·전체 논리구조·세부내용·근거·위계에 따른 내용 풍성함"*
- *"PM이 시각적으로 완성도 있는 결과를 받아보고… 본질에만 집중해서 따라오면 기존보다 더 나은 제안서"*
- *"단순 텍스트 배치 아니라 디자인스킬·도식화. 한 페이지마다 키메세지+설명+근거+프로세스+구조"*
- *"이전에 줬던 PPT들에서 도식화 학습. 템플릿은 벗어나지 않게."*

→ 3축으로 정리:
1. **데이터 신뢰성** (K·L) — 인건비·매칭·voice·fact-check·PM입력
2. **시각 완성도** (M·N·O) — Underdogs 디자인 시스템 + 16:9 도식화 슬라이드 + 당선 PPT 학습
3. **평가위원 신뢰** (P) — 자산ID 노출·수치 hallucination 차단

---

## 1. K-series — 데이터 결함 fix (커밋 caf27e8 ~ 901d468)

직전 세션 정리보고서에서 발견된 7개 결함 수정. **모두 DB SQL 직접 검수 + 테스트 PASS**.

| K# | 문제 | 수정 | 검증 |
|---|---|---|---|
| K1 | inferBudget 인건비 9.6% (실 21.9% 2x off) — 카테고리 없는 사업 평균 제외 → 합산 100% 초과 | zero-imputation (모든 사업×모든 카테고리, 없으면 0) + 정규화 | 65M B2G: 인건비 20.5%/강사료 13.4%/운영비 31.4%/간접비 34.6% (합 99.9%) |
| K2 | originalQuote 0/1,765 (J1이 schema만 추가, 데이터 미이행) | extract-quote.ts 휴리스틱 (정량+2·강한동사+1·UD시그니처+2·회피어휘-2, 점수≥3) + migrate-quotes.ts | 1,211/1,765 (68.6%) 추출, 평균 4.22 |
| K3 | 자산 매칭 max 0.43 (medium 0.5 미달) — programProfileFit 0건 → profile 항상 0.5 | keywordOverlap saturating(3+ match=1.0) + narrativeSnippet semantic +0.1/each | max 0.55→0.65, medium+ 12→80건 (6.7x) |
| K4 | deep-research lowConfidence flag 거의 항상 false | formatResearchForPrompt가 trusted/⚠저신뢰 분리 표시 | — |
| K5 | signatureNumbers `{value,context}` object를 string filter가 전부 제외 | extractNumber 헬퍼 — object도 "value (context)" 추출 | B2G GTM 6건 추출 (이전 0) |
| K6 | track-record 5건 사업 적합도 미검수 | SQL 검수 — 매칭 로직 정상, fix 불필요 | — |
| K7 | PM 외부 reality(통화·코치·평가위원) 입력 흐름 부재 | PmInputsSchema + POST /api/express/pm-inputs + formatPmInputs prompt 주입 | schema/formatter 단위 PASS |

**핵심 파일**: `src/lib/express/infer-budget.ts`, `extract-quote.ts`, `verify-research.ts`, `src/lib/asset-registry.ts`, `tone-patterns.ts`, `schema.ts`(PmInputs)

---

## 2. L-series — PM 워크플로 + 데이터 마이그레이션 (커밋 7bbc7d9 ~ ce48bf5)

| L# | 작업 | 결과 |
|---|---|---|
| L1 | PM Inputs UI (`PmInputsEditor.tsx`) + ExpressShell 4번째 사이드바 탭 | callNotes(0~5)·assignedCoaches(0~10)·evaluators(0~10)·freeNotes. 디바운스 1.2s 자동저장. E2E: DB 저장 확인 |
| L4 | deep-research 2차 LLM fact-check (`verify-research.ts`) | "skeptical reviewer" temp 0.1 → verified/uncertain/fabricated. 실 LLM 3/3 정확 (통계청=verified, 가공기관=fabricated) |
| L2 | programProfileFit LLM 마이그레이션 (`infer-program-profile.ts` + migrate script) | **1,765/1,765 (100%)** 6축 추론 완료 (백그라운드 2,537s) |
| L3 | originalQuote 진짜 PDF 재읽기 (Drive 자산, `migrate-quotes-from-drive.ts`) | 297/405 'pdf-rebuild' (진짜 voice). Drive API → pdf-parse/officeparser → LLM 발췌 |
| L5 | 통합 E2E + 시각 검수 | K1·K3·K5 회귀 PASS, manifest 0 errors |

**비용**: L2 ~$1.7 + L3 ~$2 (one-time)

---

## 3. M-series — 디자인 시스템 + 16:9 슬라이드 렌더러 (커밋 b9e2194, e4f8d21~e85200e)

### M0 — 디자인 키트 통합 (`design-kit/`)
- 사용자 제공 `[underdogs] 제안서 템플릿 ver.01 16-9.pptx` (72MB) → `design-kit/templates/`
- `underdogs_design_kit_260529` → `design-kit/` (fonts NanumHuman+Poppins woff2×6, logo SVG×4, underdogs-flex-template.md 디자인 13원칙)
- public 배포: `public/design-kit/fonts/`, `public/design-kit/logo/`

### M2 — In-browser 슬라이드 렌더러 (토큰 cost 0)
- `src/styles/underdogs-slide.css` — 디자인 13원칙 100% (Action Orange #F05519 5%↓·NanumHuman·8pt grid·radius 0·한글 keep-all·로고 1개+). density tier (sparse/standard/dense). 16:9 aspect.
- `src/components/express/slides/SlideShell.tsx` — 공통 컨테이너 (kicker·로고·페이지번호)
- `src/components/express/slides/PpProposalSlides.tsx` — ExpressDraft → 다중 슬라이드 (표지+INDEX+섹션divider+content+마무리)
- `src/app/(dashboard)/slide-preview-test/page.tsx` — mock 검증 페이지 (17 슬라이드)

### M1 — 매칭 score 재측정 (L2 완료 후): profileFit 채워진 자산으로 medium+ 추가 상승 확인
### M4 — 실 RFP 풀 파이프라인 E2E + backfill 견고성
- `/api/dev/ultimate-draft` (dev-only, E2E_SECRET 가드) — RFP → produceUltimateDraft 전체 실행
- **빈 섹션 backfill** (`produce-ultimate-draft.ts` Step 3.2): 슬롯 LLM JSON 실패로 §2·4 누락 → RFP objectives+intent+§1 참고로 전용 LLM backfill → **7/7 섹션 보장** (Inspector 44→72)

---

## 4. N-series — PPTX 도형 추출 + 8 도식화 컴포넌트 + 당선 PPT 학습 (커밋 6140edc, f1df66e)

### N1 — PPTX 도형 추출기 (`src/lib/diagrams/pptx-extractor.ts`)
- JSZip으로 .pptx 압축 풀고 `ppt/slides/slideN.xml` 정규식 파싱
- 도형(p:sp)·이미지(p:pic)·표(p:graphicFrame) → 위치(EMU→0~1)·색상·텍스트·폰트·도형유형
- `reconstructSlide()` — 도형을 공간 순서(위→아래·좌→우) 정렬 + zone 태그 (N2 학습용)
- 템플릿 검증: 394 도형 (rect 207·ellipse 44·chevron 12·triangle 11)

### N3 — 8 도식화 React 컴포넌트 (`src/components/express/slides/diagrams/index.tsx`)
ProcessFlow · Matrix2x2 · KpiGrid · HierarchyTree · Timeline · ComparisonTable · ArchitectureStack · BeforeAfter — 디자인 시스템 100% 준수

### N2 ⭐ — 실제 당선 PPT 메시지 구조 학습 (품질의 핵심)
- `scripts/learn-slide-patterns.ts`: diagram-samples → rich slide 추출 → LLM 분석 → `design-kit/learned-slide-patterns.json`
- 학습 결과: 섹션별 빈출 패턴 + **밀도 기준(12.5 blocks·3.4 evidence/slide)**
- `src/lib/diagrams/learned-patterns.ts`로 produce-slide-specs에 역주입 → "빈약한 헤드라인" → "내용 풍부한 도식화"
- 다양성 interleave 샘플링(numeric/geom/blocks-rich)으로 §1/4/5 커버 (사용자가 직접 보강한 부분)

---

## 5. O-series — 도식화 학습 파이프라인 + slideSpec 생성 (커밋 1322802, 0cb0b24, ed09e29)

| O# | 작업 |
|---|---|
| O1 | 297→335 Drive PPT/PDF 도형 일괄 추출 (`extract-diagrams-from-drive.ts`) → 34,142 도형·8,058 슬라이드. **20MB raw는 gitignore** (8709c8a), 증류본만 커밋 |
| O3 | 슬라이드 메시지 패턴 LLM 학습 (= N2) |
| O4 | `produce-slide-specs.ts` — sections.N → LLM이 {headline·diagram(pattern+data)·evidence·caption} 생성. ExpressDraft.slideSpecs 추가 |
| O5 | PpProposalSlides가 slideSpecs path 렌더 (8 diagram 컴포넌트 wire). slide-preview-test 통합 |
| O6 | print CSS (16:9 PDF 출력) + 종합 journey |

---

## 6. P1 — 평가위원 신뢰도 치명 버그 (커밋 a89ab38, db9d569) ⭐ 가장 최근

**A/B 정독(M4)에서 발견한 알파테스트 차단급 결함 2건:**

| 문제 | Before | After (실 LLM E2E 검증) |
|---|---|---|
| 자산ID 본문 노출 | `[자산 인용: cmplkntnp...]` 9건+ 평가위원 노출 | **0건** |
| 매출 hallucination | slideSpec 500억 → "5,000억" 10배 부풀림 | **0건**, 정확 500억 12회 |

**수정 4파일:**
- `prompts/turn.ts` — 자산 인용 시 「」 직인용만, assetId는 sourceTrace.matchedAssetIds에만 (본문 노출 금지)
- `produce-slide-specs.ts` — UD_TRACK_RECORD ground-truth 라벨 주입 + "정확히 N억, 자릿수 변경 금지"
- `slide-pattern.ts` — `stripAssetIdMarkers()` 코드 sanitizer (프롬프트 위반 방어). 정규식: `[자산인용:]`·`(cuid)`·bare cuid 제거, 정상 출처 `[근거:통계청…]` 보존. 단위 6/6 PASS
- `produce-ultimate-draft.ts` — coherencePass 직후 sections 전체 sanitize

**검증**: 실 LLM 23-call 풀 파이프라인 → cuid 0·인용마커 0·부풀림 0·정확 500억 12회. `/slide-preview-test/real` 24슬라이드 화면도 동일.

---

## 7. 현재 시스템 상태 (알파테스트 readiness)

| 영역 | Before (K 이전) | After (P1까지) |
|---|---|---|
| 인건비 비율 | 9.6% (2x off) | 20.5% ✓ |
| 자산 매칭 medium+ | 12건 | 80건 (K3) |
| originalQuote | 0/1,765 | 1,211 휴리스틱 + 297 PDF-rebuild |
| programProfileFit | 0/1,765 | 1,765 (100%) |
| PM 외부 reality 입력 | 없음 | 사이드바 4번째 탭 |
| 자가검증 | 없음 | Inspector 11-lens + deep-research fact-check |
| 출력 형식 | .md 텍스트 | **16:9 도식화 슬라이드 + Print PDF** |
| 슬라이드 도식화 | bullet만 | **7종 패턴 자동 (당선 PPT 학습)** |
| 자산ID/수치 신뢰 | 노출·부풀림 | **sanitize·ground-truth 강제** |

### 실 RFP E2E 결과 (성균관대 GTM, 23 LLM calls, 383s)
- 7/7 섹션 + 14 slideSpec (before-after·process-flow×2·kpi-grid×4·comparison×2·architecture×2·matrix·hierarchy)
- 발주처 언어 흡수(킹고·딥테크·Market Pull·Born Global), Pyramid 논리, 정량 근거 슬라이드당 ~3건
- §1: "33.8% 생존율 → 66.2% 데스밸리" 문제정의 + Bottom-up ICP 차별화 + "9월 1주차" 구체 일정

---

## 8. 검증 스크립트 (재현 가능)

```
scripts/test-infer-budget.ts          # K1
scripts/migrate-quotes.ts             # K2 (--apply)
scripts/test-asset-matching.ts        # K3
scripts/test-verify-research.ts       # L4
scripts/test-pm-inputs.ts             # K7
scripts/migrate-program-profile-fit.ts # L2 (--apply --all)
scripts/migrate-quotes-from-drive.ts  # L3 (--apply --all)
scripts/test-pptx-extract.ts          # N1
scripts/learn-slide-patterns.ts       # N2 (--apply --sample 60)
scripts/extract-diagrams-from-drive.ts # O1 (--all)
scripts/test-slide-specs.ts           # O4 밀도 검증
```

**실 RFP E2E** (dev 서버 + Docker 필요):
```bash
# 1. Docker: Docker Desktop 시작 → docker ps 로 ud_ops_db 확인
# 2. dev: preview_start ud-ops-dev (port 3002)
# 3. RFP fixture 작성 후:
curl -X POST http://localhost:3002/api/dev/ultimate-draft \
  -H "x-e2e-secret: $E2E_SECRET" -H "Content-Type: application/json" \
  -d @rfp.tmp.json -o draft.tmp.json
# E2E_SECRET 은 .env.local 참조 (값: PQQMBQFVRACNDWCIKWTYMQSPIJIEEXHN)
# 결과 → src/app/(dashboard)/slide-preview-test/real/generated-draft.json
# 화면: /slide-preview-test/real (proxy.ts public path)
```

---

## 9. 운영 안전 (변경 안 한 것)

- ❌ DB schema (prisma/schema.prisma) — slideSpecs/pmInputs는 ExpressDraft Json 내 optional
- ❌ prisma/migrations · package.json · vercel.json · Brain API(/api/v1/brain/*)
- ✅ /api/dev/* — production 404 (NODE_ENV + E2E_SECRET 가드)
- ✅ design-kit/diagram-samples/ (20MB raw) — gitignore, 재생성 가능. learned-slide-patterns.json만 커밋

---

## 10. M3 · P2 · 내러티브 — 완료 (2026-05-31 후속 세션)

### ✅ M3 — .pptx 파일 export (완료)
- `src/lib/diagrams/pptx-builder.ts` — JSZip OOXML 직접 빌드. 16:9(12192000×6858000 EMU) · Underdogs 테마(Action Orange·NanumHuman·Poppins) · 최소 slideMaster/layout/theme 1세트.
- 슬라이드 시퀀스: 표지 → INDEX → 섹션×(divider + specSlide) → 마무리.
- `/api/express/export-pptx?projectId=` — requireProjectAccess → expressDraft → ExpressDraftSchema → buildPptx → .pptx(RFC 5987 한글 파일명).
- CommandPalette 'PPT 다운로드 (.pptx — 편집 가능)' 항목 (NowBar More ▾ → 팔레트, 2클릭).
- 검증: `test-pptx-build.ts`(실 draft 24슬라이드 53.5KB) + `test-pptx-route-flow.ts`(schema 흐름 1:1) + python-pptx 1.0.2 파싱(472도형·402단락·16:9). 자산ID 누출 0 (P1 회귀 없음). 커밋 `ed98fc2`·`cb06dc4`.

### ✅ P2 — 도식화 8/8 패턴 .pptx 네이티브 (완료)
- 기존 4종(process-flow·kpi-grid·comparison-table·architecture-stack)만 네이티브, 나머지 4종 텍스트 폴백이던 것을 전부 OOXML 도형으로:
  - before-after(좌 tint→화살표→우 accentTint) · timeline(간트 units헤더+bar) · matrix-2x2(사분면+축, highlight accent) · hierarchy-tree(루트 ink→자식 tint+연결선).
- `summarizeDiagramData` 는 malformed/text-only 안전망으로 유지 (graceful degradation).
- 검증: `test-pptx-all-patterns.ts`(4신규 rect≥3 네이티브: before5·matrix7·timeline16·hierarchy12) + python-pptx 11슬라이드·123도형 파싱. 커밋 `b313548`.

### ✅ §간 내러티브 보강 (완료)
- 점검 결과 7전환 중 6개 forward-reference로 자연. 유일 약점 §2→§3(커리큘럼 '❍ [STEP 1]' 급출발).
- coherence-pass 임무#1에 '리스트 시작 섹션 산문 도입 1문장 강제' 규칙 추가. 결과: §3 → '앞서 제시한 전략적 메커니즘은…6개월 커리큘럼으로 구체화됩니다.' + STEP 리스트 보존.
- 검증: `test-coherence-flow.ts`(2회 일관 PASS, STEP 3·source 3 보존). server-only 우회: `NODE_OPTIONS=--conditions=react-server`. 커밋 `71b7c66`.

### ★ 남은 후보 (선택)
- Inspector 점수 편차(44~72, LLM 비결정성) — 정량 포화 lens 강화로 안정적 70+ 목표
- 실제 당선본 PDF 1:1 라인 대조 (원문 확보 시) — A/B의 "B"를 정성 관찰→실측으로
- 풀 fresh E2E 캡스톤 — produceUltimateDraft(23 LLM) → .pptx 통합 (현재는 실 fixture·합성 데이터로 검증)

### 알파테스트 직전 권장 시나리오
1. 신규 RFP 업로드 → S1 자동 분석
2. 사이드바 'PM 입력' 탭 → 발주처 통화·전담 코치 입력 (디테일 ↑)
3. S2 챗봇 슬롯 채움 → 1차본 produce
4. 1차본 검수: 예산 비율(인건비 20~25%)·track-record·외부자료 fabricated 표시·자산ID 노출 0 확인
5. /slide-preview-test 류로 도식화 슬라이드 시각 확인 → Print PDF

---

## 11. 핵심 교훈 (작업 중 반복 발견)

1. **도구 출력 garbling**: 이번 12시간 중 대량 병렬 Bash 호출이 한 실패로 전체 cancel되거나 출력이 빈 채로 렌더링되는 환경 불안정 반복 → **단일 명령 순차 실행**이 안전. 결과는 파일에 쓰고 Read로 확인.
2. **/tmp 경로 함정**: Git-bash `/tmp`는 node에서 `C:\tmp`로 해석돼 못 찾음 → **프로젝트 로컬 경로** 사용.
3. **git add -A 위험**: diagram-samples(20MB·335파일)가 실수 커밋됨 → gitignore는 working tree뿐 아니라 **HEAD에 커밋**돼야 함. `git rm --cached`로 복구.
4. **Edit "성공" ≠ persist**: 취소된 배치에 섞인 Edit은 적용 안 될 수 있음 → grep으로 재확인 필수.
5. **프롬프트만으로 hallucination 못 막음**: P1처럼 **코드 레벨 sanitize**(stripAssetIdMarkers) 방어선 필요.
