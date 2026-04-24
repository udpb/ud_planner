# ADR-010: Content Hub — Asset Registry v2 (DB + 계층 + 담당자 UI)

- 일자: 2026-04-24
- 상태: Accepted
- 선행: [ADR-009 Asset Registry](009-asset-registry.md)
- 후속: Phase H — Content Hub Wave

## 결정

Phase G 의 Asset Registry(v1, 코드 시드 15종)를 **v2 로 격상**한다:

1. **DB 기반 저장** — `ContentAsset` Prisma 테이블 신설. `src/lib/asset-registry.ts` 의 `UD_ASSETS` 상수는 DB 시드로 이관.
2. **계층 구조** — `parentId` 로 "상품 → 세션/주차/챕터" 1단 계층 지원.
3. **담당자 UI** — `/admin/content-hub` 에서 콘텐츠 담당자가 엔지니어 없이 직접 CRUD.
4. **버전 번호** — 단순 `version: number` 필드 (별도 AssetVersion 테이블은 과잉).
5. **원본 파일 저장 안 함** — 원본 PDF/영상/슬라이드는 LMS·노션·드라이브에 보관. `sourceReferences` 로 URL 링크만.

## 배경

### 사용자 확인 (2026-04-24)

Claude 가 "교육 콘텐츠 저장소가 확장 가능한가" 에 대해 현재 한계 5개를 진단했고, 사용자가 다음 3 답을 확정:

- **Q1 = D**: 4 개 층(L1 커리큘럼 · L2 모듈 · L3 상품 내부 · L4 자산 레지스트리) **전부** 늘어남
- **Q2**: 콘텐츠 담당자 1명이 관리
- **Q3**: 원본 파일은 별도(LMS)에 두고 Ops Workspace 는 **핵심 내용만** 알면 됨

이 3 답에서 **통합 DB 스키마 + 담당자 UI + 링크 기반 경량화** 라는 설계가 자동 도출됨.

### 왜 "v2" 인가

Phase G Asset Registry(v1)가 풀려던 문제는 *RFP 앞에서 자산이 자동 꺼내지는 체계*였다. 그 체계의 **저장소 형태**만 갈아끼우는 것이 v2. 매칭 엔진·narrativeSnippet·3중 태그·Value Chain 연결은 **그대로 유지**.

### 계층 구조가 필요한 이유

RFP 매칭에서 구체 사례:
- "AI 솔로프러너 과정 전체" 를 인용 ✅ (v1 가능)
- "AI 솔로프러너 **Week 3 만** 발췌해 이 사업에 매핑" ❌ (v1 불가능)

콘텐츠 담당자가 세션·챕터 단위로 쪼개 등록할 수 있어야 RFP 섹션 맥락에 정확한 깊이로 인용 가능.

## 대안 비교

### 대안 A (채택): DB 이관 + 1단 계층 + 담당자 UI

- `ContentAsset` 테이블 단일
- `parentId` 로 상품 → 세션 자기 참조 1단 계층
- `/admin/content-hub` CRUD UI
- 기존 `UdAsset` 타입은 유지되되 `src/lib/asset-registry.ts` 가 DB 조회로 전환

### 대안 B: N 단 계층 (Program → Track → Session → Material)

- 장점: LMS 급 구조
- 단점: **사용자 Q3 에 반함** (원본 파일 저장 안 함). 4 단 계층은 원본 자료 관리용.
- 탈락: Ops Workspace 는 "핵심 내용만" 보관. 1 단이면 충분.

### 대안 C: 코드 시드 유지 + YAML/JSON 파일로 분리

- 장점: Git diff 로 이력 추적
- 단점: **Q2 에 반함** (담당자가 YAML 편집? 난이도 높음)
- 탈락: 담당자 UI 필수.

### 대안 D: 별도 AssetVersion 테이블

- 장점: 완전한 이력 추적
- 단점: 단일 담당자 · 링크 기반 운영이면 과잉
- 탈락: `version: number` + `updatedAt` + `updatedById` 로 충분. 필요해지면 나중에 신설.

## 결과 (기대 효과)

1. **병목 해소** — 자산 추가가 PR 이 아니라 폼 입력 1건. 담당자가 하루에 10개도 등록 가능.
2. **세분 인용** — "AI 솔로 Week 3 만" 같은 정확한 참조.
3. **원본 분리** — LMS·노션에 있는 원본은 그대로, Ops Workspace 는 인용 가능한 핵심 메타만.
4. **역할 분화** — Ops Workspace(제안서 기획) ↔ LMS(실제 교육) 경계가 선명. 중복 저장 없음.
5. **Q2 워크샵 대비** — 자산 정리 결과가 도착하면 담당자가 직접 부어넣음.

## 리스크 + 대응

| 리스크 | 대응 |
|---|---|
| 담당자 UI 가 복잡해 실제로 쓰지 않음 | 필드 수 최소화. 필수는 name · category · narrativeSnippet · applicableSections 5개. 나머지 optional. |
| 계층 관계가 꼬여서 순환 참조 발생 | `parentId` 단일, children 은 `parent!==self` 검증. DB 레벨 CHECK 제약 + 앱 레벨 guard. |
| 기존 `UD_ASSETS` 상수 import 를 쓰던 코드가 DB 전환 후 깨짐 | Wave H2 에서 `getAllAssets()` async 함수로 통합 + 캐싱. 호출부 점진적 마이그레이션. |
| `version` 올리면 과거 제안서가 "어느 버전 인용했나" 를 알 수 없음 | 프로젝트의 `acceptedAssetIds` 에 `{id, version}` 페어로 저장하는 확장은 v3 로 미룸. 현재는 "자산의 현재 version" 만 추적. |

## 구현 스코프 (Phase H Wave)

상세: [docs/architecture/content-hub.md](../architecture/content-hub.md)

- **H0** (이 세션) — ADR-010 · architecture/content-hub.md · journey · CLAUDE/ROADMAP
- **H1** — Prisma `ContentAsset` 테이블 + 마이그레이션 + 기존 `UD_ASSETS` 15종 DB 시드 (`prisma/seed-content-assets.ts`)
- **H2** — `src/lib/asset-registry.ts` 리팩터: 코드 시드 → DB 조회 (`getAllAssets()` async) + 요청 단위 메모 캐싱
- **H3** — `/admin/content-hub` 관리자 페이지: 목록 테이블(필터·검색) + CRUD 폼(신규·편집·아카이브) + 부모 선택 드롭다운
- **H4** — 계층 매칭: 부모 매칭 시 children 함께 후보 + `MatchedAssetsPanel` 에 부모 카드 안 children 접기/펼치기
- **H5** — 계층 시드 예시 2건 (AI 솔로프러너 과정 parent + Week 1~3 children · AX Guidebook parent + Ch 1~2 children) — 담당자 워크플로우 검증용
- **H6** — typecheck · MEMORY · journey · ROADMAP Phase I 로 "안정화+배포" 이동

## 스키마 요약 (상세는 content-hub.md)

```prisma
model ContentAsset {
  id                 String   @id @default(cuid())
  name               String
  category           String
  parentId           String?
  parent             ContentAsset?  @relation("Hierarchy", fields: [parentId], references: [id])
  children           ContentAsset[] @relation("Hierarchy")

  applicableSections Json     // ProposalSectionKey[]
  valueChainStage    String   // ValueChainStage
  evidenceType       String   // EvidenceType
  keywords           Json?    // string[]
  programProfileFit  Json?

  narrativeSnippet   String   @db.Text
  keyNumbers         Json?    // string[]

  status             String   @default("stable")
  sourceReferences   Json?    // string[] — 외부 URL
  version            Int      @default(1)
  lastReviewedAt     DateTime

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

## 연결된 규칙

- **ADR-009 Asset Registry**: v1 스키마(UdAsset)는 **타입으로 유지**. 런타임 저장소만 DB 로. 기존 `matchAssetsToRfp` · `formatAcceptedAssets` 계약 불변.
- **ADR-002 Module Manifest**: `asset-registry` 모듈의 reads 에 DB 접근 추가 (`reads.assets: ['ContentAsset']`).
- **ADR-003 Ingestion**: Content Hub 는 **Ingestion 대상 아님** (사용자 Q3). 원본은 외부 시스템.
- **ADR-008 Value Chain**: `valueChainStage` 유지 — 담당자가 자산 등록 시 드롭다운으로 선택.

## 히스토리

- 2026-04-24 — Phase G 완료 직후, "교육 콘텐츠가 계속 늘어나는데 담을 수 있나?" 사용자 질문. Q1/Q2/Q3 답변 후 범위 확정. ADR-010 즉시 작성.
