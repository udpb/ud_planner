# Brief BR-WS-13 — SI-coach-fit: 코치 매칭 topic-fit 가중 (디지털 사업에 일반 창업 코치 상위 문제)

> **자급자족.** 본 파일 + `CLAUDE.md` + [service-improvements-backlog.md](../../docs/architecture/service-improvements-backlog.md). 막히면 STOP·보고.

| 메타 | 값 |
|------|----|
| ID | `BR-WS-13-coach-topic-fit` (백로그 SI-coach-fit, 순서 7) · 2026-06-23 |
| 격리 | ud-ops `feat/sroi-integration` in-place |

## 🎯 Mission
라이브 검수: 전통시장(디지털·AI) 사업에 추천된 상위 코치가 **일반 창업/비즈모델 코치**(강필진·주성민). IT/디지털 expertise 코치(박은실 — "IT/디지털 인프라")가 **있어도 generalist보다 낮게** 랭크. = **topic-fit이 등급(tier)·이력에 밀림.**
원인: `RECOMMENDER_WEIGHTS`(types.ts)의 keyword(topic-fit) 비중이 tier/history 대비 충분치 않음.
**고친다:** 가중치를 **topic-fit(keyword) 쪽으로 재조정**(합 1.0 유지) — 주제 적합 코치가 generalist를 앞서게.

> 진단 근거: keywordScore = (rfp.keywords ∩ coach.expertise) / needles. 디지털 코치는 keyword 점수가 더 높지만, tier(TIER1)+history가 generalist를 띄움. keyword 비중↑·tier/history↓로 교정.

## 📋 위치
- `src/lib/coaches/types.ts` — `RECOMMENDER_WEIGHTS`(현재 keyword 0.40 / task 0.30 / region 0.15 / tier 0.10 / history 0.05, 합 1.0).
- `coach-recommender.ts`(참고만) — `scoreCoach`가 각 축 raw(0~1) × weight. **로직 무변경.**

## 🎯 Scope
### CAN touch
- `src/lib/coaches/types.ts` — `RECOMMENDER_WEIGHTS` 값만 재조정. (합 1.0 유지.)
### MUST NOT touch
- `coach-recommender.ts` 점수 로직 · `expertise-task-map`·`supabase-source`·`required-count` · 다른 타입·임계값(RECOMMENDATION_THRESHOLDS)·prisma·컴포넌트

## 🛠 Tasks
1. **가중치 재조정(합 1.0):** `{ keyword: 0.48, task: 0.30, region: 0.10, tier: 0.07, history: 0.05 }` (keyword↑ 0.40→0.48 / region 0.15→0.10 / tier 0.10→0.07 — topic-fit·과업 적합이 등급·지역보다 우선). **합 정확히 1.0 확인**(0.48+0.30+0.10+0.07+0.05=1.00).
2. 주석의 가중치 설명(`5축 가중치`)도 새 값으로 갱신(coach-recommender.ts 헤더 주석은 문서용이면 동기화 가능 — 단 코드 로직 라인은 무변경. 주석만 손대도 됨).
3. 값/주석만. 로직·임계값·점수 공식 무변경.

## 🧪 Self-Verification
- [ ] `typecheck`·`lint`(신규0)·`check:manifest`·`build` 통과
- [ ] `RECOMMENDER_WEIGHTS` 합 = 1.0 (단위 확인).
- [ ] `git diff` = `types.ts`(+coach-recommender 주석 동기화 시) — **값/주석만**, 점수 로직 무변경.
- [ ] ⚠️ 메인이 프리뷰+Chrome으로 전통시장 사업에서 IT/디지털 코치가 상위로 오는지 사후 검수 → **코드 ✓**만 보증. 백그라운드 dev 금지.

## 📤 Return (5섹션): ✅한일/❌못한일/🤔결정(ADR후보 — 가중치 data 이관)/🔬검증(`코드 ✓`+합1.0+git diff/`시각 미확인`)/⚠️위험

## ⚠️ 주의
- 합 1.0 엄수. 점수 공식·임계값 무변경. 이건 튜닝이라 메인이 프리뷰에서 효과 검증 — 효과 없으면(풀에 topic 코치 부재 등) 별도 보고.
- 가중치 data(설정) 이관은 범위 밖(ADR 후보). 커밋 금지(메인 검수).
