# Brief BR-WS-8 — SI-rationale: 회차 "왜"를 PM/제안서 언어로 (엔진 내부용어 제거)

> **자급자족.** 본 파일 + `CLAUDE.md` + `AGENTS.md` + [service-improvements-backlog.md](../../docs/architecture/service-improvements-backlog.md) + [program-workspace-redesign-v1.md](../../docs/architecture/program-workspace-redesign-v1.md)(§10). 막히면 STOP·보고.

| 메타 | 값 |
|------|----|
| ID | `BR-WS-8-rationale-rephrase` (백로그 SI-rationale, 순서 1) · 작성 2026-06-23 |
| 격리 | ud-ops `feat/sroi-integration` in-place |

## 🎯 Mission
라이브 검수에서 본 문제: 회차 "왜(rationale)"에 **엔진 내부 용어가 그대로 노출**됨.
실측 문구: *"흐름 문법에 따라 마인드셋·이론(theory)을 전반부(1/3 지점 이내)에 배치. **T3(장기여정)**의 시작점... **v1.2 §09-B**"* / *"T5 행사 운영형 지침(**v1.2 §09-C**)에 따른 '행사 준비' 단계"*.
이건 PM·제안서용 "왜"가 아니라 엔진 규칙 설명이다. → **rationale 텍스트를 발주처·참여자·사업 맥락의 언어로 재서술.**

> ⚠️ **흐름 문법(§05) 배치 규칙은 회차 순서를 정하는 내부 제약으로 그대로 유지** — 단지 그 **코드·약어를 출력 rationale에 echo하지 않게** 한다. 결정 로직·수치·운영유형 판별·JSON 계약 **무변경**. 이건 **프롬프트 wording 한정** 수정.

## 📋 원인 위치 (정독)
`src/lib/program-design/generate-plan.ts`:
- **회차표(T1~T3) 생성 프롬프트** — `"rationale": "이 회차가 왜 여기에 있는지 (흐름 문법 근거)"` (~189줄). "흐름 문법 근거"라고 지시해서 내부용어가 나옴.
- 프롬프트 본문에 `[흐름 문법 — 배치 규칙 (v1.2 §05)]`, "전반부 1/3", "0.66 이후" 등 — **이 규칙 자체는 유지**(배치 지침). rationale 출력 지침만 분리.
- **T4/T5 단계 생성 프롬프트** (~218~225줄) — shape 설명에 "v1.2 §09-C / §09-B" 포함. AI가 이를 rationale에 echo. → rationale엔 §코드 echo 금지 지시.

## 🎯 Scope
### CAN touch
- `src/lib/program-design/generate-plan.ts` — **rationale 출력 지침 wording만**. 구체:
  1. 회차표 프롬프트의 `rationale` 필드 설명을 PM/제안서 언어로: "이 회차가 **이 사업의 목표·참여자에게 왜 필요한지** 한 문장 (발주처가 읽는 제안서 언어로. **내부 코드·약어 금지**: T1~T5·§·'흐름 문법'·milestone(영문)·'1/3 지점' 등 쓰지 말 것)".
  2. 프롬프트에 짧은 **"rationale 작성 지침"** 블록 추가: 사업·참여자·기대효과 중심, 내부 규칙 인용 금지, 자연스러운 한국어.
  3. T4/T5 단계 프롬프트도 동일 — 단계 rationale에 §코드/지침번호 echo 금지, 사업 맥락 언어로.
### MUST NOT touch
- `plan-types.ts`(계약) · 결정/게이트/운영유형 판별 로직 · 흐름문법 **배치 규칙 자체**(순서 결정) · 수치(회차수·코칭수) · `resolve-rules`·`design-rule` · invokeAi 시그 · 스키마 · 다른 lib·컴포넌트

## 🛠 Tasks
1. 회차표 프롬프트의 `rationale` 필드 설명 교체(위 ①) + "rationale 작성 지침" 블록 추가(②) — 내부 코드 echo 금지, 발주처/참여자/기대효과 언어.
2. T4/T5 단계 프롬프트의 rationale 지침도 동일(③).
3. JSON 형식·키·다른 모든 지침(수치 엄수·hours null 규칙 등)은 **그대로**. (hours는 별도 SI-hours에서 다룸 — 여기선 건드리지 않음.)
4. 변경은 **프롬프트 문자열 한정** — 코드 로직·타입 무변경.

## 🧪 Self-Verification
- [ ] `typecheck`·`lint`(신규0)·`check:manifest`·`build` 통과
- [ ] `git diff` = `generate-plan.ts` **프롬프트 문자열만**(로직 라인 무변경 — diff로 증명). 계약·수치·판별 무변경.
- [ ] 흐름문법 **배치 규칙 블록은 유지**(순서 결정), rationale **출력 지침만** 바뀜.
- [ ] ⚠️ 메인이 Vercel 프리뷰+Chrome으로 실제 rationale 문구를 사후 검수(내부 코드 사라졌는지) → **코드 ✓**만 보증. 백그라운드 dev 금지.

## 📤 Return (5섹션): ✅한일/❌못한일/🤔결정/🔬검증(`코드 ✓`+git diff/`시각 미확인`)/⚠️위험

## ⚠️ 주의
- **프롬프트 wording만.** 엔진 로직·계약·수치·순서 규칙 무변경. 흐름문법은 내부 유지, 출력 echo만 제거.
- 커밋 금지(메인 검수·프리뷰 검수).
