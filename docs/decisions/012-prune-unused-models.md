# ADR-012: 미사용 Prisma 모델 정리 (Phase 2.5)

**Status**: Accepted
**Date**: 2026-05-03
**Context**: DIAGNOSIS-2026-05-03 #5 — 44 모델 중 25 모델이 src/ 에서 0회 참조.

## Decision

44 → **36 모델**로 축소. **8 모델 제거**.

원래 11 모델 제거 계획이었으나 `prisma migrate dev --create-only` 실행 시 **3 모델에 시드 데이터 발견**:
- TargetPreset (8 rows)
- InternalLaborRate (16 rows)
- ServiceProduct (14 rows)

PRD v5.1 마스터 데이터로 보존 (코드 호출 0이지만 데이터 손실 방지). 별도 운영 결정 시
다음 migration 에서 처리 권장.

## 제거 대상 (8개)

### Group D-1: 완전 독립 — 4개
incoming/outgoing FK 모두 inactive. 마스터 데이터 미시드, 호출자 0.

| 모델 | 의도 | 제거 이유 |
|---|---|---|
| `DesignRule` | 어드민 룰 엔진 | 미구현 — `proposal-rules.ts` 가 정적 룰로 대체 |
| `AudienceProfile` | 대상자별 프로파일 가중치 | 미구현 — ProgramProfile 로 통합 |
| `WeightSuggestion` | 어드민 가중치 제안 | 미구현 — UI/로직 모두 없음 |
| `ProfileTag` | 태그 풀 누적 | 미구현 — ProgramProfile 의 11축 enum 사용 |

### 보존 → 폐기 결정 (revision, 2026-05-03)

원래 시드 데이터 있어 보존했으나 운영자 결정으로 **추가 제거** (3 모델, 38 rows).

| 모델 | 시드 행 수 | 폐기 사유 |
|---|---|---|
| `TargetPreset` | 8 | ProgramProfile 의 targetSegment 11축 enum 으로 흡수 |
| `InternalLaborRate` | 16 | Coach 모델 + CostStandard 가 단가 담당 |
| `ServiceProduct` | 14 | 서비스 카탈로그 미구현, Coach 단가로 대체 |

추가 migration: `prisma/migrations/20260503100000_drop_legacy_v51_tables/migration.sql`

→ 최종 결과: **44 → 33 모델 (11 모델 정리)**.

### Group D-2: Project FK outgoing — 3개
Project 에서 back-ref array 만 추가 제거.

| 모델 | 의도 | 제거 이유 |
|---|---|---|
| `Expense` | 비용 정산 | 정산 흐름 미구현 — `Budget`/`BudgetItem` 만 사용 |
| `Task` | 프로젝트 task 관리 | 미구현 — UI/API 없음 |
| `TaskAssignee` | Task 담당자 매핑 | Task 와 함께 제거 |

추가로 정리:
- `Project.tasks Task[]` 제거
- `Project.expenses Expense[]` 제거
- `User.taskAssignees TaskAssignee[]` 제거

### Group D-3: AgentSession FK outgoing — 1개

| 모델 | 의도 | 제거 이유 |
|---|---|---|
| `PMFeedback` | Planning Agent 산출물 PM 피드백 기록 | 미구현 — 인터뷰 흐름 별도 (`PlanningIntentRecord` 만 사용) |

추가 정리: `AgentSession.pmFeedbacks PMFeedback[]` 제거.

## 보존 결정 (14개 모델, 이유 명시)

### NextAuth 필수 (2개)
- `Account`, `Session` — JWT 전략이지만 PrismaAdapter 가 Google OAuth 시 쓸 수 있음. 제거 위험 큼.

### Phase 5 측정 chain — 12개
[v5.1 신규] 주석으로 명시된 참여자 데이터 수집 schema.
ADR-008 Impact Value Chain 의 ⑤ Outcome 측정에 직접 활용 예정.

| 모델 | 후속 사용 |
|---|---|
| `Participant` | 7 measurement 모델의 hub — 절대 제거 X |
| `Applicant` | Project 의 신청자 풀 — 모집 단계 |
| `DogsResult` | DOGS 팀빌딩 진단 |
| `ActtResult` | ACT-PRENEURSHIP 사전·사후 진단 |
| `StartupStatusRecord` | 창업 현황 추적 |
| `StartupDiagnosis` | 5D 스킬셋 진단 |
| `SatisfactionLog` (Coach FK) | 코치 만족도 |
| `SatisfactionResponse` (Participant FK) | 참여자 만족도 |
| `CoachingJournal` | 코치 코칭 일지 |
| `AlumniRecord` | 동문 추적 |
| `Content` | IMPACT 모듈별 콘텐츠 매핑 |
| `ContentMapping` | ImpactModule × Content fit-score |

## 적용 절차 (이번 커밋에서 완료된 것)

1. ✅ 본 ADR 채택 (이 문서)
2. ✅ `prisma/schema.prisma` 에서 8 모델 + 4 back-ref array 제거
3. ✅ `npx prisma migrate diff --from-config-datasource --to-schema --script` 로 SQL 추출
4. ✅ `prisma/migrations/20260503000000_prune_unused_models/migration.sql` 작성
5. ✅ `npx prisma generate` 로 client 재생성 + 영향 코드 (Project page / route) 정리
6. ✅ 코드 영향 검증 — typecheck OK / next build OK

## DB 적용 (별도 운영자 결정)

```bash
# Staging 검증
npx prisma migrate deploy

# 또는 로컬에서 schema 와 sync 자동
npx prisma migrate dev
```

**적용 전 체크리스트**:
- [ ] 8 테이블 (Expense / Task / TaskAssignee / DesignRule / AudienceProfile / WeightSuggestion / PMFeedback / ProfileTag) 의 데이터가 0건임을 확인
- [ ] DB 백업 완료
- [ ] Staging 환경에서 먼저 적용 후 정상 동작 확인

## 영향

- 코드: src/ 에서 prisma.expense / task 등 참조 0건 → 빌드 무영향
- DB: 11 테이블 DROP. 데이터 손실 가능성 (현재 모두 비어있을 것으로 예상 — 확인 필요).
- 시드: TargetPreset / DesignRule 등은 시드 스크립트 자체가 없음.
- 헬스체크: `scripts/health-check.ts` 는 영향 없음 (이 모델들 안 봄).

## Rollback

migration 적용 후 문제 발생 시:
- DROP 된 테이블은 복구 불가 (백업 의존).
- 코드 차원 rollback 은 git revert 로 schema 복원 + `prisma migrate dev` 로 재생성.

## Reference

- DIAGNOSIS-2026-05-03 §5 (claude.ts 1014줄 + 44 모델)
- ADR-006 ProgramProfile (TargetPreset 대체)
- ADR-008 Impact Value Chain (Phase 5 측정 보존 근거)
