# HANDOFF — 세션 핸드오버 (라이브 문서)

> 매 세션 끝 메인이 **전체 덮어쓰기**. 새 세션 읽는 순서: **HANDOFF → [HISTORY](docs/HISTORY.md) → [glossary](docs/glossary.md) → [decisions/README](docs/decisions/README.md) → 활성 브리프**.
> 최종 정리: 2026-06-01 (compact 직전 클린업).

---

## 📍 현재 상태 (2026-06-01)

- **브랜치:** `feat/alpha-test-prep` (최신 커밋 = 엔진 재구축 + 품질 레이어 + 정리. auto-push 훅으로 origin 동기).
- **무엇을 만들었나 (이번 아크):** "사내 기획 씽크탱크·엔진" 재기획 → 운영 인프라 → 과업 레이어 → 검색 계약 → **단일 생성 엔진** → 검증 레이어 → Gemini 단일화 → 도식 PPTX. **모두 메인 검증 통과, 작동.**
- **일하는 방식:** 위임+검증+투명보고 (ADR-020). 메인=구조/문서, 기능 코드=자급자족 브리프 위임.

## ✅ 완료·작동 (검증됨)
| 영역 | 상태 |
|---|---|
| 운영 인프라 (ADR-020) | playbook·glossary·HANDOFF·HISTORY·brief 시스템. stale 8건 archive. |
| 과업 레이어 (ADR-019) | Prisma 8모델(42→50) + migration **DB 적용 완료** + workstream types/adapter. |
| 단일 검색 계약 (RET-1) | `src/lib/retrieval/` — Contextual·hybrid·RRF·Flash rerank·recall eval. |
| **단일 생성 엔진 (EX-1, ADR-021)** | `src/lib/express/engine/` — gather→assemble(과업 투영)→win-theme→compliance→verify→self-score→정제. `POST /api/projects/[id]/assemble`. **E2E 7섹션 1차본 생성.** |
| 검증 레이어 (EX-2) | proof 강제 win-theme·compliance matrix·결정론 faithfulness gate. |
| 정직한 측정 (EVAL-1) | judge가 win-theme/compliance/인용 입력으로 봄·다중샘플 n=3·**단조 refine(역행 0)**. |
| Gemini 단일화 (ADR-023) | `@google/genai 2.7.0`, Claude 제거, intra-Gemini 폴백. SDK 마이그레이션 완료. |
| 모델 2-tier (ADR-022) | **하이브리드** — 기본 3.5 Flash, **Pro 3키**(`engine.section.core`·`engine.self-score`·`engine.wintheme`). 폴백 3.1Pro→2.5Pro→3.5Flash. |
| 품질 sharpening (QUAL-1·2) | evidence/differentiation grounding·ghosting·named 컨셉 + §3 주차 커리큘럼표·전체 타임라인·실행계획 + **slideSpecs→도식 PPTX(22슬라이드)**. |

## 📊 정직한 품질 현황
- 엔진은 **유능한 멀티 과업 1차본**을 만든다(과업 분리·named 컨셉·주차 커리큘럼·타임라인·리스크 레지스터·도식 PPTX). 샘플: **`docs/samples/sample-draft-B2G-v2.{md,pptx}`** (사용자 검증용).
- 외부 패널 점수는 **~52~66(보완필요/미흡)에서 plateau** — fixture RFP + 얕은 매칭 코퍼스 기준. self-score(74~78)는 자가 judge가 부풀린 값(외부 패널과 괴리).
- ⚠️ **합성 튜닝(EX-2·EVAL-1·QUAL-1·2)은 수확 체감 도달.** 최약 렌즈 = **evidence·differentiation**, 이는 **실 자산 grounding(DATA-2)·실 RFP**에 의존 — 생성 튜닝 아닌 **데이터** 문제.
- ⚠️ 측정 한계: 패널 프롬프트가 섹션을 900자로 잘라 채점 → 주차 표가 잘려 과소평가. (실 §3엔 온전. `_gen-sample.ts` PANEL slice 상향 필요.)

## 🎯 다음 진짜 레버 (우선순위)
1. **DATA-2** — pgvector + **실 코퍼스/실 자산 grounding** → §7 실적 수치 *진실화*(현재 일부 ungrounded=허위 위험) + evidence/differentiation 본질 상승. **품질의 진짜 ceiling.**
2. **실 RFP + 실 연결 자산으로 검증** (fixture 아님).
3. **async 라우트** — 생성 ~10~15분 > Vercel 300s → 스트리밍/job (동기 라우트 prod 타임아웃).
4. 레거시 3엔진 제거(produce-ultimate-draft·proposal-ai·ai/proposal-section — EX-1 검증됐으니 의존성 확인 후).
5. AI-2(LLM 트레이싱)·BR-batch(Batch ingest blurb) — 사용자 확정(ADR-023 §5).
6. WinningPattern 10/102 벡터 재임베딩(matchTuple/Brain 패널 한정) · §3 2000자 캡 ADR(표 별도 필드?).

## 🔑 모델·인프라 핵심
- **Gemini 단일** (`@google/genai`). Pro=`gemini-3.1-pro-preview`(품질·RPD **250/일**), Flash=`gemini-3.5-flash`(plumbing·RPD 10K). Tier 2는 ~30일 뒤(빌링). Flash-우세라 평소 Pro 소진 적음.
- ⚠️ `.env.local` GEMINI_MODEL 핀 **제거됨**(과거 구형 flash 둔갑 버그 해소). 모델은 `ai/config.ts` MODEL_ROUTING(가변)이 제어.
- DB: 로컬 migration 동기(24개). 운영(Neon)은 `migrate deploy` 시 add_workstream_layer 적용 필요.

## ⚠️ 함정 / 하지 말 것 (검증된 교훈)
- **planning-agent 통째 삭제 금지** — `lib/ai/config.ts`·`modules/_types.ts`·`api/agent/*` 라이브 import.
- **브랜치 일괄 삭제 금지** (건별 `--merged` 확인). **회귀 스크립트 선삭제 금지**(vitest 커버 후).
- **stale worktree 2개 실재** — `.claude/worktrees/{amazing-khorana,blissful-goodall}-*` (사용자 확인 후 삭제).
- **서브 에이전트가 측정 run을 자기 백그라운드로 띄우면 결과 미수집** — 측정은 메인이 직접 완주(EVAL-AB·QUAL 교훈).

## 🗂 transient (무시 — gitignore)
- `eval-results-ab-*/`·`*.log` (전부 gitignore). `scripts/_gen-sample.ts` = 샘플 재생성기(유지, `NODE_OPTIONS=--conditions=react-server npx tsx scripts/_gen-sample.ts` ~12분).
- `docs/samples/` = **엔진 생성 샘플(스펙 아님)**. 스펙은 `docs/UD-Engine-*`.

## 보안/위생 follow-up
- express `turn`·`init` auth = ✅ 닫음(FIX-2). lint baseline 4 에러 = 무관 .tsx(setState-in-effect·children-prop) 잔존.

## 🏁 다음 진입 한 줄
**합성 튜닝은 plateau(패널 ~64) — 진짜 다음은 DATA-2(실 자산 grounding) + 실 RFP 검증. 그게 evidence/실적 수치를 *진실+구체*로 만들어 "압도적 제안서"의 ceiling을 올린다.** (사용자가 `docs/samples/` draft·pptx 검증 후 방향 확정.)
