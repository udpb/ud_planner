# 2026-06-01 · 엔진 구축 + 품질 아크 (EX-1→QUAL-2) + compact 정리

| 메타 | 값 |
|------|----|
| 메인 세션 | Claude Opus 4.8 (1M) |
| 트리거 | "좋은 제안서가 핵심, 토큰 무제한" → 구현 착수 → 모델 결정 → 품질 sharpening → compact 정리 |
| 관련 ADR | 019·020·021·022(§4-A·4-B)·023 |
| 다음 진입점 | HANDOFF "다음 진짜 레버" = DATA-2 |
| 선행 journey | 2026-06-01-operating-infra-bootstrap · -engine-spec-and-kickoff |

## 한 일 (브리프 위임 + 메인 검증 시퀀스)
- **FIX-1·FIX-2**: 죽은코드 6건 · turn/init auth · embedding 768→3072.
- **DATA-1**: 과업 레이어 Prisma 8모델(42→50) + migration. **DB drift는 migrate resolve→migrate dev로 해소**(전면 drift 아니라 brain_models 1건 미기록).
- **RET-1**: 단일 검색 계약.
- **AI-1**: `@google/genai 2.7.0` 마이그레이션 + Gemini 단일화. spend cap은 사용자 해제, 런타임 검증(Pro·Flash·임베딩 3072).
- **EX-1**: 단일 생성 엔진 — E2E 7섹션 1차본 생성(과업 투영 작동).
- **EX-2**: proof win-theme·compliance·faithfulness. 메커니즘 작동하나 self-score 미상승.
- **EVAL-1**: 원인 진단·해소 — judge가 EX-2 산출물 안 봤음(측정 블라인드) + refine 역행. judge 입력 확장·다중샘플·단조 refine·risk/ergonomics 보강.
- **모델 A/B (EVAL-AB)**: Flash-only vs 하이브리드 → hybrid +5(win-deciding 렌즈 우위) → **하이브리드 유지**(Flash-only 기각).
- **AI-3**: Flash-우세 라우팅(Pro 2키) + RPD 폴백(3.1→2.5pro→3.5flash) + .env.local 핀 제거.
- **QUAL-1**: evidence/differentiation grounding·win-theme Pro 승격(3키).
- **QUAL-2**: §3 주차 커리큘럼표·전체 타임라인·실행계획 + §2 named 컨셉 + **slideSpecs→도식 PPTX 22슬라이드**.

## 뭘 틀렸나 / 의외 발견
- **"Gemini=flash" 오해**: `.env.local`의 `GEMINI_MODEL=gemini-3-flash-preview` + dotenv override:true 가 로컬 생성·eval을 구형 flash로 둔갑시켰음. 운영=Pro. 핀 제거로 해소.
- **self-judge ≠ panel**: 정제 루프가 self-score를 78까지 올려도 외부 패널은 52~66. self-judge inflation — 패널이 정직한 지표.
- **합성 튜닝 plateau**: EX-2·EVAL-1·QUAL-1·2 모두 메커니즘은 작동하나 패널 점수 정체. 최약 = evidence·differentiation = **코퍼스/실자산 grounding(DATA-2) 의존** — 생성 튜닝의 한계.
- **서브 에이전트가 긴 측정 run을 자기 백그라운드로 띄우고 종료** → 결과 미수집(EVAL-AB·QUAL-1·2). 측정은 **메인이 직접 완주**해야 함.
- **RPD 250**(3.1 Pro Tier 1)이 진짜 병목 — spend cap 아님. Flash-우세로 우회.

## 결정한 것 (ADR)
- 단일 엔진(021)·Gemini단일+genai(023)·2-tier 하이브리드(022 §4-A: A/B로 확정, §4-B: win-theme Pro 승격).
- 합성 튜닝 중단 → DATA-2(데이터 grounding)가 다음 진짜 레버.

## 다음 세션이 알아야 할 것
- 엔진은 작동·유능한 멀티과업 1차본+도식 생성. 진짜 ceiling = **DATA-2 실 grounding + 실 RFP**. (HANDOFF "다음 진짜 레버".)
- 사용자가 `docs/samples/` draft·pptx 검증 후 방향 확정 예정.

## 변경 파일 (요약)
NEW(code): src/lib/express/engine/* · src/lib/retrieval/* · src/lib/workstream/* · src/lib/eval/retrieval-eval.ts · assemble 라우트 · scripts/_gen-sample.ts · migration
MODIFIED(code): ai-fallback·gemini·embedding·web-search·ai/config·eslint·proxy·admin/brain·turn·init·coherence-pass
NEW(docs): ADR-019~023 · UD-Engine-{PRD,JourneyMap,TechSpec} · playbook·glossary·HISTORY·decisions/README·journey · docs/samples/
정리(compact): 브리프 전부 _archive · 샘플 docs/samples/ 분리 · transient(eval-results·*.log) 제거·gitignore · HANDOFF 정본화
검증: typecheck 0 · check:manifest 0 · 각 브리프 메인 직접 재검증
