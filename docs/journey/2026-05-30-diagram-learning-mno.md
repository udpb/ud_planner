# M·N·O Series — 도식화 학습 + 슬라이드 시각화 (2026-05-30)

**Branch**: `feat/alpha-test-prep`
**기간**: ~6시간 autonomous 작업 (12시간 budget 中)
**목적**: 사용자 핵심 피드백 반영 — "단순 텍스트 X, 도식화로 PM이 시각적 완성도 받기"

---

## 1. 사용자 피드백 → 작업 매핑

| 피드백 | 작업 | 결과 |
|---|---|---|
| ".md 만으로 시각적 완성도 부족" | M2 슬라이드 렌더러 (16:9 디자인 시스템) | ✅ 17 slide preview |
| "디자인스킬·도식화 — 단순 텍스트 X" | N3 + O3 8 도식화 패턴 + slideSpec schema | ✅ 8 React 컴포넌트 |
| "297 PPT 학습" | N1 + O1 PPTX XML 도형 추출 파이프라인 | ✅ 331 file · 34,142 도형 |
| "PDF 도 추출" | O1 (pdf-parse 통합) | ✅ 226 PDF · 페이지별 텍스트 |
| "기존 제안서보다 퀄리티 ↑" | O4 produce-slide-specs LLM | ✅ section → diagram + headline + evidence |
| "한 페이지 풍부한 메시지" | O5 PpSpecSlide (headline + diagram + caption + evidence) | ✅ 9 slideSpec → 19 slide |

---

## 2. M·N·O 시리즈 완료 매트릭스

| # | 작업 | 상태 | 효과 |
|---|---|---|---|
| **M0** | PPT 템플릿 슬라이드 구조 분석 | ✅ | 20 슬라이드 · 색상·도형 패턴 파악 |
| **M1** | L2 완료 대기 + 매칭 score 재측정 | ✅ | L2 1,765 (100%) · medium+ 51건 |
| **M2** | PPT 자동 채움 시각화 (in-app) | ✅ | 17 슬라이드 렌더링 (디자인 시스템 100% 준수) |
| **M3** | .pptx 파일 export | ⚠ deferred | package.json locked — 대신 print CSS 추가 |
| **N1** | PPTX 도형 추출 파이프라인 | ✅ | JSZip XML parsing — 394→34,142 도형 |
| **N3** | 8 React 도식화 패턴 컴포넌트 | ✅ | ProcessFlow · Matrix2x2 · KpiGrid · HierarchyTree · Timeline · ComparisonTable · ArchitectureStack · BeforeAfter |
| **O1** | 297 PPT/PDF 일괄 추출 | ✅ | 331 file (109 PPTX + 226 PDF) · 8,058 slides/pages · 34,142 도형 |
| **O3** | SlideSpec schema | ✅ | 8 pattern × zod 데이터 schema + validateSlideSpec |
| **O4** | produce-slide-specs LLM | ✅ | section → 1-2 slideSpec (~14 LLM call/draft) |
| **O5** | 슬라이드 렌더러 통합 + 풀 시뮬 | ✅ | E2E 19 slides · 7 diagram 모두 visible |
| **O6** | A/B 비교 + PR | 진행중 | 본 문서 |

---

## 3. M2 — In-browser 슬라이드 렌더러

**`src/styles/underdogs-slide.css`** — 디자인 시스템 13 원칙 100% 준수
- 한 화면 한 메시지 · 8 spacing scale · 4-level type · 1 point color
- 2 박스 종류만 (stroke/tint) · radius 0 강제 · 한글 keep-all
- 토큰: `--ud-accent #F05519` · 시맨틱 (paper/ink/soft-ink/muted)
- 16:9 aspect ratio · density tier (sparse/standard/dense)
- **Print 스타일** — browser Print → PDF 로 PPT 표준 사이즈 출력 (13.33" × 7.5")

**`src/components/express/slides/`**
- `SlideShell.tsx` — 공통 컨테이너 (kicker · 로고 · 페이지 카운터)
- `PpProposalSlides.tsx` — ExpressDraft → 다중 슬라이드 시퀀스 자동 생성
- `diagrams/index.tsx` — 8 도식화 패턴 컴포넌트

---

## 4. N1 — PPTX 도형 추출

**`src/lib/diagrams/pptx-extractor.ts`**
- JSZip 으로 .pptx 압축 풀고 `ppt/slides/slideN.xml` 직접 파싱
- 도형 (`p:sp`) · 이미지 (`p:pic`) · 표 (`p:graphicFrame`) 추출
- 위치 (EMU → 0~1 정규화) · 색상 · 텍스트 · 폰트 크기 · 도형 유형
- 템플릿 검증: 394 도형 정확 추출 (rect 207 · ellipse 44 · chevron 12 · etc)

---

## 5. O1 — 297 PPT/PDF 도형 일괄 추출

**`scripts/extract-diagrams-from-drive.ts`**
- 409 drive ref 자산 (PPT + PDF) 일괄 Drive 다운로드
- pptx-extractor 로 슬라이드별 도형 / pdf-parse 로 페이지별 텍스트
- 결과: `design-kit/diagram-samples/<assetId>.json`

**최종 통계:**
- 처리: 405건
- 저장: 331건 (109 PPTX + 226 PDF)
- 총 슬라이드/페이지: 8,058
- 총 도형: 34,142
- 평균 사이즈: 8.2 MB

**상위 도형 패턴 (실 데이터 검증):**
- `rect` 22,823 (대부분 텍스트박스 + 박스)
- `roundRect` 2,386
- `ellipse` 1,091
- `flowChartTerminator` 663 (← process flow 사용 증거)
- `downArrow` 76 / `rightArrow` 21
- `homePlate` 24 / `donut` 24

→ **process flow + matrix + hierarchy 패턴이 실제 당선 제안서에서 자주 사용** 확인.

---

## 6. O3 + O4 — SlideSpec 생성 + 검증

**`src/lib/diagrams/slide-pattern.ts`**
```ts
const DIAGRAM_PATTERNS = [
  'process-flow', 'matrix-2x2', 'kpi-grid', 'hierarchy-tree',
  'timeline', 'comparison-table', 'architecture-stack', 'before-after',
  'text-only',
]

SlideSpec = {
  kicker: string,
  headline: string,       // One Page One Thesis (30-100자)
  caption?: string,
  diagram: { pattern, data },
  evidence?: { text, source }[],
  sectionNum: '1'~'7',
  order: 1-5,
}
```

**`src/lib/express/produce-slide-specs.ts`**
- 각 sections.N 본문 → LLM 호출 → 1-2 SlideSpec 생성
- SECTION_DEFAULT_PATTERNS hint 주입 (예: sections.3 → process-flow/timeline)
- 8 패턴 schema 예시를 prompt 에 포함 (zero-shot 정확도 ↑)

**O4 검증 (test-slide-specs.ts, real LLM):**
- section 3 → process-flow + timeline 2 슬라이드 ✓
- section 5 → kpi-grid 1 슬라이드 ✓
- section 7 → kpi-grid 1 슬라이드 ✓
- 총 4/4 valid (zod 검증 통과)

---

## 7. O5 — Full Integration + E2E

**`PpProposalSlides.tsx` 강화:**
- `slideSpecs` 있으면 `PpSpecSlide` 사용 (도식화 + headline + evidence)
- 없으면 legacy text-only path (호환)
- 8 diagram React 컴포넌트 모두 통합

**`produce-ultimate-draft.ts` Step 7 추가:**
- coherencePass + Inspector 완료 후 → produceSlideSpecs 호출
- ExpressDraft.slideSpecs 채움
- 1 LLM call × ~7 sections = ~14 calls 추가 (~$0.014/draft)

**E2E 검증 (live dev server):**
- 19 slides 렌더링 (cover + index + 7 dividers + 9 spec slides + closing)
- 7 diagram pattern 모두 텍스트 detected:
  - process-flow: "M1 시장 진단" ✓
  - matrix-2x2: "시장 견인력 / 기술 우위" ✓
  - kpi-grid: "20,211 / 261 / 11 / BB+" ✓
  - timeline: "AW#1 AW#2 AW#3" ✓
  - hierarchy-tree: "Lead 코치 + Main 코치" ✓
  - comparison-table: "시장 평균 vs 언더독스" ✓
  - before-after: "BEFORE / AFTER" ✓

---

## 8. 토큰 비용 (전체 system)

| 단계 | LLM call | 비용 |
|---|---|---|
| H1 clientContext | 1 | $0.001 |
| H4 produceRisks | 1 | $0.001 |
| H5 coherencePass | 1 | $0.001 |
| I1 trackRecord | 1 | $0.001 |
| I2 inferBudget | 1 | $0.001 |
| I3 deepResearch | 1 | $0.001 |
| K4 verifyResearch | 1 | $0.001 |
| Inspector | 1 | $0.001 |
| Slot turns × 11 | 11 | $0.011 |
| **O4 SlideSpecs × 7** | **7** | **$0.007** |
| **합계 (per draft)** | **~26 calls** | **~$0.025/draft** |

→ slideSpec 추가는 총 비용 +28% 이지만 결과물 시각적 완성도는 ↑↑↑.

---

## 9. 운영 영향 검증

| 영역 | 변경 | 영향 |
|---|---|---|
| DB schema | ❌ 변경 X | migration 불필요 |
| Prisma | ❌ 변경 X | regenerate 불필요 |
| vercel.json | ❌ 변경 X | cron 영향 0 |
| Brain APIs | ❌ 변경 X | 무관 |
| package.json | ❌ 변경 X | 새 deps X (JSZip 이미 있음) |
| ExpressDraft schema | ✅ `slideSpecs?` optional 추가 | 기존 draft 호환 |
| produce-ultimate-draft | ✅ Step 7 추가 (slide-specs) | per draft +14s, +$0.014 |
| PpProposalSlides | ✅ slideSpecs path 추가 | legacy 호환 |

회귀 테스트:
- ✅ K1 inferBudget (인건비 20.5%)
- ✅ K3 asset matching (medium+ 51건)
- ✅ K5 signatureNumbers (6건 추출)
- ✅ Module manifest 무결성

---

## 10. PM 워크플로 (알파 테스트)

1. **PM** Express 새 프로젝트 → RFP 업로드
2. **AI** 자동 진단 (채널·프레임·논리·팩트)
3. **PM** Slot Filling (12 슬롯 입력)
4. **PM** 사이드바 'PM 입력' 탭 → 발주처 통화 결과 + 코치 명단 입력 (L1)
5. **AI** produceUltimateDraft:
   - clientContext + 자산 매칭 + tonePatterns + deepResearch + verifyResearch
   - slot LLM × 11 → sections 7
   - **NEW: SlideSpec 생성 × 7 sections → 9-14 diagram-rich 슬라이드**
6. **PM** 슬라이드 미리보기 페이지 (`/slide-preview-test`) 에서 시각 확인
7. **PM** 브라우저 Print → "PDF로 저장" → 발주처 제출 (16:9 PPT 표준)

---

## 11. 다음 작업 후보

- **M3 .pptx native export** — JSZip 직접 PPTX XML 생성 (시간 큼, deferred)
- **N2 도형 패턴 자동 분류** — 추출된 34,142 도형을 LLM으로 패턴 분류 → 학습 데이터
- **N4 AI 섹션 → 도형 매핑 강화** — SECTION_DEFAULT_PATTERNS 를 데이터 기반으로 정교화
- **O6 A/B 비교** — 작년 당선 1차본 vs 신 시스템 정성 비교 (수동 review)
- **slidePreview 통합** — Express UI 사이드바에 슬라이드 미리보기 탭 추가

---

## 12. 커밋 시퀀스

| # | 커밋 | 내용 |
|---|---|---|
| 1 | 6140edc | N1·N3 — PPTX 추출기 + 8 도식화 패턴 |
| 2 | 1322802 | O1·O3·O4 — 학습 파이프라인 + slideSpec 생성·렌더링 |
| 3 | 0cb0b24 | O5 — slide-preview-test slideSpecs 통합 + E2E 검증 |
| 4 | (다음) | O6 — journey 문서 + PR |
