# ADR-021: 단일 제안서 생성 엔진 수렴 + production 배선

- **상태**: Proposed (2026-06-01)
- **결정일**: 2026-06-01
- **결정자**: udpb@udimpact.ai + AI Architect (메인 세션)
- **Scope**: `src/lib/express/*` 생성 경로 · API 라우트 · Express UI 배선
- **관련**: ADR-019(과업 레이어 — 엔진이 소비), ADR-013(자동 진단), ADR-011(Express 메인), ADR-022(모델 정책, 예정 — 선결), Tech Spec §5
- **승계**: ADR-015 "Express+Deep 통합" 의 생성 부분을 구체화

---

## 배경 (Context)

2026-06-01 종합 점검 + Tech Spec 작성에서 확정된 두 문제:

1. **제안서 생성 엔진이 3개로 표류.** `express/produce-ultimate-draft.ts`(13콜 파이프라인) · `proposal-ai.ts`(`/api/ai/proposal`) · `ai/proposal-section.ts`(레거시 `/improve`) — **서로 다른 7섹션 스키마**(예: 3번 섹션이 한쪽 "교육 커리큘럼", 다른 쪽 "임팩트 로직 모델"). 진입 경로에 따라 결과 구조가 달라지고 브랜드보이스·검증이 각자 표류.
2. **flagship 이 production에 안 닿음.** `produceUltimateDraft`(Express 2.0 비전 그 자체)의 유일 호출처가 `/api/dev/ultimate-draft`(prod 404). 실사용 Express는 약한 turn(슬롯필링) 경로 → **품질 작업·평가(패널 83)가 사용자에게 닿지 않는다.**

사용자 지시(2026-06-01): "좋은 제안서가 1번. 토큰 얼마든 OK." Tech Spec의 품질-우선 파이프라인(G1~G13)은 **단일 엔진**을 전제한다.

안 하면: 두 스키마가 영원히 drift, 품질 개선이 dev 경로에만 갇힘, 과업 레이어(ADR-019)를 세 곳에 중복 구현.

---

## Options Considered

### Option A — 3엔진 유지, 케이스별 사용
- 기각: drift 영속. 과업·win-theme·faithfulness를 3중 구현. 유지비 3배.

### Option B — 기존 1개를 그대로 채택
- `produce-ultimate-draft`가 가장 근접하나 **dev-only·과업 미인식·turn 경로와 분리**. `proposal-ai`는 단발 섹션. 어느 것도 Tech Spec G1~G13(과업·정제 루프·faithfulness)을 그대로 못 담음.
- 기각: 어떤 단일본도 목표 구조 부족.

### Option C — 과업-aware 단계형 단일 엔진으로 수렴 + production 배선 (채택)
- 장점: drift 종결, 품질이 사용자에 닿음, eval이 측정하는 것=사용자가 받는 것, 과업 레이어 1곳 구현, 정제 루프·faithfulness gate 1곳.
- 단점: 큰 리팩터. turn 경로 → 단계형 엔진 마이그레이션.
- **채택**: 품질-우선 지시의 직접 귀결. Tech Spec §5와 1:1.

---

## Decision

**`src/lib/express/engine/` 에 단계형 단일 생성 엔진을 만들고 production 라우트에 배선한다.**

### 1. 엔진 구조 (Tech Spec §5 G1~G13)
`gather(병렬) → assemble(단일·plan-then-write) → verify(분리·faithfulness) → rubric self-score → 정제 루프`. 과업(Workstream)-aware. 7섹션은 과업 위 투영(ADR-019).

### 2. 단일 출력 스키마
`ExpressDraft`(현 `express/schema.ts`)를 **유일 제안서 스키마**로 동결. 섹션 키 1~7 + 과업 블록 + WinTheme + ComplianceItem + SROI.

### 3. production 배선
저니맵 S1~S6 라우트(Tech Spec §10)가 이 엔진을 호출. `/api/dev/ultimate-draft`는 엔진 호출 테스트용으로만 잔존(또는 제거). turn 경로는 **입력 수집(S3 대화)** 역할로 축소 — 본문 조립은 엔진이.

### 4. 폐기
- `ai/proposal-section.ts`(레거시 스키마) + `/api/ai/proposal/improve` → 폐기.
- `ai/logic-model.ts` 구 buildLogicModel → 폐기(신 builder 유지).
- `produce-ultimate-draft.ts` 로직은 엔진으로 **흡수** 후 제거.
- ⚠️ planning-agent 트랙(`/api/agent/*`)은 별건 — 의존성 해체 후 별도 처리(통째 삭제 금지).

### 5. 선결
- **ADR-022(모델 정책)** — 엔진의 frontier 전제는 실제 frontier 모델 확정에 의존.
- ADR-019(과업 레이어) Accepted — 엔진이 Workstream 소비.

---

## Consequences

### Positive
- 품질 개선이 production 사용자에 직접 도달. eval = 실사용.
- 단일 스키마·단일 브랜드보이스·단일 검증. 과업·정제·faithfulness 1곳.

### Negative / Trade-offs
- 큰 리팩터(EX-1·EX-2 브리프). 마이그레이션 중 회귀 위험 → eval 게이트로 방어.
- turn 경로 사용자 흐름 변경 → UI(S3) 조정 필요.

### Follow-ups
- [ ] ADR-022(모델 정책) 선결
- [ ] EX-1 브리프 — 엔진 골격 + assemble + production 배선 + 정제 루프
- [ ] EX-2 브리프 — verify faithfulness gate + win-theme typed + compliance matrix
- [ ] 레거시 폐기(`proposal-section`·구 logic-model) — EX-1 완료 후
- [ ] 마이그레이션 중 eval self-score 회귀 0 확인

## References
- Tech Spec §5·§10 · ADR-019 · ADR-013 · 메모리 `project-direction-workstream`
- 관련 코드: `src/lib/express/produce-ultimate-draft.ts`(흡수 대상)·`proposal-ai.ts`·`ai/proposal-section.ts`(폐기)
- 관련 journey: docs/journey/2026-06-01-*

## Teaching Notes
- 엔진이 3개면 품질 개선이 어디에 들어가는지 아무도 모른다. **단일 엔진 = 품질의 단일 투자처.**
- "dev에서 검증했다"와 "production에서 동작한다"는 다르다. eval이 측정하는 경로와 사용자 경로가 같아야 측정이 의미 있다.
- 큰 리팩터의 안전망 = 회귀 eval 게이트. 측정 없이 통합하지 않는다.
