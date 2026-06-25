# Brief BR-WS-11 — SI-hours: 회차 시간(h)·총 교육시간 채우기 (null 회피)

> **자급자족.** 본 파일 + `CLAUDE.md` + `ud-design-system/SKILL.md` + [service-improvements-backlog.md](../../docs/architecture/service-improvements-backlog.md). 막히면 STOP·보고.

| 메타 | 값 |
|------|----|
| ID | `BR-WS-11-session-hours` (백로그 SI-hours, 순서 5) · 2026-06-23 |
| 격리 | ud-ops `feat/sroi-integration` in-place |

## 🎯 Mission
라이브 검수: T3 회차표 8회차 **시간(h) 전부 `—`(null)**. rationale도 "시간은 null로 추정". 기획안으로 쓰려면 회차별 시간·총 교육시간이 필요한데 비어 있음.
원인: `generate-plan.ts` 프롬프트가 *"확정 결정에 없는 수치는 hours 를 null 로 두세요"*(176줄) → 시간 근거(hoursPerSession)가 decided에 없으면 전부 null.

**고친다:** ① 운영유형 **표준 회당 시간**(디자인룰 B-프로파일 실측: T1 정규강좌≈3h · T2 몰입캠프 종일≈6h · T3 장기여정≈3h)을 프롬프트에 주입해 **각 회차 hours를 표준으로 채우게**(형식에 맞게 조정, RFP 확정 아니면 '표준' 가정). ② `structure-view`에 **총 교육시간 합계** 한 줄.

## 📋 현재
- `src/lib/program-design/generate-plan.ts`:
  - `serializeConstraints`(126줄) — decided 직렬화. hoursPerSession 미포함.
  - 회차표 프롬프트(161줄~): 176줄 "hours 를 null 로", 191줄 `"hours": 3 또는 null`.
- `…/program-design/_components/structure-view.tsx` — `SessionTimeline`이 회차별 hours 인라인 표시(`시간(h)`). 총합 표시 없음.
- 디자인룰 B-프로파일(참고, design-rules.json) hoursPerSession: T1 3.2 / T2 8 / T3 3. (값 출처 — 코드 상수로 미러, 수정 아님.)

## 🎯 Scope
### CAN touch
- `src/lib/program-design/generate-plan.ts` — 회차표 프롬프트에 운영유형 표준 회당 시간 주입 + "hours를 표준으로 채워라"로 지시 교체. (T4/T5 단계엔 시간 개념 없음 — 무관.)
- `…/program-design/_components/structure-view.tsx` — `SessionTimeline`에 **총 교육시간 합계**(Σ hours, null 회차 제외) 요약 한 줄.
### MUST NOT touch
- `plan-types.ts`(계약: `hours: number|null` 유지) · `resolve-rules.ts` · `design-rules.json` · 운영유형 판별 · prisma · invokeAi · 다른 lib/컴포넌트

## 🛠 Tasks
1. **표준 회당 시간 맵(generate-plan)** — 운영유형→표준 hours 상수(`{ T1: 3, T2: 6, T3: 3 }`; 주석에 "design-rules B-프로파일 실측 기반"). 회차표 프롬프트 생성 시 해당 값 주입.
2. **프롬프트 지시 교체** — 176줄 "hours를 null로" → "**hours는 운영유형 표준 회당 시간(${std}h)을 기본으로 채우되, 형식(온라인/합숙/반일)에 맞게 조정**. RFP에 확정 시간이 있으면 그것 우선. 정말 불명확한 회차만 null." 191줄 예시도 `"hours": 3` 톤으로(null 강제 제거). **rationale엔 시간 가정을 장황히 쓰지 말 것(SI-rationale 정합 — PM 언어 유지).**
3. **총 교육시간(structure-view)** — `SessionTimeline` 상단/하단에 "총 N회차 · 약 Mh" (Σ hours, null 제외; 전부 null이면 "시간 미정"). 디자인킷 톤(작은 muted).
4. JSON 키·구조·수치(회차수·코칭수) 무변경. hours 계약(number|null) 유지 — 값을 채울 뿐.

## 🧪 Self-Verification
- [ ] `typecheck`·`lint`(신규0)·`check:manifest`·`build` 통과
- [ ] `git diff` = generate-plan(프롬프트+상수) + structure-view(합계 UI) 2파일. 계약·수치·판별 무변경.
- [ ] 총 교육시간 합계가 Σ hours(null 제외)로 정확(코드 경로).
- [ ] ⚠️ 메인이 Vercel 프리뷰+Chrome으로 회차 hours가 채워지고 총합이 뜨는지 사후 검수 → **코드 ✓**만 보증. 백그라운드 dev 금지.

## 📤 Return (5섹션): ✅한일/❌못한일/🤔결정(ADR후보 — 표준시간 data 이관)/🔬검증(`코드 ✓`+git diff/`시각 미확인`)/⚠️위험

## ⚠️ 주의
- hours 계약(number|null) 유지 — 채우기만. 회차수·코칭수 등 핵심 수치·판별 무변경.
- 표준값은 "가정"임을 과하지 않게(rationale 오염 금지). 커밋 금지(메인 검수).
