# ADR-022: 모델 정책 — Gemini 3.1 Pro + 3.5 Flash 2-tier (런타임 검증)

- **상태**: **Accepted** (런타임 증거 + 사용자 위임 확인, 2026-06-01)
- **결정일**: 2026-06-01
- **결정자**: udpb@udimpact.ai + AI Architect (메인이 런타임 프로브 실행)
- **Scope**: `src/lib/gemini.ts` · `src/lib/ai-fallback.ts` · `src/lib/ai/config.ts` · eval 하니스 · 환경변수
- **관련**: ADR-021(단일 엔진 — frontier 전제의 선결이었음), ADR-013, Tech Spec §0·§8

---

## 배경 (Context)

종합 점검·교차검증에서 "Gemini 3.1 Pro Primary는 명목뿐, 실제는 flash"라는 의심이 1순위 우려로 제기됐다(eval 스윕 147콜이 전부 `gemini-3-flash-preview`였음). Tech Spec의 품질-우선(frontier) 전제가 여기 의존하므로, 사용자 지시("API 세팅됨, 런타임 확인 진행")로 **실제 모델을 런타임 프로브로 검증**했다.

### 런타임 증거 (2026-06-01, 실 API 키)
| 요청 모델 | 결과 | modelVersion | 비고 |
|---|---|---|---|
| `gemini-3.1-pro-preview` (코드 기본값) | ✅ 성공 6.2s | **gemini-3.1-pro-preview** | thinking 489토큰 — **진짜 Pro frontier** |
| `gemini-3-flash-preview` (eval 스윕값) | ✅ 성공 3.2s | gemini-3-flash-preview | flash |
| `gemini-2.5-pro` | ✅ but **빈 응답** | gemini-2.5-pro | maxOutputTokens 512가 thinking에 소진 |
| `gemini-pro-latest` | ✅ | → gemini-3.1-pro-preview | 최신 Pro 매핑 |
| `gemini-flash-latest` | ✅ | gemini-3.5-flash | — |

### 핵심 정정
1. **production 기본값(`GEMINI_MODEL` 미설정)은 실제로 `gemini-3.1-pro-preview` = 작동하는 Pro.** "flash로 동작 중"은 **eval 스윕 한정**(env override). production Express는 이미 Pro로 생성.
2. **패널 83점은 flash 측정치** — production(Pro) 실품질은 그보다 높을 수 있음. eval이 production을 과소평가해 옴.
3. **`ANTHROPIC_API_KEY` 미설정** → Claude fallback이 실제로는 작동 안 함. Gemini 실패 시 invokeAi가 throw(조용한 flash 강등이 아니라 완전 실패).
4. Gemini 3.x는 **thinking 모델** — 출력 토큰 예산이 thinking에 소모됨(2.5-pro 빈 응답이 증거).

---

## Decision

### 1. 2-tier 라우팅 — Pro + Flash 결합 (사용자 지시 2026-06-01)
런타임 확정(둘 다 작동): **`gemini-3.1-pro-preview`**(Pro, ~3s, thinking) + **`gemini-3.5-flash`**(Flash, ~1.3s ≈2.5배 빠름, thinking). 품질-결정 경로는 Pro, 빠르고 품질에 민감하지 않은 plumbing은 Flash. **품질-우선 유지** — Pro 경로는 다중 패스/샘플(A1·A2).

| 작업 | 모델 | 이유 |
|---|---|---|
| assemble(본문 7섹션)·win-theme·정제 루프·coherence | **Pro** | 제안서 품질을 직접 결정 |
| framing 진단·faithfulness entailment·Rubric 심사(다중) | **Pro** | 판단 품질 직결 |
| 과업 분해(G3)·GraphRAG 전역 합성 | **Pro** | 구조·전략 품질 |
| RFP 파싱·추출(G1)·claim 분리·청크 contextual blurb | **Flash** | 빠름·품질 민감 낮음 |
| 분류·태깅(자동 ingest)·query rewrite/HyDE/decompose | **Flash** | 대량·plumbing |
| S3 대화 즉답(빠른 응답성)·1차 진단 추출 | **Flash** | latency 중요, Pro로 escalate 가능 |

**Cascade(선택):** Flash 1차 → 신뢰도 낮으면 **Pro 승격**(특히 추출·분류 borderline). 라우팅은 `src/lib/ai/config.ts`의 작업→모델 표(가변 데이터, A4)로 — 코드 분기 금지.
모델명은 `gemini-pro-latest`/`gemini-flash-latest`(→각각 3.1-pro-preview / 3.5-flash 매핑)로 alias 가능.

### 2. eval 스윕을 production 모델로 pin
eval 하니스가 `GEMINI_MODEL=gemini-3-flash-preview`로 돌던 것을 **`gemini-3.1-pro-preview`로 고정**. `_summary.json`에 사용 모델·temperature·n샘플 기록. → "eval이 측정하는 것 = production이 서빙하는 것"(Tech Spec A2). 재측정 시 패널 점수 재산정.

### 3. thinking 토큰 예산
생성 호출의 `maxOutputTokens`는 **thinking 소모를 감안해 충분히 크게**(본문 생성 16384+ 유지·검증). 빈 응답 감지 시 토큰 상향 재시도. `usageMetadata.thoughtsTokenCount` 로깅 추가.

### 4. fallback 정책 — RPD-aware (ADR-023 Gemini-only 확정 후 갱신, 2026-06-01)
- ADR-023으로 Claude 제거 → **intra-Gemini 폴백**.
- ⚠️ **RPD 제약 발견(대시보드, Tier 1)**: 3.1 Pro = **RPD 250/일**(낮음), 2.5 Pro = 1K, 3.5 Flash = 10K, 3 Flash = 10K. 1차본 1건당 Pro ~10~15콜 → 하루 ~16~25건이면 3.1 Pro 소진(429).
- **사용자 결정 (2026-06-01)**: Tier 2는 ~30일 뒤(빌링 이력). 그때까진 **3.1 Pro 우선 사용(품질) + 429로 막히면 폴백**. 즉 proactive Flash-우세 라우팅은 **안 함**(Pro 최대 활용), 폴백만 견고히.
- **AI-3 브리프(EX-1 후, LLM 코어 충돌 방지)**: 폴백 체인 `gemini-3.1-pro-preview → gemini-2.5-pro(1K RPD) → gemini-3.5-flash(10K)` 로 수정 (현 `pro-latest`는 3.1-pro와 같은 버킷=무용). **429 RESOURCE_EXHAUSTED 시** 다음 모델로 graceful 강등(Pro 품질 우선 유지→그다음 Flash). (선택) 연속 429 시 일시 circuit-breaker로 Pro 스킵.
- 2-tier(plumbing=Flash)는 유지. Tier 2 도달 시 RPD 여유 ↑ → 폴백 발동 감소.

### 4-A. EVAL A/B 결과 → 하이브리드 유지 (2026-06-01, EVAL-AB)
새 엔진으로 Flash-only(A) vs Flash+Pro 하이브리드(Pro 2키)(B), 패널(고정 Pro judge) N=3:
| RFP | flash | hybrid | Δ |
|---|---|---|---|
| B2B-CSR | 55 | 65 | +10 |
| B2G-청년창업 | 74 | 66 | −8 |
| renewal | 55 | 68 | +13 |
| 평균 | 61 | **66** | **+5** |
렌즈 Δ: logic +12·winningLanguage +8·differentiation +6 (당선 결정 축에서 hybrid 우위) · quant +0. 속도 거의 동일(569 vs 545s), hybrid Pro-call 4/건.
**결정: Flash-only 채택 안 함. Flash-우세 하이브리드(Pro 2키) 유지** — Pro가 win-deciding 렌즈에서 값을 함, 비용·속도 차 미미. ⚠️ 단 n=3·단일샘플(노이즈 큼)·둘 다 <78(당선권 미달) → **모델은 작은 레버, 진짜 품질은 EX-2(faithfulness·win-theme·compliance)**. Pro 0키 하향은 EX-2 후 재측정 시 재검토.

### 5. 모델명은 설정/상수 (가변)
`GEMINI_MODEL` env + `gemini.ts` 상수. 코드 분기 금지(A4).

---

## Consequences

### Positive
- 품질-우선 frontier 전제 **이미 충족**(production=Pro) — ADR-021 엔진은 Pro 위에서 시작.
- eval 신뢰성 회복(production 모델로 측정).
- "Gemini=flash" 오해 종결 — 근거 기록.

### Negative / Trade-offs
- Pro는 flash보다 느림(6s vs 3s)·비쌈 — 품질-우선이라 수용(A1).
- thinking 토큰으로 출력 예산 압박 → 토큰 상향 필요(비용 ↑, 수용).
- fallback 키 미설정 시 Gemini 장애 = 전체 실패(가용성 리스크) → §4(a) 권장.

### Follow-ups
- [ ] eval 하니스 모델 pin + `_summary.json` 메타 기록 (EVAL 브리프)
- [ ] `maxOutputTokens` thinking 감안 검증 + `thoughtsTokenCount` 로깅 (FIX/EX 브리프)
- [ ] **사용자 결정**: `ANTHROPIC_API_KEY` 설정 여부(§4)
- [ ] 빈 응답(thinking 소진) graceful 재시도

## References
- 런타임 프로브: `scripts/_probe-model.ts`(2026-06-01 실행 후 삭제) · 결과는 본 ADR 표
- `src/lib/gemini.ts`(L26 기본값)·`ai-fallback.ts`(fallback 경로) · Tech Spec §8
- 관련 journey: docs/journey/2026-06-01-*

## Teaching Notes
- "명목 설정값"과 "런타임 실제 동작"은 다르다 — **의심되면 프로브로 경험적 확인**(가정 금지).
- eval은 production과 같은 모델로 돌려야 의미 있다(env override가 측정을 오염시켰다).
- thinking 모델은 출력 토큰을 thinking과 나눠 쓴다 — 예산을 크게.
- 폴백은 "코드에 있다"가 아니라 "키가 있다"여야 작동한다(ANTHROPIC_API_KEY 부재 = 폴백 부재).
