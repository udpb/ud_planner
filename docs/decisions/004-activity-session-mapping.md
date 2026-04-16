# ADR-004: Activity-Session 매핑 — 커리큘럼 세션 → Logic Model Activity 자동 변환

**Status:** Accepted
**Date:** 2026-04-16
**Deciders:** 사용자(언더독스), AI 공동기획자
**Scope:** Phase C2 (logic-model API) · Phase E4 (자동 추출 UI) · Step 5 임팩트

## Context

ADR-001 에서 "임팩트를 Step 5 로 이동, Activity 는 커리큘럼에서 자동 추출" 결정. 그런데 **어떻게 추출하는지** 의 구체 규칙이 없었다.

Phase C2 (`buildLogicModel()` API 수정) 브리프를 쓰려면 이 규칙이 확정되어야 한다.

**질문들:**
1. 1 세션 = 1 Activity 인가?
2. Action Week 세션은 별도 Activity 인가, 묶이는가?
3. 1:1 코칭은?
4. 트랙이 여러 개면?
5. 이론 세션은?

## Options Considered

### Option A — 1 세션 = 1 Activity (전수 변환)
모든 세션을 그대로 Activity 로 나열.
- 장점: 가장 단순, 누락 없음
- 단점: 10~20 세션이면 Activity 10~20개 → Logic Model 이 비대해짐. 평가위원이 읽기 어려움.
- 기각: Logic Model 의 Activity 는 보통 4~6개가 적정

### Option B — 트랙/유형 기반 그룹핑 (채택)
세션들을 **유형별로 묶어** Activity 로 변환:

| 세션 유형 | Activity 변환 규칙 |
|----------|-------------------|
| **일반 워크숍/실습 세션** (isTheory=false, isActionWeek=false, isCoaching1on1=false) | 연속된 주제 근접 세션들을 1 Activity 로 그룹핑 (AI 가 제목 유사도로 판단) |
| **이론 세션** (isTheory=true) | "이론 교육" Activity 1개로 통합 (세부 주제는 Output 으로) |
| **Action Week** (isActionWeek=true) | "실전 실행 주간" Activity 1개로 통합 (Action Week 가 여러 회차여도 1개) |
| **1:1 코칭** (isCoaching1on1=true) | "개별 멘토링" Activity 1개로 통합 |
| **IMPACT 모듈 매핑 있는 세션** | IMPACT 단계(I/M/P/A/C/T) 별로 1 Activity (같은 단계 세션은 합쳐짐) |

**결과: 세션 15개 → Activity 4~7개 (적정 범위)**

### Option C — AI 가 자유롭게 그룹핑
세션 리스트를 AI 에 주고 "4~6개 Activity 로 요약해" 하는 방식.
- 장점: 유연
- 단점: 매번 다른 결과, 재현성 없음, PM 이 검증하기 어려움
- 기각: 결정론적 규칙 + AI 는 Output/Outcome 생성에만

## Decision

**Option B — 트랙/유형 기반 결정론적 그룹핑 + AI 는 Outcome/Impact 만 생성**

### 구체 알고리즘

```typescript
function sessionsToActivities(sessions: CurriculumSession[]): Activity[] {
  const activities: Activity[] = []

  // 1. Action Week 통합
  const awSessions = sessions.filter(s => s.isActionWeek)
  if (awSessions.length > 0) {
    activities.push({
      type: 'ACTION_WEEK',
      title: `실전 실행 주간 (${awSessions.length}회차)`,
      sourceSessions: awSessions.map(s => s.sessionNo),
      outputs: ['실행 계획서', '중간 점검 보고서', '최종 실행 결과물'],
    })
  }

  // 2. 1:1 코칭 통합
  const coachingSessions = sessions.filter(s => s.isCoaching1on1)
  if (coachingSessions.length > 0) {
    activities.push({
      type: 'COACHING',
      title: `개별 멘토링 (${coachingSessions.length}회)`,
      sourceSessions: coachingSessions.map(s => s.sessionNo),
      outputs: ['코칭 일지', '실행 피드백', '개선 계획'],
    })
  }

  // 3. 이론 통합
  const theorySessions = sessions.filter(s => s.isTheory && !s.isActionWeek && !s.isCoaching1on1)
  if (theorySessions.length > 0) {
    activities.push({
      type: 'THEORY',
      title: `이론 교육 (${theorySessions.length}회)`,
      sourceSessions: theorySessions.map(s => s.sessionNo),
      outputs: theorySessions.map(s => s.title),  // 각 세션 제목이 산출물
    })
  }

  // 4. 나머지 워크숍/실습 — IMPACT 모듈 매핑 기준으로 그룹핑
  const workshopSessions = sessions.filter(
    s => !s.isTheory && !s.isActionWeek && !s.isCoaching1on1
  )
  // impactModuleCode 앞 글자(I/M/P/A/C/T) 가 같은 세션끼리 묶기
  // 매핑 없는 세션은 주제 유사도로 AI 보조 그룹핑 (또는 순서 기반 2~3 연속 묶기)
  const grouped = groupByImpactStageOrProximity(workshopSessions)
  for (const group of grouped) {
    activities.push({
      type: 'WORKSHOP',
      title: deriveGroupTitle(group),
      sourceSessions: group.map(s => s.sessionNo),
      outputs: group.map(s => `${s.title} 산출물`),
    })
  }

  return activities
}
```

### Input 자동 추출 (Step 3 코치 + Step 4 예산에서)

```typescript
function deriveInputs(coaches: CoachesSlice, budget: BudgetSlice): Input[] {
  return [
    {
      type: 'HUMAN',
      title: `코치진 ${coaches.assignments.length}명`,
      detail: `총 사례비 ${coaches.totalFee.toLocaleString()}원`,
    },
    {
      type: 'FINANCIAL',
      title: `사업 예산 ${budget.structure.acTotal.toLocaleString()}원`,
      detail: `마진 ${budget.marginRate}%`,
    },
    {
      type: 'INFRASTRUCTURE',
      title: '교육 인프라',
      detail: '온·오프라인 교육장, 언더베이스 LMS, EduBot AI 도우미',
    },
  ]
}
```

### AI 의 역할 (축소된 범위)

AI 는 다음만 생성:
- **Output**: Activity 에서 나오는 구체 산출물 보강 (위 규칙 기반 Output + AI 추가 제안)
- **Outcome**: Output 이 만드는 변화 (2~4개)
- **Impact**: 최종 사회적 임팩트 (1~2개)
- **SROI 프록시 매핑**: Outcome 별 SROI 프록시 연결 제안

AI 는 Activity/Input 을 **생성하지 않고 검증만** ("이 Activity 가 빠진 것 같습니다" 수준의 제안은 가능).

## Consequences

### Positive
- Activity 가 결정론적 → PM 이 예측 가능, 동일 커리큘럼이면 항상 같은 Activity
- Logic Model 이 실제 커리큘럼에 기반 → "뜬구름 Activity" 방지 (ADR-001 목표 달성)
- AI 비용 절감 (Activity/Input 생성 불필요)
- 세션 수 대비 Activity 수가 적정 (4~7개) → 평가위원 가독성

### Negative / Trade-offs
- 그룹핑 규칙이 모든 케이스에 맞지 않을 수 있음 → PM 이 수동 조정 가능해야
- IMPACT 모듈 매핑이 없는 세션의 그룹핑은 순서 기반 휴리스틱 → 정확도 떨어질 수 있음
- "이론 교육" Activity 가 너무 뭉뚱그려질 수 있음 → 이론 세션이 3개 이상이면 분리 고려

### Follow-ups
- [ ] Phase C2: `src/lib/logic-model-builder.ts` 에 `sessionsToActivities()` + `deriveInputs()` 구현
- [ ] Phase C2: `buildLogicModel()` API 프롬프트에 Activity + Input 을 사전 주입 (AI 는 Output/Outcome/Impact 만)
- [ ] Phase E4: step-impact.tsx UI 에서 "커리큘럼에서 자동 추출됨" 배너 + Activity 편집 가능
- [ ] PM 이 Activity 그룹핑을 수동 조정할 수 있는 UI (Phase E4+)
- [ ] Journey 에 첫 실사용 결과 기록 → 그룹핑 규칙 조정

## References
- 관련 ADR: [ADR-001](./001-pipeline-reorder.md) — 임팩트 Step 5 이동 결정
- 관련 문서: [../architecture/data-contract.md](../architecture/data-contract.md) §1.2 ImpactSlice
- 관련 journey: [../journey/2026-04-15-redesign-kickoff.md](../journey/2026-04-15-redesign-kickoff.md)

## Teaching Notes

**신입 PM/개발자가 이 ADR 에서 배울 것:**
- **결정론적 그룹핑 + AI 보강** 패턴: 핵심은 규칙 기반으로 만들고 AI 는 빈 칸만 채우게 한다. AI 에 전부 맡기면 재현성 없고 검증 불가.
- **Activity 개수 적정선**: 4~6개. 너무 적으면 빈약, 너무 많으면 가독성 저하. 이건 수주 제안서의 평가위원 경험에서 나온 경험칙.
- **세션 유형 → Activity 유형** 매핑 테이블은 시간이 지나며 조정 대상. 첫 5건의 실사용 결과를 Journey 에 기록해서 규칙 수정 근거로 삼자.
- **Input 자동 추출** 은 간단하지만 가치 높다: PM 이 예산표에서 숫자를 복사해 Logic Model 에 붙이던 반복 작업 제거.
