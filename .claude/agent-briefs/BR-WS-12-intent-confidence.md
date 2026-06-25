# Brief BR-WS-12 — SI-confidence: 기획의도 초안 confidence 보정 (과도한 "?" 완화)

> **자급자족.** 본 파일 + `CLAUDE.md` + [service-improvements-backlog.md](../../docs/architecture/service-improvements-backlog.md). 막히면 STOP·보고.

| 메타 | 값 |
|------|----|
| ID | `BR-WS-12-intent-confidence` (백로그 SI-confidence, 순서 6) · 2026-06-23 |
| 격리 | ud-ops `feat/sroi-integration` in-place |

## 🎯 Mission
라이브 검수: ②기획의도 AI 초안이 과하게 "?"(low). "AI가 깔아준다"는 가치가 약함. **근거 있는 카드는 ✓(high)로 더 주자.**
- **목표 해석**: RFP 목표/맥락이 읽히면 high (지금은 "충분"이라야 high — 기준 과함).
- **차별점**: 매칭 자산이 있거나 언더독스 일반 강점으로 말할 수 있으면 high.
- **작년 대비·리스크**: 그대로 low(PM이 대화로 — AI가 작년/담당자 의도를 모름은 유지). **단 유용한 잠정 초안은 채워 제공**(빈 "?"가 아니라 "이렇게 가정해봤어요" 수준).
- **메인 전략**: PM 자유 입력 — 그대로(보통 빈).

## 📋 위치
`src/lib/program-design/planning-intent.ts`:
- `draftPlanningIntent` 프롬프트(~257~268줄): goalInterpretation "RFP 근거 충분하면 high" / differentiation "매칭 자산 근거 있으면 high" / yearOverYear·risk = low.
- `coerceCard`(~192줄): goalInterpretation·differentiation fallback 'high', yearOverYear·risk fallback 'low'. (값 있는데 confidence 누락 시 fallback 적용 — 유지.)

## 🎯 Scope
### CAN touch
- `src/lib/program-design/planning-intent.ts` — **draft 프롬프트의 confidence 기준 문구만** 완화(goal/diff). coerceCard fallback 로직은 그대로(이미 high). 필요 시 yearOverYear/risk 잠정초안 품질 지시 한 줄.
### MUST NOT touch
- 매핑(toStrategicNotes 등)·route·refineIntentField·타입·invokeAi 시그·스키마·다른 lib/컴포넌트

## 🛠 Tasks
1. **목표 해석 confidence 완화** — "RFP 에 근거가 충분하면 high" → "RFP 의 목표·맥락이 합리적으로 읽히면 high (대부분 high — 정말 모호할 때만 low)".
2. **차별점 confidence 완화** — "매칭 자산에 근거가 있으면 high" → "매칭 자산이 있거나 언더독스의 일반 강점(코치풀·자산·방법론)으로 말할 수 있으면 high".
3. **작년대비·리스크** — low 유지(AI가 작년/담당자 의도 모름)이되, **잠정 초안 value는 유용하게 채우라**는 지시 유지/강화(빈칸 금지). PM이 대화로 확정.
4. 프롬프트 문구만. JSON 형식·키·coerceCard 로직·매핑 무변경.

## 🧪 Self-Verification
- [ ] `typecheck`·`lint`(신규0)·`check:manifest`·`build` 통과
- [ ] `git diff` = `planning-intent.ts` **프롬프트 문자열만**(coerceCard·매핑·route 무변경 — diff로 증명).
- [ ] ⚠️ 메인이 프리뷰+Chrome으로 초안 시 목표해석·차별점이 ✓(high)로 더 자주 뜨는지 사후 검수 → **코드 ✓**만 보증. 백그라운드 dev 금지.

## 📤 Return (5섹션): ✅한일/❌못한일/🤔결정/🔬검증(`코드 ✓`+git diff/`시각 미확인`)/⚠️위험

## ⚠️ 주의
- 프롬프트 문구만. 작년대비·리스크의 low(PM 확정) 철학은 유지 — 거기까지 high로 밀지 말 것(허위 확신 방지). 커밋 금지(메인 검수).
