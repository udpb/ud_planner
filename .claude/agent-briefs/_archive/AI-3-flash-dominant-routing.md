# Brief AI-3 — Flash-우세 라우팅 + RPD 폴백 + 검증

> **자급자족.** 본 파일 + `../../CLAUDE.md` + `../../AGENTS.md` + `../../docs/glossary.md`.
> 막히면 추측 금지 → STOP 후 메인 보고.

| 메타 | 값 |
|------|----|
| ID | `AI-3-flash-dominant-routing` |
| 작성일 | 2026-06-01 |
| 상태 | ✅ 완료 (2026-06-01, 메인 검증: routing-probe Pro=2키만·EVAL_ALL_FLASH→전부flash·폴백 2.5pro·.env.local 핀 제거·typecheck 0). coherence-pass(Pro 잔존)는 EVAL 브리프서 보정. |
| 우선순위 | P1 |
| 격리 | 일반 (단독 — LLM 코어 + 엔진) |
| 관련 | ADR-022(2-tier·RPD·사용자 결정 ①), Tech Spec §8 |

## 🎯 Mission
모델 라우팅을 **Flash-우세**로 세팅한다: 기본 전부 **3.5 Flash**, **3.1 Pro는 "꼭 필요한 곳" 2개 키에서만**(롱컨텍스트·추론 결정적). + intra-Gemini 폴백 체인을 RPD-aware로 수정. + `.env.local` 구형 핀 제거. + **런타임 트레이스로 "Pro가 지정 키에서만 도는지" 검증**. (사용자 ①: Flash-우세 하이브리드. 품질 확정은 후속 EVAL A/B.)

## 📋 Context
대시보드: 3.1 Pro RPD 250/일(낮음) vs 3.5 Flash 10K. 사용자 "Pro는 꼭 필요한 곳에서만." 스펙(웹): Pro 우위 = 깊은 롱컨텍스트(MRCR 84.9 vs 77.3)·추상 추론뿐. → 제안서에서 그게 결정적인 **③ 사업내용 핵심 합성**과 **self-score judge**만 Pro, 나머지 Flash. ⚠️ `.env.local`의 `GEMINI_MODEL=gemini-3-flash-preview`(override:true)가 "Pro"를 구형 flash로 둔갑시켜 온 버그 — 제거 필요.

## ✅ Prerequisites (STOP 조건)
- [ ] `ai/config.ts`에 `FLASH_MODEL`·`MODEL_ROUTING`·`ModelTier` 존재 — 검증: `grep -n "FLASH_MODEL\|MODEL_ROUTING" src/lib/ai/config.ts`
- [ ] 엔진 LLM 콜: `assemble.ts`(3) · `self-score.ts`(1) — 검증: `grep -rn "invokeAi(" src/lib/express/engine/`
- [ ] `ai-fallback.ts` `FALLBACK_MODELS` 존재 — 검증: `grep -n "FALLBACK_MODELS" src/lib/ai-fallback.ts`

## 📖 Read These Files First
1. `../../docs/decisions/022-model-policy.md`(§1·§4 — RPD·사용자 결정 ①) · Tech Spec §8
2. `src/lib/ai/config.ts`(MODEL_ROUTING·FLASH_MODEL) · `src/lib/ai-fallback.ts`(invokeAi·FALLBACK_MODELS·GEMINI_MODEL) · `src/lib/gemini.ts`(GEMINI_MODEL 기본=gemini-3.1-pro-preview)
3. `src/lib/express/engine/{assemble,self-score,index}.ts`(model 전달 지점)

## 🎯 Scope
### CAN touch
- `src/lib/ai/config.ts` (MODEL_ROUTING 확장 + `modelFor()` 리졸버 + EVAL_ALL_FLASH 플래그)
- `src/lib/ai-fallback.ts` (FALLBACK_MODELS만)
- `src/lib/express/engine/{assemble,self-score,index}.ts` (각 invokeAi의 model 인자만 modelFor()로)
- `.env.local` (**GEMINI_MODEL 줄만 제거** — 키·다른 줄 절대 미터치·미출력)
- `scripts/_routing-probe.ts` (검증용 — 실행 후 삭제)
### MUST NOT touch
- `invokeAi`/`invokeGemini` 시그니처 · `gemini.ts` GEMINI_MODEL 기본값(=진짜 Pro, 유지)
- 엔진의 로직/프롬프트(모델 인자 외) · 레거시 3엔진 · 다른 트랙

## 🛠 Tasks

### Task 1 — `ai/config.ts` 라우팅 (Flash-우세)
- `MODEL_ROUTING`: 엔진 task-key → tier. **pro-critical = 단 2개**: `'engine.section.core'`(③ 사업내용 핵심 합성)·`'engine.self-score'`(judge). 그 외 전부 `'flash'`(planOutline·일반 섹션·keyMessages·refine·gather rerank 등).
- `modelFor(key: string): string` — `EVAL_ALL_FLASH==='true'`면 무조건 `FLASH_MODEL`; 아니면 MODEL_ROUTING[key]가 'pro'면 `GEMINI_MODEL`(진짜 Pro) else `FLASH_MODEL`. 미정의 키는 flash 기본.
- `EVAL_ALL_FLASH` = `process.env.EVAL_ALL_FLASH`(A/B arm A용). 주석에 용도 명시.

### Task 2 — 엔진 model 인자 → `modelFor()`
`assemble.ts`/`self-score.ts`의 `invokeAi({... model: GEMINI_MODEL ...})` 를 task별 `model: modelFor('<key>')` 로:
- planOutline → `modelFor('engine.outline')`(flash)
- writeSection: 섹션 '3' 이면 `modelFor('engine.section.core')`(pro), 그 외 `modelFor('engine.section')`(flash)
- synthKeyMessages → `modelFor('engine.keymsg')`(flash)
- coherencePass(있으면) → flash
- self-score judge → `modelFor('engine.self-score')`(pro)
- refineWeakest(index.ts) → 재작성은 writeSection 경유라 위 규칙 따름(약점이 §3면 pro). 
> 모델 인자만 교체. 프롬프트·로직 불변.

### Task 3 — `ai-fallback.ts` 폴백 체인 (RPD-aware)
`FALLBACK_MODELS = ['gemini-2.5-pro', FLASH_MODEL]` 로 (현 `gemini-pro-latest`는 3.1-pro와 같은 RPD 버킷=무용). 즉 폴백 = **3.1 Pro → 2.5 Pro(1K RPD) → 3.5 Flash(10K)**. 폴백 트리거는 기존대로(에러 시; 429 RESOURCE_EXHAUSTED 포함). 주석 갱신.

### Task 4 — `.env.local` 핀 제거
`GEMINI_MODEL=gemini-3-flash-preview` **이 한 줄만 삭제**(또는 주석처리). → GEMINI_MODEL이 코드 기본 `gemini-3.1-pro-preview`(진짜 Pro)로 복원, 라우팅이 flash-vs-pro 제어. **다른 줄(키 등) 절대 건드리지·출력하지 말 것.**

### Task 5 — 런타임 검증 (`scripts/_routing-probe.ts`, 실행 후 삭제)
`modelFor()`를 주요 키로 호출해 표 출력(어느 키가 pro/flash인지) — **pro는 `engine.section.core`·`engine.self-score` 2개만**임을 확인. + `EVAL_ALL_FLASH=true`일 때 전부 flash 됨을 확인. (LLM 실호출 불필요 — modelFor 순수 함수 검증.) 출력 확인 후 삭제.

## 🔒 Tech Constraints
- 라우팅은 데이터(MODEL_ROUTING) — 코드 분기 금지(A4). 모델 인자만 교체, 로직 불변.
- invokeAi 시그니처 불변.

## ✔️ Definition of Done
- [ ] MODEL_ROUTING Flash-우세(pro 2키만) + `modelFor()` + EVAL_ALL_FLASH
- [ ] 엔진 6 콜 지점 modelFor()로 (③·self-score=pro, 나머지 flash)
- [ ] FALLBACK_MODELS = `['gemini-2.5-pro', FLASH_MODEL]`
- [ ] `.env.local` GEMINI_MODEL 줄 제거 (키 미터치)
- [ ] **routing-probe 출력**: pro=2키만 / EVAL_ALL_FLASH=true면 전부 flash (첨부) → 삭제
- [ ] `npm run typecheck` · `lint` · `check:manifest` 통과
- [ ] `git diff --name-only` ⊆ CAN-touch (.env.local·probe 제외)

## 📤 Return Format
```
## ✅ 한 일 (config·엔진 콜별 tier·폴백·env)
## ❌ 못한 일 / 보류
## 🤔 결정한 것 (어느 키를 pro로·refine 처리)
## 🔬 검증 (routing-probe 표 + typecheck/lint/manifest)
## ⚠️ 위험 신호 / 다음 진입점 (EVAL A/B·maxDuration async)
```

## 🚫 Do NOT
- GEMINI_MODEL 기본값 변경(진짜 Pro 유지) · invokeAi 시그니처 · 프롬프트/로직 · 레거시 엔진
- `.env.local`의 GEMINI_MODEL 외 줄 터치·파일 내용 출력 · git commit/push · 추측

## 💡 Hints
- 메인 docs 동시작업 가능 — 코드/.env.local만, `.md` 금지, git write 금지.
- 현 엔진은 model=GEMINI_MODEL(Pro)인데 .env.local 핀 탓에 로컬선 구형 flash였음. modelFor()로 명시 라우팅하면 핀 영향 제거 + Flash-우세 의도대로.
- pro 2키 선정 근거: 스펙상 Pro 우위=롱컨텍스트·추론 → ③ 핵심 합성·judge. EVAL A/B가 이마저 flash로 충분한지 측정 예정(주석 명시).

## 🏁 Final Note
부수 발견(maxDuration async·refine 동적·EVAL A/B 설계)은 구현 말고 "다음 진입점"에 보고만. AI-3 = "Pro가 2키에서만, 폴백 RPD-aware, 핀 제거"까지.
