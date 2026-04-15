# ADR-001: 파이프라인 스텝 순서 변경 — 임팩트를 Step 2 → Step 5로 이동

**Status:** Accepted
**Date:** 2026-04-15
**Deciders:** 사용자(언더독스), AI 공동기획자
**Scope:** 파이프라인 전체 흐름, 모든 CORE 모듈의 입출력 관계

## Context

기존 PRD v5.1의 스텝 순서는 **Impact-First** 철학에 따라:
```
rfp → impact → curriculum → coaches → budget → proposal
```

이는 "임팩트 목표를 먼저 세우고 역산한다"는 방법론적 정합성을 추구했다. 그러나 실제 운영에서 다음 문제가 누적:

1. **Activity 설계가 두 번 일어났다.** 임팩트 단계에서 PM이 Activity를 수동 입력 → 커리큘럼 단계에서 동일한 내용을 세션으로 다시 정의. 동일한 일을 두 번.
2. **임팩트 단계의 Activity가 추상적이었다.** 커리큘럼이 아직 없으므로 PM은 개념적 Activity만 정의 가능 → Logic Model이 뜬구름이 되거나 PM이 막혔다.
3. **평가 배점 최고 항목은 대개 "커리큘럼"이다** (B2G 기준 30점). 이것을 나중 스텝으로 두면 PM의 몰입이 흐트러진다.
4. **Input(코치+예산)이 결정되기 전에 임팩트를 논하는 것은 부자연스러웠다.**

사용자는 2026-04-15 재설계를 요청. "똑같은 일을 두 번 하지 않으면서 Impact-First의 장점은 지킬 방법"을 찾는 것이 목표.

## Options Considered

### Option A — 기존 순서 유지 + Activity 동기화 자동화
- 장점: Impact-First 방법론 보존, 스키마 변경 최소
- 단점: 여전히 "이중 정의" 인지부하, 임팩트 단계의 추상성 문제 미해결
- 기각: 근본 원인을 회피하는 미봉책

### Option B — 임팩트를 완전히 제거하고 커리큘럼에 흡수
- 장점: 단순화
- 단점: Logic Model은 제안서에 필수 요소 (B2G 임팩트 사업 대부분). SROI 프록시 매핑 지점 소실
- 기각: 핵심 산출물 자체를 없애는 건 과도

### Option C — 임팩트를 Step 5로 이동, Activity는 커리큘럼에서 자동 추출 (채택)
- 장점:
  - 커리큘럼·코치·예산이 먼저 확정되므로 Activity/Input이 "자동 추출" 가능
  - PM은 Outcome과 Impact만 집중 → 임팩트 단계의 창의적 가치가 남음
  - Impact-First의 정신(목표 중심 설계)은 **Step 1의 "제안 컨셉·핵심 기획 포인트"** 에서 유지
- 단점:
  - Logic Model의 "Impact 먼저" 순서가 UI상 뒤로 밀림 (설명 필요)
  - 커리큘럼 설계 시 임팩트 목표 참조가 약해질 수 있음 → Step 1에 "대강의 임팩트 방향"을 미리 선언하게 보완
- 채택: 실제 업무 플로우 + 데이터 흐름 양쪽 모두 해결

## Decision

스텝 순서를 다음으로 확정:
```
rfp + 기획방향 → curriculum → coaches → budget + SROI → impact → proposal
```

추가 결정사항:
- **Step 1에 "기획 방향" 블록 신설**: 제안배경·컨셉·핵심 기획 포인트·평가 전략·유사 프로젝트. 여기서 임팩트의 큰 방향을 한 줄로 잡음 (`proposalConcept`).
- **Step 5 임팩트는 "자동 추출 + AI 생성"**: Activity = 커리큘럼 세션, Input = 코치 + 예산. Outcome/Impact만 AI가 생성 → PM 검토.
- **Impact-First는 철학으로 유지**: 제안 컨셉이 임팩트 지향적이어야 한다는 원칙은 CLAUDE.md 설계 철학에 명시.

## Consequences

### Positive
- PM의 이중 입력 제거 (Activity)
- 커리큘럼 품질에 집중 가능 (최고배점 항목 먼저)
- Logic Model이 "사실 기반"이 됨 (커리큘럼에서 추출되므로)
- 제안서 생성 시 전체 맥락이 이미 확정된 상태 → AI 프롬프트의 컨텍스트 풍부

### Negative / Trade-offs
- 방법론적 순수성 손실: "임팩트 먼저 설계"의 직관적 순서를 UI에서 포기
- 사용자 교육 필요: 신입 PM에게 "왜 임팩트가 뒤에 있는가" 설명 필요 → pm-guide 모듈에서 처리
- 기존 구현된 step-impact.tsx의 UX 흐름 재작업 (Activity 입력 UI 제거, 자동 추출 결과 뷰 추가)

### Follow-ups
- [ ] ROADMAP Phase A1에서 `page.tsx` 스텝 순서 변경
- [ ] step-impact.tsx 재작업: Activity 자동 추출 + Outcome/Impact AI 생성
- [ ] pm-guide에 "왜 임팩트가 Step 5인지" 설명 콘텐츠 추가
- [ ] PRD-v5.0 아카이브 처리 완료됨 (2026-04-15)

## References
- 관련 문서: [ROADMAP.md](../../ROADMAP.md) Phase A1, [REDESIGN.md](../../REDESIGN.md) Part 2 Step 5A
- 관련 journey: [../journey/2026-04-15-redesign-kickoff.md](../journey/2026-04-15-redesign-kickoff.md)

## Teaching Notes

**신입 PM/개발자가 이 ADR에서 배울 것:**
- **방법론과 실제 업무 플로우가 충돌할 때**: 방법론의 정신(goal-oriented design)은 유지하되 UI 순서는 실제 사고 흐름에 맞춘다
- "같은 일을 두 번 하게 만드는 UI"는 자동화 여지가 있다는 신호
- 대체 제거(Option B)보다 재배치·자동 추출(Option C)이 안전한 경우가 많다
- 스텝 순서 결정 시 체크리스트:
  1. 각 스텝이 결과를 내려면 무엇이 필요한가?
  2. 다음 스텝이 이전 스텝 결과 없이 의미 있는가?
  3. PM이 같은 정보를 여러 스텝에서 입력하는가?
  4. 최고배점 항목이 초반에 있는가?
