# 2026-04-15 (저녁) — Phase B Wave 1: 게이트마다 걸린 설계 오류들

> 에이전트들이 브리프 지시대로 **중단하고 보고** 해준 덕에 조용히 지나갈 뻔한 Phase A 의 설계 결함 2건이 드러난 날. 게이트 책임이 실제로 작동한 케이스.

## 이날의 맥락
- **참여자:** 사용자, 메인(AI 공동기획자), 서브 에이전트 4명 (B0·B1·B2·B3)
- **무엇을 하려 했나:** Phase B Wave 1 병렬 4개 실행 (B0 schema + B1 AI + B2 similar + B3 eval-strategy)
- **시작점:** Phase A 커밋 4건 완료, 이슈 4건 해소, Phase B 브리프 5개 작성 + 재검토 3건 반영 완료

## 흐름 (시간순)

### 1. Wave 1 4개 에이전트 백그라운드 실행
- B1 이 가장 먼저 영리하게 움직임: B3 미존재를 감지하고 **dynamic import + try/catch** 로 graceful fallback 구현. stateless API 로 schema 의존 없이 완성.
- B2 는 브리프대로 구현했으나 타입 불일치 감지 → 실제 타입(`SimilarProject` 축소판) 을 따라 구현 후 완료 + 불일치 보고.
- B0 는 권한 차단(`.claude/settings.local.json` 의 deny 규칙) 으로 즉시 중단.
- B3 는 타입 불일치(`EvalStrategy`, `RfpParsed.evalCriteria` 필드명) 로 중단.

### 2. 두 가지 중단이 같은 패턴임을 인지
처음에는 B0 (권한) · B2 (타입) · B3 (타입) 를 따로 봤는데, 메인이 패턴을 합쳐서 봄:
- **B2 와 B3 가 모두 `pipeline-context.ts` 의 타입이 data-contract.md 스펙보다 축소되어 있음을 보고**
- 즉 **A2 에이전트(Phase A)가 타입을 만들 때 data-contract.md 스펙을 축소**했고, Phase A Journey 에 기록도 안 되었음
- 메인(나) 가 Phase A 결과를 data-contract.md 와 **대조 검증하지 않은 것이 근본 원인**

### 3. 사용자에게 결정 3개 일괄 요청
- B0 권한 해제 방식 (옵션 A/B/C)
- SSoT 정비 (경로 B) vs 현상 유지 (경로 A)
- B3 경로 B 승인

사용자 응답: "추천대로 하고, 그 대신 결과를 정확하게 보고해줘. 기준을 높게 설정하고 제대로 된 검수를 너가 해야해."
→ 메인이 판단 + 실행 + 검수 책임 발동.

### 4. SSoT 정비 실행
`src/lib/pipeline-context.ts`:
- `EvalStrategy` 를 data-contract.md 기준으로 확장 (`topItems`, `sectionWeights`, `overallGuidance` 추가)
- 기존 `criteria` / `topItem` / `summary` 는 하위호환 optional 로 유지 (B1 이 이미 사용 중이면 깨지지 않게)
- `SimilarProject` 에 `budget`, `won`, `keyStrategy` 추가 (+ Phase A 실용 필드 `isBidWon`, `techEvalScore` 도 유지)
- `ProposalSectionKey` 타입 export

검증: `npm run typecheck` 0 에러. B1 의 `EvalStrategyLike` 는 `topItems` 만 읽으므로 자연 호환.

### 5. B2 산출물 보강 (B2 재실행 없이 메인 직접)
- `findSimilarProjects` 매핑부 수정
- `budget` / `won` / `keyStrategy` 3 필드 추가 매핑 (Prisma select 에 `proposalConcept` 는 B0 완료 후 사용 가능 — 지금은 방어적 접근)
- typecheck 통과

### 6. B0 · B3 재실행 (백그라운드)
- `.claude/settings.local.json` 에서 schema 관련 deny 2줄 임시 제거
- B0 재실행: 권한 해제된 상태로
- B3 재실행: 정비된 타입을 import 해서 브리프 원안대로 구현

## 내가 틀렸던 것

- **Phase A 에서 A2 결과를 data-contract.md 와 대조 검증하지 않음** — 이게 이번 중단들의 근본 원인. A2 에이전트의 "스키마에 없는 필드는 undefined 처리" 를 존중하느라 **설계 완결성 검증을 빠뜨림**.
- **Phase A Journey 에 타입 축소 결정이 기록되지 않음** — 기록이 있었다면 Phase B 브리프 작성 시 발견 가능했을 것.
- **처음 B0 중단을 "권한 문제" 로만 보고 SSoT 문제와 분리해서 생각** — 잠깐이었지만 B2 완료 보고가 왔을 때 패턴을 묶어서 봤어야 더 빠름.
- **브리프 B1 에 "evalStrategy 주입" 을 추가할 때 타입 출처 재검증 안 함** — B1 에이전트가 `EvalStrategyLike` 로 느슨하게 둬서 살았지만, 운이 좋았다.

## 내가 맞았던 것

- 브리프에 "실제 타입과 다르면 보고 후 중단" 을 명시한 것 — B3 가 이 덕에 정확히 멈춤
- 에이전트 병렬 실행 전에 브리프 재검토 게이트를 둔 것 — B1 stateless 전환을 여기서 잡음
- **사용자에게 결정 3개를 따로 물어보지 않고 합쳐서 제시** — 한 번의 왕복으로 해결
- B1 의 `EvalStrategyLike` 방어적 설계는 당사자(B1 에이전트) 의 아이디어. 메인이 예측 못 했던 방어선. 덕분에 SSoT 정비가 B1 재작업 없이 가능해짐.
- **B2 재실행 대신 메인이 직접 보강** — 작은 변경이고 설계 맥락 명확해서 에이전트 호출보다 빠름 (이전 교훈 적용)

## 잃은 것 / 감수한 것

- Wave 1 실행이 한 번에 끝나지 않고 두 라운드(초기 + 재실행)로 분리됨 — **총 소요 시간 예상 대비 ~2배**
- `.claude/settings.local.json` 일시 수정 → 복원 필요. deny 가드가 왜 있었는지 확인 못 함 (사용자가 의도한 것인지 실수인지)
- B0 권한 재추가는 B0 완료 후 진행 예정 — 잊으면 안 됨 (TODO 로 추적)
- B1 이 `parsePlanningDirectionJson` 을 자체 복제한 것 — `claude.ts` 의 `safeParseJson` 이 non-export. 나중에 export 로 승격하는 게 좋을 수 있음 (작은 기술부채)

## 다음에 또 할 일 (이 상황 재발 시)

- [ ] Phase 전이 (예: A → B) 시점에 **Phase N 산출물을 Phase N+1 브리프 작성 전에 data-contract / 설계 문서와 대조 검증** 하는 게이트 추가
- [ ] Journey 에 **타입 축소 결정** 같은 미묘한 건도 반드시 기록 (kickoff journey 에 이번 SSoT 재정비 경험 추가 반영)
- [ ] 에이전트가 브리프 불일치 보고할 때 **같은 패턴이 다른 에이전트에도 있을 가능성** 을 항상 체크
- [ ] 권한 가드 (`.claude/settings.local.json` deny) 를 볼 때 **언제 왜 추가됐는지 git blame** 으로 확인 → 의도 파악

## 신입에게 전할 말 (교육자료 씨앗)

**"에이전트의 STOP 보고는 품질 신호다, 실패가 아니다."**
- B0·B3 가 중단한 건 잘한 일. 브리프 지시를 지킨 결과. 메인(나) 가 이 신호를 잡아서 근본 원인 보정.
- "그냥 돌려" 라고 우회했으면 나쁜 설계가 Phase C 까지 갔을 것.

**"SSoT 선언은 검증 받아야 비로소 SSoT 다."**
- data-contract.md 라는 문서가 있어도, 실제 코드가 그걸 따르는지 검증 게이트 없으면 "규칙 있는 척 다른 규칙" 이 생긴다.
- 다음 Phase 진입 전 반드시 대조.

**"방어적 설계는 복리다."**
- B1 의 `EvalStrategyLike` + dynamic import 덕에 SSoT 정비가 B1 영향 없이 진행됨.
- 에이전트가 "의존성이 불확실하다" 싶을 때 scope 를 좁히고 느슨한 인터페이스를 쓰면 전체 리스크 줄음.

## 연결

- 관련 ADR: [ADR-002 Module Manifest](../decisions/002-module-manifest-pattern.md) — 느슨한 계약 철학의 전개
- 앞선 journey: [2026-04-15-phase-a-execution](./2026-04-15-phase-a-execution.md) — 이번 SSoT 검증 누락의 기원
- 변경된 파일:
  - `src/lib/pipeline-context.ts` (EvalStrategy/SimilarProject 확장, ProposalSectionKey export)
  - `src/lib/similar-projects.ts` (budget/won/keyStrategy 매핑 추가)
  - `.claude/settings.local.json` (deny 임시 해제 — 복원 예정)
- 커밋: (B0 완료 + deny 복원 후 예정)
