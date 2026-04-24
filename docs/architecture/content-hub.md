# Content Hub v2.0 — 아키텍처 스펙

> 근거: [ADR-010](../decisions/010-content-hub.md)
> 관련: [ADR-009 Asset Registry v1](../decisions/009-asset-registry.md) · [asset-registry.md v1 스펙](asset-registry.md)
> 최종: 2026-04-24

---

## 개요

Content Hub 는 Asset Registry v1(Phase G, 코드 시드 15종) 의 저장소를 DB 로 격상하고 1단 계층 + 담당자 UI 를 추가한 v2 구조다. 매칭 엔진·narrativeSnippet·3중 태그·Value Chain 연결은 v1 그대로 유지되며, **타입 계약 `UdAsset` 은 불변**이고 **저장소만 DB** 로 전환된다.

```
┌─────────────────────────────────┐
│  /admin/content-hub (담당자 UI)  │
│  테이블·필터·CRUD·계층 드롭다운   │
└─────────────────────────────────┘
              ↕
┌─────────────────────────────────┐
│  ContentAsset (Prisma table)    │
│  id·name·parentId·3중 태그 ·    │
│  narrativeSnippet·version ·     │
│  sourceReferences (URL 목록)    │
└─────────────────────────────────┘
              ↕
┌─────────────────────────────────┐
│  asset-registry.ts (런타임 API) │
│  getAllAssets() · findAssetById │
│  matchAssetsToRfp · formatAccepted│
└─────────────────────────────────┘
              ↕
     Step 1 패널 · Step 6 AI 주입
     (v1 UI 재사용, 계층 지원 확장)
```

---

## 데이터 모델

### ContentAsset 테이블

```prisma
model ContentAsset {
  id                 String   @id @default(cuid())
  name               String
  category           String   // AssetCategory 유니온 문자열

  // ── 계층 ──
  parentId           String?
  parent             ContentAsset?  @relation("ContentAssetHierarchy", fields: [parentId], references: [id])
  children           ContentAsset[] @relation("ContentAssetHierarchy")

  // ── 3중 태그 (Phase G UdAsset 동일) ──
  applicableSections Json     // ProposalSectionKey[]
  valueChainStage    String   // ValueChainStage
  evidenceType       String   // 'quantitative' | 'structural' | 'case' | 'methodology'

  // ── 매칭 보조 ──
  keywords           Json?    // string[]
  programProfileFit  Json?    // Partial<ProgramProfile>

  // ── 제안서 반영 ──
  narrativeSnippet   String   @db.Text
  keyNumbers         Json?    // string[]

  // ── 상태 + 버전 ──
  status             String   @default("stable")   // stable | developing | archived
  version            Int      @default(1)
  sourceReferences   Json?    // string[] — 외부 원본 URL
  lastReviewedAt     DateTime

  // ── 감사 ──
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
  createdById        String?
  updatedById        String?

  @@index([category])
  @@index([valueChainStage])
  @@index([parentId])
  @@index([status])
}
```

### 제약

- **1 단 계층**: `parent.parentId === null` 을 앱 레벨 guard 에서 강제 (depth=2 초과 금지)
- **순환 방지**: `parentId === id` 불가, 부모 체인에 자신 포함 불가
- **아카이브 상태의 부모**: children 도 연쇄 아카이브? → v2.0 은 부모 아카이브 시 **children 은 유지되되 경고만**. 담당자가 일괄 아카이브 선택.

---

## 런타임 API (asset-registry.ts 리팩터)

Phase G 의 코드 시드 `UD_ASSETS: UdAsset[]` 상수는 제거되고, 다음 API 로 교체:

```ts
// src/lib/asset-registry.ts (Wave H2)

/**
 * 모든 active(not archived) 자산을 반환.
 * 요청 단위 메모 캐싱 — React Server Component 의 `cache()` 활용.
 * 자산은 Prisma → UdAsset 변환 (JSON 필드를 TS 배열로 파싱).
 */
export const getAllAssets = cache(async (): Promise<UdAsset[]> => { /* ... */ })

/**
 * ID 로 자산 조회 (계층 정보 포함 선택적).
 */
export const findAssetById = cache(
  async (id: string, options?: { withChildren?: boolean }): Promise<UdAsset | null> => { /* ... */ }
)

/**
 * 기존 시그니처 유지 — 내부만 getAllAssets() 사용으로 변경.
 */
export async function matchAssetsToRfp(params: MatchAssetsParams): Promise<AssetMatch[]>

/**
 * 기존 시그니처 유지 — 내부만 DB 조회로 변경.
 */
export async function formatAcceptedAssets(
  acceptedIds: string[] | undefined,
  section?: ProposalSectionKey,
): Promise<string>
```

**호출부 영향**: `matchAssetsToRfp` · `formatAcceptedAssets` 가 이제 Promise 반환. `page.tsx` · `proposal-ai.ts` 에서 `await` 추가 필요.

### UdAsset 타입 확장 (계층)

```ts
export interface UdAsset {
  // ... 기존 v1 필드 전부 유지
  parentId?: string | null
  /** 계층 조회 시에만 채워짐 (성능 위해 기본 비어있음) */
  children?: UdAsset[]
  /** DB 이관 후 추가된 감사 필드 */
  version: number  // optional 이 아니라 required 로 격상 (기본 1)
  createdAt?: string
  updatedAt?: string
}
```

---

## 관리자 UI 스펙 (`/admin/content-hub`)

### 목록 페이지 `/admin/content-hub`

**필터 바**:
- 카테고리 (methodology · content · product · human · data · framework)
- Value Chain 단계 (① ~ ⑤)
- 상태 (stable · developing · archived)
- 부모 자산 유무 (전체 · top-level · child)
- 이름 검색 (substring)

**테이블 컬럼**:
| 이름 | 카테고리 | 단계 | 증거 | 상태 | 버전 | 부모 | 최종 검토 | 액션 |

- 이름 클릭 → 편집 폼
- 부모 있으면 "└─ AI 솔로프러너 / Week 3" 같이 경로 표시
- 정렬: 기본 `updatedAt desc`

**상단 액션**: `+ 새 자산` 버튼

### 편집 폼 `/admin/content-hub/new` · `/admin/content-hub/[id]/edit`

**필수 필드 5개** (최소 저장 단위):
1. `name` — 이름
2. `category` — 드롭다운
3. `narrativeSnippet` — textarea (2~4 문장 가이드)
4. `applicableSections` — 체크박스 (다중)
5. `valueChainStage` — 라디오 (5 단계)

**선택 필드** (접혀 있음):
- `parentId` — 자산 드롭다운 (top-level 자산만 후보)
- `evidenceType` — 기본 `structural`
- `keywords` — 태그 입력 (Enter 로 추가)
- `keyNumbers` — 태그 입력
- `sourceReferences` — URL 입력 (여러 개)
- `programProfileFit` — JSON textarea (초보자는 건드리지 않음)
- `status` — 기본 `stable`
- `version` — 기본 1 (저장 시 자동 증가 옵션 체크박스)
- `lastReviewedAt` — 기본 now

**저장 시 검증**:
- 필수 5 필드 비면 거부
- `parentId` 가 자기 자신이면 거부
- `parentId` 지정 시 그 자산이 top-level 인지 확인 (depth 제한)

### 삭제 vs 아카이브

- 기본 액션은 **아카이브** (`status: 'archived'`) — 과거 제안서가 참조하는 자산을 하드 삭제하면 깨짐
- 하드 삭제는 관리자만, 제안서 참조 없는 경우에만 가능 (추후 기능)

### 권한

- v2.0 은 **로그인한 모든 유저** 가 접근 (담당자 1명 전제)
- 향후 권한 분화 필요 시 `role: 'content-admin'` 추가

---

## 매칭 엔진 계층 지원 (Wave H4)

### 점수 계산

부모 자산이 RFP 에 매칭되면 같은 조건으로 children 도 후보에 포함. UI 에서 부모 카드 내부에서 children 펼침/접기.

```ts
// 의사 코드
for (const asset of topLevelAssets) {
  const parentMatch = scoreAssetForSection(asset, ...)
  if (parentMatch.matchScore >= minScore) {
    results.push(parentMatch)
    // children 은 부모 매칭이 strong 일 때만 자동 후보
    if (parentMatch.matchScore >= MATCH_THRESHOLDS.medium && asset.children) {
      for (const child of asset.children) {
        results.push(scoreAssetForSection(child, ...))
      }
    }
  }
}
```

### UI 변경

`MatchedAssetsPanel` 의 `AssetCard`:
- 부모 자산 카드 하단에 `children.length > 0` 이면 "▸ 세부 세션 N개 보기" 토글
- 펼치면 children 카드 들여쓰기로 표시 (각각 독립 Switch · 독립 `acceptedAssetIds` 항목)

---

## 시드 예시 (Wave H5)

담당자 워크플로우 검증용 계층 예시 2건:

### AI 솔로프러너 과정 (top-level parent)
- id: `asset-ai-solopreneur` (Phase G 에서 이관)
- children:
  - `asset-ai-solopreneur-w1` — AI 네이티브 마인드셋
  - `asset-ai-solopreneur-w2` — 아이디어 ↔ AI 대화 설계
  - `asset-ai-solopreneur-w3` — 첫 프로토타입

### AX Guidebook (top-level parent)
- id: `asset-ax-guidebook` (Phase G 에서 이관)
- children:
  - `asset-ax-guidebook-ch1` — 내 사업에서 AI 쓸 자리 찾기
  - `asset-ax-guidebook-ch2` — 프롬프트 기반 작업 자동화

나머지 13종은 parentId=null 로 그대로 이관.

---

## 마이그레이션 경로

### 데이터 이관 (Wave H1)

1. `prisma migrate dev --name phase_h_content_hub` → ContentAsset 테이블 생성
2. `prisma/seed-content-assets.ts` 신규 스크립트:
   - 기존 `UD_ASSETS_SEED` 15종 읽어서 `ContentAsset` 레코드로 insert
   - 3중 태그 필드 JSON 직렬화
   - parentId=null, version=1 기본값
3. `npm run db:seed:content-assets` 추가 (package.json)

### 코드 이관 (Wave H2)

- `UD_ASSETS` 상수 제거 → 리그레션 없도록 호출부 전수 조사:
  - `findAssetById(id)` — async 로 전환
  - `matchAssetsToRfp` — async 로 전환 (이미 async 시그니처 가능)
  - `formatAcceptedAssets` — async 전환
- Import 하는 파일: `page.tsx` · `step-rfp.tsx` · `proposal-ai.ts` · `matched-assets-panel.tsx` · `api/projects/[id]/assets/route.ts`
- async/await 주입 점진 확산

### 하위 호환 (일시적)

Wave H1~H2 사이에 잠시 `UD_ASSETS` 상수를 유지하되 `getAllAssets()` 이 시드 반환 → 호출부 마이그레이션 완료 후 제거.

---

## 품질 게이트 연동

- **Gate 1 (구조)**: `ContentAsset` 최소 필수 5 필드 비어있으면 API 거부
- **Gate 2 (룰)**: 1 단 계층 · 순환 방지 런타임 validate
- **Gate 3 (AI)**: 영향 없음 (매칭 엔진은 Phase G v1 그대로)
- **Gate 4 (사람)**: 담당자 UI 의 "최근 검토일 3 개월 초과" 경고 (선택 · v2.1)

---

## manifest.ts 업데이트 (Wave H2)

```ts
// src/modules/asset-registry/manifest.ts
export const manifest = {
  name: 'asset-registry',
  layer: 'asset',
  version: '2.0.0',
  owner: 'TBD',
  reads: {
    context: ['rfp'],
    assets: ['ContentAsset'], // v2: DB 테이블
  },
  writes: {
    context: [],
    assets: ['ContentAsset'], // 담당자 UI 가 씀
  },
  ui: [
    'src/components/projects/matched-assets-panel.tsx',
    'src/app/admin/content-hub/page.tsx',
  ],
  quality: { checks: [] },
}
```

---

## 변경 이력

- 2026-04-24 — v1.0 초안 (ADR-010 채택 동시 생성)
