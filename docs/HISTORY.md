# HISTORY — 문서 버전 변천 단일 ledger

> 모든 핵심 문서의 버전 변천 단일 기록. `docs/` 에는 최종본만 유지, 옛 버전은 여기 기록 후 삭제.
> 결정의 "왜" = `decisions/` · 시행착오 "어떻게" = `journey/` · 본 파일 = "어느 시점에 어떤 문서가 폐기/이어졌는지".
> 최초 작성: 2026-06-01 (ADR-020). **이 ledger 의 첫 임무 = 문서가 코드보다 ~2세대 stale 한 현실을 진실화한다.**

---

## 1. 현재 진짜 상태 (2026-06-01 기준)

| 항목 | 진실 | stale 주장 (정정) |
|---|---|---|
| Prisma 모델 수 | **50** (42 + 과업 레이어 8, ADR-019. migration 적용 완료 2026-06-01, DB 동기화) | README/HANDOVER "44" |
| 코드 frontier | Brain Sphere-2 + alpha-test (P9~P12·OCR·RAG 2048·pptx·평가위원 패널) | ROADMAP "Wave V 미시작" |
| production Express | turn(슬롯필링) 경로 | flagship produceUltimateDraft = dev-only(404) |
| AI 실동작 | eval 스윕 flash | "Gemini 3.1 Pro Primary" (명목) |
| 현재 브랜치 | `feat/alpha-test-prep` (HEAD 0d39a3e) | — |
| ADR 수 | **20** (001~020) | README "12 ADR" |

## 2. 현재 최종본 인벤토리

### 운영 (2026-06-01 신규/갱신 · ADR-020)
| 문서 | 파일 | 용도 |
|---|---|---|
| 운영 규칙 | `CLAUDE.md` | 최상위 룰 + 진입점 (일하는 방식 섹션 추가) |
| 서브 에이전트 룰 | `AGENTS.md` | 위임 규칙 + STOP 조건 |
| 핸드오버 | `HANDOFF.md` | 라이브 상태 (매 세션 덮어쓰기) |
| 문서 ledger | `docs/HISTORY.md` | 본 파일 |
| 용어 SSoT | `docs/glossary.md` | 제안서 도메인 용어 |
| Playbook | `docs/playbook/{working-method,brief-checklist,reporting}.md` | 일하는 방식 |
| ADR 인덱스 | `docs/decisions/README.md` + `TEMPLATE.md` | 결정 기록 |
| Journey 규칙 | `docs/journey/README.md` | 세션 로그 |

### 제품
| 문서 | 상태 |
|---|---|
| **`docs/UD-Engine-PRD-v1.0.html`** ⭐ | **신규 단일 진실 PRD (2026-06-01)** — 사내 기획 씽크탱크·엔진. PRD + 수정/고도화/폐기/추가 분석 + 벤치마크 리서치 통합. PRD-v8.0·PRD-Brain 승계. 공식 디자인 킷 적용 |
| **`docs/UD-Engine-JourneyMap-v1.0.html`** ⭐ | **PM 저니맵 (목업 기반, 2026-06-01)** — RFP→당선 1차본 8단계(S0~S7)·9결정지점·화면 목업·페르소나·리스크 시그니처. 디자인 킷 적용. |
| **`docs/UD-Engine-TechSpec-v1.0.md`** ⭐ | **Tech Spec (2026-06-01)** — 설계공리(품질최우선·토큰무제약)·데이터모델(과업레이어+7신규모델)·생성 파이프라인(G1~G13 단일엔진)·검색계약·Rubric엔진·플라이휠·API·11구현브리프(P0~P5). 구현 바이블. |
| `PRD-v8.0.md` | Express 2.0 PRD — 부분 뷰로 잔존 (Engine PRD 가 승계) |
| `PRD-Brain.md` | Brain Sphere-2 deep-dive — 부분 뷰. 깨진 `PRD-v11` 참조 → `PRD-v8.0` 정정 완료 |
| `ROADMAP.md` | ⚠️ stale (05-19, Wave V 미시작 주장) |
| `REDESIGN.md` | Phase-A 시대. 아카이브 후보 |
| ADR 001~020 | `docs/decisions/` |

### 변하지 않는 참조
`docs/architecture/*` (modules·data-contract·value-chain·asset-registry·content-hub·express-mode 등) · `prisma/schema.prisma`

## 3. 아카이브/정정 대상 (stale)

| 파일 | 문제 | 처리 |
|---|---|---|
| `HANDOVER.md` | 04-29 스냅샷. PRD-v7.0·44모델·12ADR — 전부 오류. README 가 신규자를 여기로 먼저 보냄 | → `docs/archive/` (HANDOFF.md 가 대체) |
| `docs/architecture/current-state-audit.md` | 04-15, 10 phase 전 코드 감사 | → archive |
| `PLANNING_AGENT_ROADMAP.md` | Planning Agent 휴면 트랙 | → archive (단 planning-agent lib 는 라이브 import 有 — 코드 삭제 금지) |
| `PRD-Brain.md`/journey 의 `PRD-v11.0.md` 참조 | 파일 부재 (깨진 링크) | → 생성 or PRD-v8.0 재지정 |

## 4. 변천 timeline (압축)

- **Phase 0** (2026-04~05) — Phase A~L 파이프라인 + Express + Wave N/M-Impact/C/P/Q/U + ADR-001~014. (ROADMAP 가 여기까지만 추적)
- **Phase 1** (2026-05-20~) — Brain Sphere-2 (concept 그래프·당선패턴·RAG) + ADR-015~018 + ux-v2 branches.
- **Phase 2** (2026-05-29~31) — alpha-test prep (K~P, P9~P12 풀텍스트 RAG·OCR·pptx·평가위원 패널). frontier.
- **Phase 3** (2026-06-01) — 종합 점검 → 3기둥 재기획(ADR-019) + 운영 인프라(ADR-020) + **엔진 재구축**: 과업 레이어·검색 계약·단일 생성 엔진(EX-1, ADR-021)·검증 레이어(EX-2)·정직한 측정(EVAL-1)·Gemini 단일화(ADR-023)·2-tier 하이브리드(ADR-022)·품질 sharpening(QUAL-1·2, 도식 PPTX). 산출물 샘플 `docs/samples/`.
- **Phase 4 (다음)** — **DATA-2(실 자산 grounding)** + 실 RFP 검증이 진짜 품질 ceiling. 합성 튜닝은 plateau(패널 ~64). **현재 진입점 = HANDOFF.**

## 5. 다음 버전 작업 룰
- **새 버전**: `*_vN+1` 파일 + 본 ledger §2/§4 갱신 + 옛 버전 §3 으로 + 삭제. external-sources/ADR/Journey 는 삭제 금지.
- **제자리 수정**: 파일명 유지, HISTORY 미터치, Journey 만 기록.
- **구조적 변경**: 새 버전 + HISTORY + Journey + ADR 모두 갱신.

## 변경 이력
- **2026-06-01** — 최초 작성 (ADR-020). 문서 진실화 + 인벤토리 + 아카이브 대상 식별.
