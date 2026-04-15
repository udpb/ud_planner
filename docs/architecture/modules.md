# 모듈 경계 지도

> **원칙:** 모듈은 가볍고 독립적. 공유 DB에서 필요한 것만 읽고, 자기 산출물만 씀. 모듈 간 직접 호출 ❌, 데이터를 통한 간접 연결 ⭕. 다른 사람에게 떼어줄 수 있어야 함.

## 0. 모듈 3계층

```
┌─────────────────────────────────────────────────────┐
│  CORE MODULES (파이프라인 스텝 — 순서가 있음)         │
│  rfp → curriculum → coaches → budget → impact → proposal │
│  각 모듈: 입력 = PipelineContext, 출력 = Context 일부 덮어쓰기 │
└─────────────────────────────────────────────────────┘
          ▲                              ▲
          │ reads                        │ writes
┌─────────┴───────────┐     ┌────────────┴──────────────┐
│  ASSET MODULES      │     │  INGESTION MODULES         │
│  (회사 자산 — 공유)   │     │  (자료 업로드 → 자산 적재)   │
│  - impact-modules   │     │  - proposal-ingest         │
│  - coach-pool       │     │  - curriculum-ingest       │
│  - cost-standards   │     │  - evaluator-question-     │
│  - sroi-proxy       │     │    ingest                  │
│  - winning-patterns │     │  - strategy-interview      │
│  - channel-presets  │     └──────────────────────────┘
│  - ud-brand         │              │
└─────────────────────┘              │ asset 업데이트
          ▲                          ▼
          └──── CORE가 시작될 때 자동 로드 ────┘

┌─────────────────────────────────────────────────────┐
│  SUPPORT MODULES (횡단 기능)                         │
│  - planning-agent (전략 인터뷰)                       │
│  - pm-guide (평가위원 관점·당선 레퍼런스·흔한 실수)    │
│  - predicted-score (예상 점수)                        │
│  - coach-finder (코치 검색 UI)                        │
│  - auth, admin                                        │
└─────────────────────────────────────────────────────┘
```

## 1. Module Manifest 패턴

각 모듈은 자기 스펙을 `manifest.ts`로 선언합니다. 이 파일만 보면 모듈이 뭘 하는지, 무엇에 의존하는지 즉시 파악 가능 → 떼어내기·인수인계·에이전트 위임이 용이.

```typescript
// src/modules/<name>/manifest.ts
import type { ModuleManifest } from "@/modules/_types"

export const manifest: ModuleManifest = {
  name: "curriculum-design",
  layer: "core",                    // core | asset | ingestion | support
  version: "0.1.0",
  owner: "TBD",                     // 담당자 (인수인계 시 바뀜)

  reads: {
    context: ["rfp", "strategy"],   // PipelineContext의 어느 부분
    assets:  ["impact-modules", "winning-patterns", "channel-presets"],
  },
  writes: {
    context: ["curriculum"],
  },

  api:  ["POST /api/ai/curriculum", "POST /api/curriculum/:id/validate"],
  ui:   "src/app/(dashboard)/projects/[id]/step-curriculum.tsx",

  quality: {
    checks: ["R-001", "R-002", "R-003"],   // curriculum-rules에 등록된 룰
    minScore: 70,
  },
}
```

**규칙:**
- `reads.context`에 없는 PipelineContext 필드는 접근 금지 (ESLint 룰로 강제 가능)
- `writes.context` 외 필드는 수정 금지
- 다른 모듈의 함수를 직접 import 금지 — 필요하면 asset으로 승격 or context를 거침
- `owner`는 문자열 그대로 — 실제 인수인계 시 이 필드만 바꿔서 찾기 쉽게

## 2. CORE MODULES (파이프라인 스텝 6개)

| 모듈 | layer | reads | writes | 핵심 산출물 |
|------|-------|-------|--------|------------|
| `rfp-planning` | core | assets: channel-presets, winning-patterns, (과거 Project) | context: `rfp`, `strategy` | 파싱 결과 + 제안배경/컨셉/핵심포인트/평가전략/유사프로젝트 |
| `curriculum-design` | core | context: rfp, strategy / assets: impact-modules, winning-patterns, channel-presets | context: `curriculum` | 트랙·세션·IMPACT 매핑·설계근거 |
| `coach-matching` | core | context: rfp, curriculum / assets: coach-pool | context: `coaches` | 세션별 추천·배정표·사례비 |
| `budget-sroi` | core | context: curriculum, coaches / assets: cost-standards, sroi-proxy | context: `budget` | 예산 구조표·마진·SROI 예측·벤치마크 |
| `impact-chain` | core | context: curriculum, budget / assets: impact-modules, sroi-proxy | context: `impact` | Impact Goal + 5계층 체인 + 측정계획 |
| `proposal-generation` | core | context: 전체 / assets: winning-patterns, channel-presets, ud-brand | context: `proposal` (섹션별) | 7개 섹션 초안 + 평가 시뮬 |

**CORE 공통 규칙:**
- 각 모듈 UI는 상단에 이전 스텝 요약 배너 (같은 일 두 번 묻지 않기)
- 각 모듈 UI는 우측에 PM 가이드 패널 (support 모듈이 렌더링)
- 각 모듈 완료 시 `predicted-score` 모듈 호출 → 점수 바 업데이트

## 3. ASSET MODULES (공유 자산 — 쓰기는 Ingestion만, 읽기는 누구나)

| 모듈 | 담는 것 | 쓰는 주체 | 읽는 주체 |
|------|---------|----------|----------|
| `impact-modules` | CORE 4 + IMPACT 18모듈, 54문항 | seed 스크립트 (1회) | curriculum, impact |
| `coach-pool` | 800명 코치 + 풍부화 메타 | Planning Agent Phase 3 (enrich) | coach-matching, coach-finder |
| `cost-standards` | AC 직접비 단가표 | seed | budget-sroi |
| `sroi-proxy` | SROI 16종 × 4국 | seed | budget-sroi, impact-chain |
| `winning-patterns` | 당선 제안서 섹션별 패턴 | **`proposal-ingest`** | rfp-planning, curriculum, proposal, pm-guide |
| `channel-presets` | B2G / B2B / renewal 발주처 톤 | seed + 수동 편집 | rfp-planning, curriculum, budget, proposal |
| `ud-brand` | 키 메시지, 톤, 차별화 | 코드 상수 | proposal |
| `curriculum-archetypes` | 과거 커리큘럼 구조 패턴 | **`curriculum-ingest`** | curriculum-design |
| `evaluator-questions` | 심사위원 질문 유형별 | **`evaluator-question-ingest`** | pm-guide, proposal |
| `past-projects` | 과거 Project 레코드 | 일반 프로젝트 완료 시 자동 | rfp-planning (유사 프로젝트 검색) |

## 4. INGESTION MODULES (자료 업로드 → 자산 자동 고도화)

> **핵심:** PM이 자료를 드롭하면 자산이 자동으로 풍부해지는 파이프라인. [ingestion.md](./ingestion.md) 상세.

| 모듈 | 입력 | 출력 자산 |
|------|------|----------|
| `proposal-ingest` | 수주 제안서 PDF/DOCX | `winning-patterns` (섹션별 스니펫 + whyItWorks) |
| `curriculum-ingest` | 과거 커리큘럼 엑셀/시트 | `curriculum-archetypes` |
| `evaluator-question-ingest` | 심사위원 질문 메모/녹취 | `evaluator-questions` |
| `strategy-interview-ingest` | 수주 전략 인터뷰 | `past-projects.strategicContext`, `channel-presets` 업데이트 제안 |

**공통 특징:**
- 업로드 UI는 한 군데로 (`/ingest`) — PM이 자료 종류만 선택하면 적절한 모듈이 처리
- 모든 Ingestion은 비동기 큐 (업로드 즉시 완료, 추출은 백그라운드)
- 추출 결과는 **검토 대기 상태**로 저장 → Admin이 승인해야 자산에 반영
- 실패·부분 성공은 로그로 남음 (언제든 재처리 가능)

## 5. SUPPORT MODULES (횡단)

| 모듈 | 역할 |
|------|------|
| `planning-agent` | 전략 인터뷰 (PM의 암묵지 캡처) — [PLANNING_AGENT_ROADMAP.md](../../PLANNING_AGENT_ROADMAP.md) |
| `pm-guide` | 각 스텝 우측 가이드 패널 (평가위원 관점·당선 레퍼런스·흔한 실수·UD 강점 팁) |
| `predicted-score` | 파이프라인 상단 점수 바 |
| `coach-finder` | 800명 코치 검색 UI (Planning Agent Phase 5) |

## 6. 모듈 신규 생성·인수인계 프로토콜

### 신규 모듈 추가
1. `src/modules/<name>/` 생성
2. `manifest.ts` 작성 (layer·reads·writes·api·ui)
3. `reads`에 적은 자산/컨텍스트만 접근
4. `writes`에 적은 것만 수정
5. `docs/architecture/modules.md` 이 문서의 해당 표에 한 줄 추가
6. ADR 작성 (왜 이 모듈이 필요한지)

### 인수인계 (다른 사람에게 떼어주기)
1. `manifest.ts`의 `owner` 변경
2. 해당 모듈의 ADR + 관련 journey 엔트리를 인수자에게 공유
3. `reads`/`writes`가 계약이므로 내부 구현은 인수자 자유

## 7. 지금 당장 필요한 것 vs 나중에

**Phase A (지금):** Module Manifest 타입 정의 + 기존 스텝 파일들에 manifest 부여 (코드 재배치 없이 메타데이터만)
**Phase B+:** ESLint 룰·런타임 검증·모듈 레지스트리
**별건:** `src/modules/` 디렉토리로의 실제 재배치는 리팩토링이 과도하면 Phase F로 미룸. manifest는 `src/app/(dashboard)/projects/[id]/` 옆에 co-locate 가능.

---

**다음 문서:** [data-contract.md](./data-contract.md) — PipelineContext 전체 타입 정의
