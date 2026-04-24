# Asset Registry v1.0 — 아키텍처 스펙

> 근거: [ADR-009](../decisions/009-asset-registry.md)
> 관련: [ADR-006 ProgramProfile](../decisions/006-program-profile.md) · [ADR-008 Value Chain](../decisions/008-impact-value-chain.md) · [data-contract.md](data-contract.md) · [modules.md](modules.md)
> 최종: 2026-04-24

---

## 개요

Asset Registry 는 언더독스가 RFP 에 반복 투입할 수 있는 **자산을 단일 스키마로 기록**하고, RFP 파싱 결과 + ProgramProfile 11축을 기반으로 **적재적소에 자동 매핑**하는 런타임 인덱스다.

```
RFP 파싱 + ProgramProfile 11축
            │
            ▼
┌───────────────────────────────────┐
│     matchAssetsToRfp()            │
│  ProgramProfile 유사도 (0~1)      │
│  + RFP 섹션 매핑                  │
│  + Value Chain 단계 정합          │
│  + 증거 유형 다양성 가중치        │
└───────────────────────────────────┘
            │
            ▼
     Step 1 매칭 자산 패널
     (섹션별 그룹 · 점수 · matchReasons)
            │
            ▼
     PM 승인 → Project.acceptedAssetIds JSON
            │
            ▼
     Step 6 제안서 생성
     자산 narrativeSnippet 주입
     (PM 이 편집 가능)
```

---

## 타입 스펙 (구현 계약)

### UdAsset — 자산 단건

```ts
// src/lib/asset-registry.ts (Wave G1)

import type { ValueChainStage } from '@/lib/value-chain'
import type { ProposalSectionKey, ProgramProfile } from '@/lib/pipeline-context'

export type AssetCategory =
  | 'methodology'   // IMPACT 6단계 · UOR · Act Canvas · 5-Phase 루프
  | 'content'       // AI 솔로프러너 과정 · AX Guidebook · 창업가 마인드셋
  | 'product'       // Ops Workspace · Coach Finder · Coaching Log · LMS
  | 'human'         // UCA 코치 풀 · 수행팀 구조 (개인 이름은 보관 안 함)
  | 'data'          // Alumni Hub · 고객사 DB · SROI 프록시 DB · Benchmark
  | 'framework'     // Before/After AI 전환 프레임 · 완결성 3조건

export type EvidenceType =
  | 'quantitative'  // "25,000명" "SROI 1:3.2" "성과 95%" 같은 정량 수치
  | 'structural'   // "IMPACT 6단계" "5-Phase 루프" 같은 구조 도식
  | 'case'          // 과거 수행 사례·당선 레퍼런스
  | 'methodology'   // 검증된 방법론·프로세스

export interface UdAsset {
  // ── 식별 ──
  id: string                                 // 'asset-impact-6stages' 같은 kebab-case
  name: string                               // 'IMPACT 6단계 프레임워크'
  category: AssetCategory

  // ── 3중 태그 (매칭 핵심) ──
  applicableSections: ProposalSectionKey[]   // 들어갈 수 있는 RFP 섹션
  valueChainStage: ValueChainStage           // 어느 논리 단계 (ADR-008)
  evidenceType: EvidenceType                 // 어떤 증거 유형

  // ── 매칭 보조 ──
  /** 어떤 사업 프로파일에 특히 적합한지 (11축 중 일부만 지정 가능) */
  programProfileFit?: Partial<ProgramProfile>
  /** 자산 이름 외에 RFP 에서 매칭 트리거가 될 키워드 */
  keywords?: string[]

  // ── 제안서 반영 ──
  /** 제안서에 들어갈 2~3 문장 초안 (PM 편집 가능) */
  narrativeSnippet: string
  /** narrativeSnippet 을 쓸 때 꼭 동반해야 할 수치 (예: '25,000', '1:3.2') */
  keyNumbers?: string[]

  // ── 상태 ──
  status: 'stable' | 'developing' | 'archived'
  /** 이 자산의 근거 문서·URL (선택) */
  sourceReferences?: string[]
  /** 최종 갱신 일자 — UI 에 "최근 갱신" 표시 */
  lastReviewedAt: string
}
```

### 매칭 계약

```ts
export interface AssetMatch {
  asset: UdAsset
  /** 어느 섹션에 이 자산이 제안되는가 (한 자산이 여러 섹션에 등장 가능) */
  section: ProposalSectionKey
  /** 매칭 점수 0~1 (상위 일정 점수 이상만 PM 에게 노출) */
  matchScore: number
  /** 왜 매칭됐는지 근거 (PM 에게 표시) */
  matchReasons: string[]
}

export function matchAssetsToRfp(params: {
  rfp: RfpParsed
  profile?: ProgramProfile
  /** 상위 N개만 반환 (기본 20) */
  limit?: number
  /** 최소 점수 (기본 0.3) */
  minScore?: number
}): AssetMatch[]
```

### 점수 알고리즘 (Wave G4)

```
score = 0.5 * profileSimilarity(profile, asset.programProfileFit)
      + 0.3 * keywordOverlap(rfp.text, asset.keywords)
      + 0.2 * sectionApplicability(rfp.evalStrategy, asset.applicableSections)
```

- `profileSimilarity`: 이미 구현된 `src/lib/program-profile.ts` 의 함수 재사용
- `keywordOverlap`: RFP 파싱 전문 + 자산 keywords 의 교집합 / 합집합
- `sectionApplicability`: EvalStrategy.topItems 의 section 가중치 × asset.applicableSections 포함 여부

점수 해석:
- 0.7 이상 — **강한 매칭** (자동 추천)
- 0.5 ~ 0.7 — **중간 매칭** (후보 표시)
- 0.3 ~ 0.5 — **약한 매칭** (접힌 섹션에만)
- 0.3 미만 — 제외

---

## 시드 자산 15종 (Wave G3 목표)

### methodology (3)
1. **IMPACT 6단계 프레임워크** — `curriculum` 섹션 · `④ Activity` · structural
2. **UOR 창업교육 방법론** — `curriculum` · `④ Activity` · methodology
3. **5-Phase 운영 루프 (수주→설계→운영→수집→자산화)** — `other` · `③ Output` · structural

### content (3)
4. **AI 솔로프러너 과정 (CORE + IMPACT 4 Phase)** — `curriculum` · `④ Activity` · case
5. **AX Guidebook (AI 전환 사전학습)** — `curriculum` · `④ Activity` · methodology
6. **창업가 마인드셋 U1.0** — `curriculum` · `④ Activity` · methodology

### product (4)
7. **Ops Workspace (AI 공동기획자)** — `other` 차별화 · `③ Output` · structural
8. **Coach Finder (코치 검색·평판 플랫폼)** — `coaches` · `② Input` · structural
9. **Coaching Log (코칭 활동 자동 기록)** — `coaches` · `② Input` · quantitative
10. **LMS + AI 코치봇 (학습 로그·자동 피드백)** — `curriculum` · `④ Activity` · structural

### human (1)
11. **UCA 코치 풀** — `coaches` · `② Input` · quantitative

### data (3)
12. **Alumni Hub (10년 25,000명 교육생 데이터)** — `proposal-background` · `① Impact` · quantitative
13. **SROI 프록시 DB (16종 × 4국)** — `budget` / `impact` · `⑤ Outcome` · quantitative
14. **Benchmark Pattern (유사 사업 예산·성과 레퍼런스)** — `budget` / `impact` · `⑤ Outcome` · quantitative

### framework (1)
15. **Before/After AI 전환 프레임 (창업가 유형·팀·투자·분야)** — `proposal-background` · `① Impact` · structural

**분포 체크**:
- 섹션별: proposal-background 2 · curriculum 5 · coaches 3 · budget/impact 3 · other 2 = 15
- 단계별: ① Impact 3 · ② Input 4 · ③ Output 2 · ④ Activity 4 · ⑤ Outcome 2 = 15
- 증거별: quantitative 5 · structural 6 · methodology 3 · case 1 = 15

---

## UI 통합

### Step 1 매칭 자산 패널 (Wave G5)

- Step 1 의 **③ Output 탭 하단** (RFP 파싱 결과 바로 아래) 또는 우측 사이드바 최상단
- 매칭 자산을 섹션별 그룹으로 표시
- 각 카드:
  - 자산 이름 + 카테고리 뱃지
  - **Value Chain 단계 뱃지** (색상 코드, Phase F 규격 재사용)
  - **증거 유형 뱃지** (📊 quantitative · 🏗 structural · 📋 case · 🎓 methodology)
  - 매칭 점수 + matchReasons 최대 3개
  - **narrativeSnippet 프리뷰** (접힘)
  - **"제안서에 포함" 토글** — 승인 상태 저장

### Step 6 제안서 생성 시 주입 (Wave G6)

- PM 이 승인한 자산들의 `narrativeSnippet` 을 각 섹션 프롬프트에 주입
- 제안서 AI(`proposal-ai.ts`) 프롬프트 템플릿 수정:
  ```
  [이 섹션에 반드시 포함할 언더독스 자산]
  1. {asset.name} — {narrativeSnippet}
  2. ...

  위 자산을 자연스럽게 녹여서 섹션을 작성하되,
  narrativeSnippet 문장을 그대로 복사하지 말고 맥락에 맞게 재작성할 것.
  ```
- AI 가 자산을 활용한 문장에 **소프트 마커** (`<!-- asset:asset-id -->`) 삽입 — 제안서 편집 UI 에서 "어느 자산이 어디에 쓰였는지" 시각화 가능

---

## 데이터 흐름

```
[시드 파일] src/lib/asset-registry.ts  (UD_ASSETS: UdAsset[])
     │
     ▼
Step 1 RFP 파싱 → matchAssetsToRfp() → AssetMatch[]
     │
     ▼
UI 매칭 패널 → PM 토글 → POST /api/projects/[id]/assets
     │                                │
     │                                ▼
     │                   Project.acceptedAssetIds JSON (신규 필드)
     │
     ▼
Step 6 제안서 생성 → acceptedAssetIds 로 자산 조회 → proposal-ai 프롬프트 주입
```

### 스키마 최소 변경

Wave G2 판단: **시드 파일로 시작**.
- 자산 정의: TypeScript 상수 (코드 리뷰로 변경 관리)
- 프로젝트별 승인 상태: `Project.acceptedAssetIds Json?` 단일 필드 추가 (마이그레이션 1건)

DB 테이블(`Asset`, `AssetVersion` 등)은 **자산 수가 30+ 를 넘고 일주일에 여러 번 변경이 발생할 때** 재고.

---

## 매칭 알고리즘 세부

### profileSimilarity 재사용

```ts
// src/lib/program-profile.ts 에 이미 존재
function profileSimilarity(a: ProgramProfile, b: Partial<ProgramProfile>): number
```

자산의 `programProfileFit` 이 없으면 이 항목은 점수 0.5 (중립) 로 처리.

### keywordOverlap 구현

```ts
function keywordOverlap(rfpText: string, keywords?: string[]): number {
  if (!keywords || keywords.length === 0) return 0
  const lowerRfp = rfpText.toLowerCase()
  const matched = keywords.filter((k) => lowerRfp.includes(k.toLowerCase()))
  return matched.length / keywords.length  // 0 ~ 1
}
```

### sectionApplicability

```ts
function sectionApplicability(
  eval: EvalStrategy | undefined,
  applicable: ProposalSectionKey[],
): number {
  if (!eval) return applicable.length > 0 ? 0.5 : 0
  // topItems 의 weight 를 섹션별로 합산, applicable 과 교집합 가중치 합
  const weights = eval.sectionWeights ?? {}
  const total = applicable.reduce((sum, sec) => sum + (weights[sec] ?? 0), 0)
  return Math.min(total, 1)
}
```

---

## manifest.ts (Module 계약)

```ts
// src/modules/asset-registry/manifest.ts (Wave G1 함께 생성)

export const manifest = {
  name: 'asset-registry',
  version: '1.0.0',
  owner: '전사 공용',
  reads: [
    'rfp.parsed',
    'meta.programProfile',
    'rfp.evalStrategy',
  ],
  writes: [
    // 없음 — 자산 자체는 코드 시드, 프로젝트별 승인은 별도 모듈
  ],
} as const
```

---

## 변경 이력

- 2026-04-24 — v1.0 초안 (ADR-009 채택 동시 생성)
