# ADR-003: Ingestion 파이프라인 — 자료 업로드가 곧 자산 고도화

**Status:** Accepted
**Date:** 2026-04-15
**Deciders:** 사용자(언더독스), AI 공동기획자
**Scope:** 시스템의 장기 자산 축적 메커니즘 전체

## Context

사용자가 2026-04-15에 명시한 핵심 요구:
> "내가 수주된 제안서, 커리큘럼, 심사위원 질문 등 계속 나오는 것들이 자연스럽게 데이터가 쌓이고 고도화가 될 수 있도록 해야해. 내가 언제든지 자료를 넣으면 더 고도화가 될 수 있도록 하는 시스템 세팅이 되어야 해."

> "지금 당장 엄청 높은 품질보다 쌓였을 때 강력해지는 구조적 설계가 필요해."

이는 시스템의 **정체성 결정**이다. 기능 완성도보다 **축적 메커니즘**이 우선. 초기 기능이 80%만 돼도, 6개월 뒤 300개 제안서·200개 커리큘럼이 쌓여있으면 언더독스의 지속 자산이 된다. 반대로 기능이 100%여도 자료가 안 쌓이면 평범한 SaaS.

현재 시스템은:
- 수주 제안서 참조: 하드코딩된 2건 (청년마을/전통문화) 기반 프롬프트
- 심사위원 질문: 없음
- 커리큘럼 레퍼런스: `PastProposal` 테이블 있으나 자동 축적 없음
- 수주 전략: Planning Agent의 `PlanningIntentRecord`만, 자산화되지 않음

즉, **자산화 경로가 없거나 수동**. 이 상태로는 축적이 불가능.

## Options Considered

### Option A — 필요할 때마다 수동으로 프롬프트·DB 업데이트
- 장점: 단순
- 단점: 개발자 개입 필요, 확장 불가, 사용자가 자료를 갖고 있어도 반영 안 됨
- 기각: 사용자 요구와 정반대

### Option B — Ingestion 파이프라인 + 검토 큐 (채택)
각 자료 종류별 추출 모듈 + 검토 큐 + 자산 테이블 + 임베딩.
- 장점:
  - 사용자는 드롭만 하면 됨
  - 추출 로직 개선 시 과거 자료 재처리 가능
  - Admin 검토 단계로 오염 방지
  - 새 자료 종류 추가 시 모듈 하나 붙이면 됨
- 단점:
  - 초기 구축 비용 (스키마·UI·워커·AI 프롬프트)
  - AI 추출 비용 (자료당 수백~수천 토큰)
  - Admin 검토 부하 (자동 승인 임계값 조정 필요)
- 채택: 장기 가치가 초기 비용을 압도

### Option C — 자동 승인 (검토 큐 생략)
- 장점: Admin 부하 0
- 단점: AI 오추출이 자산을 오염시키면 향후 모든 기획 품질 하락 — 복구 불가
- 기각: 치명적 리스크

## Decision

**구조:**
1. 단일 진입 UI `/ingest` — 자료 종류 선택 + 업로드 + 메타 입력
2. `IngestionJob` 큐 테이블 — 원본 보존·상태 추적·재처리 가능
3. Worker 모듈 4개 (proposal/curriculum/evaluator-question/strategy-interview)
4. `ExtractedItem` 후보 테이블 — AI 추출물을 검토 대기 상태로
5. `/ingest/review` — Admin 승인·편집·거부 UI
6. 승인 시 자산 테이블(WinningPattern 등)에 INSERT + 임베딩

**원칙:**
- **원본 불변 보존** — 언제든 재처리 가능
- **승인 필수** — 자동 반영 금지
- **탈락/실패 자료도 수용** — `outcome: "lost"` 같은 플래그로 반면교사 활용
- **새 자료 종류 = 새 모듈** — 기존 코드 수정 최소

**Phase 배치:**
- Phase A: 스키마 뼈대 (`IngestionJob`, `ExtractedItem`) + 빈 업로드 UI
- Phase D와 병행: `proposal-ingest` — pm-guide가 WinningPattern에 의존하므로
- Phase E~F: 나머지 모듈

## Consequences

### Positive
- **시스템의 정체성 확립** — "쌓일수록 강해지는 구조"
- **사용자가 기능 개발 기다리지 않음** — 자료 있을 때마다 드롭
- **추출 로직 개선이 과거 데이터에 소급 적용** — 원본 보존 덕분
- **Ingestion 승인률 자체가 품질 지표** — AI 추출 개선의 정량 피드백

### Negative / Trade-offs
- **Admin 검토가 새 정기 업무로 추가** — 부하 추적 필요
- **AI 추출 비용** — 월 예측 필요 (제안서 10개/월 가정 시 ~$20)
- **오추출 대처법 필요** — `재처리` + `롤백` 기능 필수
- **초기 검토 기준 불명확** — Admin이 "무엇을 승인할지" 가이드 필요 → playbook 작성

### Follow-ups
- [ ] Phase A: `IngestionJob`, `ExtractedItem` Prisma 마이그레이션
- [ ] Phase A: `/ingest` 업로드 UI 뼈대 (처리 없음, 파일만 저장)
- [ ] Phase D: `proposal-ingest` 워커 + 검토 UI
- [ ] Phase D: `WinningPattern` 테이블 + 임베딩
- [ ] 초기 Admin 승인 가이드 playbook 작성
- [ ] AI 추출 비용 모니터링 대시보드

## References
- 관련 문서: [../architecture/ingestion.md](../architecture/ingestion.md), [../architecture/quality-gates.md](../architecture/quality-gates.md)
- 관련 ADR: ADR-002 (모듈 이식성 — ingestion 모듈도 같은 패턴)
- 관련 journey: [../journey/2026-04-15-redesign-kickoff.md](../journey/2026-04-15-redesign-kickoff.md)

## Teaching Notes

**신입 PM/개발자가 이 ADR에서 배울 것:**
- **기능 vs 자산**: 기능은 쓰면 없어지지만 자산은 쌓인다. 초기에 기능보다 자산화 경로를 깔아두는 것이 장기 레버리지.
- **원본 보존 원칙**: AI 추출물은 언제든 틀릴 수 있다. 원본만 있으면 복구 가능.
- **자동 vs 반자동**: 자산에 영향을 주는 파이프라인은 반드시 사람 검토를 거친다. 예외 없음.
- **탈락 자료도 자산이다**: 성공 사례만 모으면 편향이 생긴다. 실패·탈락·오작동도 구조적으로 수집 대상.
- 축적 시스템 설계 체크리스트:
  1. 원본이 보존되는가?
  2. 재처리 가능한가?
  3. 사람 검토 지점이 있는가?
  4. 새 자료 종류 추가가 쉬운가?
  5. 축적된 자산을 사용할 경로가 명확한가?
