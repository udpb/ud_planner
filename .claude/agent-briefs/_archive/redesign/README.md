# Phase A 에이전트 브리프 (파이프라인 재설계)

> **트랙:** 파이프라인 재설계 (ROADMAP.md Phase A~F). Planning Agent 트랙과 별도.
> **상위 문서:** [../../../ROADMAP.md](../../../ROADMAP.md), [../../../REDESIGN.md](../../../REDESIGN.md), [../../../docs/architecture/](../../../docs/architecture/)

## 🎯 Phase A 목표

스텝 순서 재배치 + PipelineContext 계약 구축 + Module Manifest 도입 + Ingestion 뼈대 + Gate 1 CI.
Phase A가 끝나면: 스텝 순서가 자연스럽고, 데이터가 스텝 간 전달되며, 새 모듈 추가 기반이 깔려있고, 자료 업로드 UI가 준비되어 있음 (처리는 Phase D 이후).

## 📋 Wave 구조 (병렬 실행 계획)

### Wave 1 — 병렬 4개 (동시 실행 가능, 서로 다른 파일)

| 브리프 | 작업 | 격리 |
|--------|------|------|
| [A2-pipeline-context.md](./A2-pipeline-context.md) | PipelineContext 타입 + API | 일반 |
| [A4-ingestion-skeleton.md](./A4-ingestion-skeleton.md) | Ingestion 스키마 + /ingest UI 뼈대 | 일반 |
| [A5-sidebar-cleanup.md](./A5-sidebar-cleanup.md) | 사이드바 정리 | 일반 |
| [A6-gate1-ci.md](./A6-gate1-ci.md) | Gate 1 CI (typecheck + build) | 일반 |

### Wave 2 — 단일 에이전트 (Wave 1 완료 후)

| 브리프 | 작업 | 이유 |
|--------|------|------|
| [A1-A3-reorder-and-manifest.md](./A1-A3-reorder-and-manifest.md) | 스텝 순서 변경 + Module Manifest 도입 | A3가 A2의 PipelineContext 타입을 참조해야 하고, A1/A3 모두 `page.tsx` + 각 스텝 폴더 영역을 건드려 충돌 방지를 위해 순차 |

---

## Phase B — Step 1 고도화 (기획의 시작점)

> Phase B 가 끝나면: RFP 파싱 → 제안배경 + 컨셉 후보 3개 + 핵심기획포인트 + 평가전략 + 유사 프로젝트 모두 자동 생성. PM 은 선택·편집만.

### Wave 1 — 병렬 4개 (서로 완전히 다른 파일)

| 브리프 | 작업 | 격리 |
|--------|------|------|
| [B0-schema-extension.md](./B0-schema-extension.md) | Project 에 기획방향·평가전략 필드 + migration | 일반 (schema 만) |
| [B1-planning-direction-ai.md](./B1-planning-direction-ai.md) | POST /api/ai/planning-direction (stateless) | 일반 |
| [B2-similar-projects.md](./B2-similar-projects.md) | GET /api/projects/[id]/similar | 일반 |
| [B3-eval-strategy.md](./B3-eval-strategy.md) | src/lib/eval-strategy.ts (규칙 기반) | 일반 |

### Wave 2 — 단일 에이전트 (Wave 1 완료 후)

| 브리프 | 작업 | 이유 |
|--------|------|------|
| [B4-step-rfp-redesign.md](./B4-step-rfp-redesign.md) | step-rfp.tsx 3컬럼 재설계 + 저장 PATCH | B1/B2/B3 API 호출 + B0 필드 활용. Wave 1 전부 필요 |

### 설계 원칙 (재검토 결과, 2026-04-15)
- **B1 stateless**: AI 결과를 Project 에 저장하지 않고 JSON 만 반환. PM 이 확정 시에만 B4 의 PATCH 가 저장. → 쓰레기 데이터 방지 + RESTful
- **B0 schema 를 Wave 2 에 미루지 않는 이유**: Wave 2 B4 가 PATCH 호출 시 필드 필요. 독립 Wave 1 에서 미리 적용.
- **B3 AI 호출 없음**: 규칙 기반. 빠르고 결정론적. Gate 2 룰 엔진의 일부로 자연 흡수.

---

## Phase C — 스텝 간 데이터 흐름 연결 + Gate 2 확장

> Phase C 가 끝나면: 이전 스텝의 결정이 다음 스텝 AI 에 자동 반영됨. DataFlowBanner 로 PM 이 흐름 인지. 예산·임팩트·제안서 룰 엔진 가동.

### Wave 1 — 병렬 4개 (각각 서로 다른 lib/api 파일)

| 브리프 | 작업 | 격리 |
|--------|------|------|
| [C1-curriculum-ai.md](./C1-curriculum-ai.md) | curriculum-ai.ts 신규 + /api/ai/curriculum route 수정 | 일반 |
| [C2-logic-model-builder.md](./C2-logic-model-builder.md) | logic-model-builder.ts (ADR-004) + /api/ai/logic-model route 수정 | 일반 |
| [C3-proposal-ai.md](./C3-proposal-ai.md) | proposal-ai.ts + /api/ai/proposal route 수정 | 일반 |
| [C5-rule-engines.md](./C5-rule-engines.md) | budget-rules.ts · impact-rules.ts · proposal-rules.ts 신규 | 일반 |

### Wave 2 — 단일 에이전트

| 브리프 | 작업 | 이유 |
|--------|------|------|
| [C4-data-flow-banners.md](./C4-data-flow-banners.md) | 모든 step-*.tsx 상단에 DataFlowBanner + PipelineContext props 연결 | 여러 step 파일 동시 수정, Wave 1 API 완성 후 |

### 설계 원칙 (Phase C, 2026-04-16)
- **claude.ts 수정 금지**: 기존 함수는 하위호환 유지. 신규 모듈이 helpers(safeParseJson·CLAUDE_MODEL)만 import.
- **모듈별 파일 분리**: curriculum-ai / logic-model-builder / proposal-ai — Module Manifest 패턴 따라 각자 reads/writes 명확.
- **ADR-004 알고리즘 반영**: C2 가 sessionsToActivities() + deriveInputs() 구현. AI 는 Outcome/Impact 만.
- **Gate 2 확장**: C5 가 budget/impact/proposal 룰 추가. curriculum-rules 와 동일 패턴.
- **DataFlowBanner 재활용**: C4 가 기존 data-flow-banner.tsx 를 모든 스텝에 배치.

---

## Phase D — PM 가이드 + Ingestion + Gate 3

> Phase D 가 끝나면: 수주 제안서 PDF 업로드 → 자동 패턴 추출 → 승인 후 WinningPattern 자산화. 각 스텝 우측에 PM 가이드 패널. 예상 점수 바 + Gate 3 AI 검증.

### Wave 1 — 병렬 2개 (schema 와 독립 모듈)

| 브리프 | 작업 | 격리 |
|--------|------|------|
| [D0-schema-phase-d.md](./D0-schema-phase-d.md) | WinningPattern · ChannelPreset 스키마 + ExtractedItem 확장 | 일반 (schema 전용) |
| [D4-predicted-score.md](./D4-predicted-score.md) | predicted-score 모듈 + 상단 score bar (독립) | 일반 |

### Wave 2 — 병렬 2개 (D0 완료 후)

| 브리프 | 작업 | 격리 |
|--------|------|------|
| [D1-proposal-ingest.md](./D1-proposal-ingest.md) | proposal-ingest 워커 + /ingest/review Admin UI + winning-patterns helper | 일반 |
| [D2-channel-preset.md](./D2-channel-preset.md) | ChannelPreset 시드 3종 + channel-presets helper | 일반 |

### Wave 3 — 단일 (D1·D2 완료 후)

| 브리프 | 작업 |
|--------|------|
| [D3-pm-guide.md](./D3-pm-guide.md) | pm-guide 모듈 + 각 step 우측 패널 배치 |

### Wave 4 — 단일 (D1 결과 필수, D2 도 있으면 품질↑)

| 브리프 | 작업 |
|--------|------|
| [D5-gate3-ai-validation.md](./D5-gate3-ai-validation.md) | Gate 3 AI 검증 3종 (pattern·evaluator·logic) + validate route |

### Phase D 설계 원칙 (2026-04-16)
- **원본 PDF 만 시드** — 가이드북 요약문 시드 금지 (ADR-003 원본 불변 보존, ADR-005 정보 흐름)
- **Admin 승인 필수** — 자동 반영 ❌
- **pm-guide 는 DB 데이터 + static content 만** — 가이드북 본문 주입 ❌ (ADR-005)
- **Gate 3 는 리포트만** — 자동 블록 ❌ (quality-gates.md §1)
- **ChannelPreset 3종 카드는 가이드북 Ch.10 1차 소스** — DB 가 2차 캐시 (ADR-005 §정보 흐름)

## 🚀 메인 세션 실행 순서

```
1. Wave 1 네 개 에이전트 동시 실행
   - 네 개 모두 "background" 로 실행 (run_in_background: true)
   - 네 개 모두 완료 알림을 받을 때까지 대기
   - 각 결과의 Gate 1/2 결과 기록

2. Wave 1 결과 검증
   - 타입 정의가 data-contract.md와 일치하는가
   - Ingestion 스키마가 ingestion.md와 일치하는가
   - npm run build 통과하는가

3. Wave 2 에이전트 실행 (포그라운드 권장)
   - A1+A3 합쳐서 단일 에이전트
   - Wave 1 결과(pipeline-context.ts)를 참조 가능

4. 전체 검증
   - npm run build
   - 각 모듈의 manifest 존재 확인
   - step 순서 확인 (page.tsx)

5. 커밋 (Wave 단위 or A 작업 단위)
```

## 📝 모든 브리프 공통 규칙

### 지키는 것
- 기존 코드 최소 변경. **새 파일 위주**로 작업.
- 각 브리프의 CAN / MUST NOT 섹션 철저히 준수.
- 완료 시 "Return Format" 대로 리포트.
- 막히면 STOP하고 메인에 보고 (추측 금지).
- 한글 커밋 메시지 OK, scope 명확하게.

### 하지 않는 것
- Planning Agent 트랙 파일(`src/lib/planning-agent/`, `src/app/(lab)/agent-test/`) 건드리지 않기.
- 자기 Wave 외 다른 브리프의 담당 파일 건드리지 않기.
- `prisma/schema.prisma` 수정은 A4만 가능 (다른 브리프는 금지).
- 패키지 추가는 사전 승인 (필요하면 STOP하고 물어보기).

## ⚠️ Wave 1 간 충돌 예방

Wave 1 네 개 에이전트가 건드리는 파일이 서로 겹치지 않는지 확인된 상태. 만약 겹침 발생 시 어느 한쪽이 STOP → 메인에 보고. 건드리는 영역:

- A2: `src/lib/pipeline-context.ts`(신규), `src/app/api/projects/[id]/pipeline-context/route.ts`(신규)
- A4: `prisma/schema.prisma`(필드만 추가), `src/app/(dashboard)/ingest/*`(신규), `src/lib/ingestion/*`(신규)
- A5: `src/components/layout/sidebar.tsx`만
- A6: `.github/workflows/*` or `package.json` scripts 섹션만
