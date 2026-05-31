# 2026-06-01 · 기획 엔진 산출물(PRD·저니맵·TechSpec) + 구현 킥오프

| 메타 | 값 |
|------|----|
| 메인 세션 | Claude Opus 4.8 (1M) |
| 트리거 | "PRD 다시 써줘 → 목업 저니맵 → 기술스펙 촘촘히 → 이대로 가자 → 좋은 제안서가 핵심, 토큰 무제한 → API 세팅됨, 런타임 확인해줘" |
| 관련 ADR | ADR-019·020 Accepted · ADR-021 Proposed · **ADR-022 Accepted(런타임 검증)** |
| 다음 진입점 | HANDOFF "다음" — EX-1·DATA-1·RET-1 (P2) |

## 한 일
1. **벤치마크 리서치 4축 병렬**(제안서도구·RAG SOTA·지식엔진·당선과학) → PRD에 인사이트 주입.
2. **PRD v1.0** `docs/UD-Engine-PRD-v1.0.html` — 방향·수정/고도화/폐기/추가·벤치마크. 공식 디자인 킷 적용(NanumHuman+Poppins·단일 accent·장식 없음). 에셋 `docs/fonts`·`docs/assets/logo` co-located.
3. **저니맵 v1.0** `docs/UD-Engine-JourneyMap-v1.0.html` — 목업 기반 8단계(S0~S7)·9결정지점·페르소나·리스크. 디자인 킷.
4. **Tech Spec v1.0** `docs/UD-Engine-TechSpec-v1.0.md` — §0 품질-우선 공리(토큰 무제한) + 데이터모델(과업+7신규) + 생성 G1~G13(단일엔진) + 검색 + Rubric + 플라이휠 + API + 브리프 P0~P5.
5. **ADR**: 019(과업)·020(운영인프라) **Accepted**(사용자 "이대로 가자") · 021(단일 엔진) Proposed · **022(모델 정책) Accepted**.
6. **FIX-2 위임→검증**: turn/init `requireProjectAccess` · embedding 768→3072+assert · web-search(Gemini search grounding → invokeAi 대체 불가, inline disable). 메인이 eslint 예외에 embedding.ts 추가 → lint 5→4 에러.
7. **모델 런타임 프로브(ADR-022 핵심)**: 실 API 키로 직접 호출.

## 뭘 틀렸나 / 의외 발견
- **"Gemini=flash" 가정 뒤집힘.** 런타임 프로브: 코드 기본값 `gemini-3.1-pro-preview`는 **실제 작동하는 Pro frontier**(modelVersion 확인, thinking 489토큰). "flash 동작"은 **eval 스윕 env override 한정**이었음. → production Express는 이미 Pro로 생성. 패널 83점은 flash 측정치(실품질 과소평가). 교훈: 명목값 ≠ 런타임, 의심되면 프로브.
- **ANTHROPIC_API_KEY 미설정** → Claude fallback 실제로 무력(Gemini 실패 시 throw, 조용한 강등 아님). 가용성 리스크 — 사용자 결정 대기.
- **Gemini 3.x = thinking 모델** — maxOutputTokens가 thinking에 소모(2.5-pro 빈 응답이 증거). 출력 예산 크게.
- web-search가 `googleSearchRetrieval` + groundingMetadata 사용 → invokeAi(텍스트 전용)로 못 옮김. 엔진 gather 단계 외부 리서치는 tools-capable 경로 필요(TechSpec 후속).

## 결정한 것 (메인)
- 디자인: 문서 chrome=공식 킷, 화면 목업=킷 토큰 플랫 와이어프레임(실앱 UI는 구현 시 shadcn).
- eslint 예외에 embedding.ts 추가(임베딩 전용 SDK는 invokeAi 대체 불가, 정당).
- 프로브 스크립트는 throwaway → 실행 후 삭제(결과는 ADR-022 표에 영구 기록).

## 다음 세션이 알아야 할 것
- **ADR-022 결과로 품질-우선 전제 충족**(production=Pro). ADR-021 엔진은 Pro 위에서 시작.
- 남은 사용자 결정: ANTHROPIC_API_KEY 설정(fallback 이중화).
- 다음 구현: EX-1(엔진 골격)·DATA-1(과업 Prisma)·RET-1(검색 계약). DATA·RET 병렬 가능.
- EVAL: 스윕 모델 Pro로 pin + 재측정(패널 점수 재산정).
- 사전 존재 lint 4에러(setState-in-effect·children-prop, 무관 feature) — 별도 FIX 후속.

## 변경된 파일
NEW: docs/UD-Engine-{PRD,JourneyMap}.html · docs/UD-Engine-TechSpec-v1.0.md · docs/decisions/021·022 · docs/fonts/* · docs/assets/logo/* · 본 journey
MODIFIED(docs): PRD-Brain·README·CLAUDE·ROADMAP·ADR-015·017·019·020·decisions/README·glossary·docs/README·HISTORY·HANDOFF
MODIFIED(code, FIX-1·FIX-2): proxy.ts·admin/brain·turn·init·embedding·vector-utils·schema(주석)·research/web-search·eslint.config.mjs
DELETED(code, FIX-1): infer-program-profile·extract-quote·slide-preview-test(4)
ARCHIVED: stale docs 8 → docs/archive · 브리프 FIX-1·FIX-2 → _archive
검증: typecheck 0 · check:manifest 0 · lint 5→4(잔존 무관) · src 변경 전부 브리프 CAN-touch ⊆
