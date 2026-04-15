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
