# ADR 인덱스 (Architecture Decision Records)

> 되돌리기 어려운 결정 / 여러 모듈 영향 / 나중에 "왜 이렇게 했지?" 물을 결정의 기록.
> 템플릿: [TEMPLATE.md](TEMPLATE.md) · 일하는 방식: [../playbook/working-method.md](../playbook/working-method.md)

## 운영 룰
1. **Accepted ADR 은 수정 금지.** 변경 필요 시 새 ADR (`Supersedes: ADR-NNN`).
2. **번호는 영구.** 빈 번호 재사용 금지.
3. **상태:** `Proposed` → `Accepted` → (필요 시) `Superseded` / `Deprecated`.
4. **누가 쓰는가:** 메인 세션. **서브 에이전트는 ADR 작성 금지** — 후보 발견 시 Return Format 의 "결정한 것" 에 보고만.
5. **즉시 기록.** 중요 결정 발견 시 코드보다 ADR 먼저.

## ADR 후보 신호
- [ ] 되돌리기 어렵다 (마이그레이션·데이터 손실 위험)
- [ ] 여러 모듈에 영향
- [ ] 스택·라이브러리·도구 채택
- [ ] 사용자 가시 변경 (UI·UX·메시지)
- [ ] 글로서리 핵심 용어 추가/변경 · 명명 동결
- [ ] 외부 시스템 연동 contract

---

## 목록

| 번호 | 상태 | 제목 |
|---|---|---|
| [001](001-pipeline-reorder.md) | Accepted | 파이프라인 스텝 재배치 (rfp→curriculum→coaches→budget→impact→proposal) |
| [002](002-module-manifest-pattern.md) | Accepted | 모듈 Manifest 패턴 (reads/writes 계약) |
| [003](003-ingestion-pipeline.md) | Accepted | Ingestion 파이프라인 |
| [004](004-activity-session-mapping.md) | Accepted | Activity↔Session 매핑 |
| [005](005-guidebook-system-separation.md) | Accepted | 가이드북 시스템 분리 |
| [006](006-program-profile.md) | Accepted | ProgramProfile 11축 (과업유형 6종 출처) |
| [007](007-step-differentiated-research-flow.md) | Accepted | 스텝 차별화 리서치 |
| [008](008-impact-value-chain.md) | Accepted | Impact Value Chain 5단계 + SROI 수렴 |
| [009](009-asset-registry.md) | Accepted | UD Asset Registry v1 |
| [010](010-content-hub.md) | Accepted | Content Hub v2 (DB + 계층 + 담당자 UI) |
| [011](011-express-mode.md) | Accepted | Express 메인 패러다임 (RFP→1차본) |
| [012](012-prune-unused-models.md) | Accepted | 미사용 모델 정리 |
| [013](013-express-v2-auto-diagnosis.md) | Accepted | Express 2.0 — AI 자동 진단 + 채널 분기 |
| [014](014-wave-u-ux-redesign-actionai-tokens.md) | Accepted | Wave U — UX 재설계 + ActionAI 디자인 토큰 |
| [015](015-wave-v-full-integration-ai-auto-build.md) | ⚠️ Draft (부분 구현·일부 ADR-018 로 대체) | Wave V — Express+Deep 통합 + AI 자동 채움 |
| [016](016-data-center-google-drive-integration.md) | ⚠️ Draft (deferred) | Google Drive 연동 |
| [017](017-wave-w-tone-asset-winning-pattern.md) | ⚠️ Draft (Brain Sphere-2 로 일부 흡수 — 정합 확인 필요) | Wave W — 톤/자산/당선패턴 |
| [018](018-adaptive-stage-layout.md) | Accepted | Adaptive Stage Layout (ADR-015 레이아웃 가정 대체) |
| [019](019-workstream-layer.md) | **Accepted** | 과업(Workstream) 레이어 — 제안서를 N과업 합성으로 |
| [020](020-operating-infrastructure-bootstrap.md) | **Accepted** | 일하는 방식 운영 인프라 부트스트랩 (ActBot 체계 채택) |
| [021](021-single-generation-engine.md) | **Proposed** | 단일 제안서 생성 엔진 수렴 + production 배선 (3엔진 폐기) |
| [022](022-model-policy.md) | **Accepted** | 모델 정책 — Gemini 3.1 Pro + 3.5 Flash **2-tier** (품질=Pro, plumbing=Flash · 런타임 검증) |
| [023](023-gemini-only-genai-sdk.md) | **Accepted** | LLM = **Gemini 단일화** + `@google/genai` SDK 마이그레이션 (Claude 제거 · 네이티브 구조화출력 · thinking) |

## 다음 ADR 후보 (예정)
- ~~ADR-021 단일 엔진~~ → **작성됨 (Proposed, 2026-06-01)**
- ~~ADR-022 모델 정책~~ → **Accepted (2026-06-01, 런타임 검증)** — production=실제 Pro 확인, flash는 eval override 한정
- **ADR-015/017 상태 정정** — Superseded/reconciled 명시

> ⚠️ 상태 정정 필요: 015·016·017 의 Draft/구현 상태가 stale 할 수 있음. 첫 게이트에서 사용자 확인 후 갱신.
