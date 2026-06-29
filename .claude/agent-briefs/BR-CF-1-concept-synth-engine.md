# Brief BR-CF-1 — 컨셉 합성·대화 엔진 + 영속 (ADR-031 Wave 1, UI 없음)

> **자급자족.** 본 파일 + `docs/decisions/031-concept-first-program-design.md` + `src/app/api/projects/[id]/planning-intent/route.ts`(영속 패턴 미러). 막히면 STOP·보고.

| 메타 | 값 |
|------|----|
| ID | `BR-CF-1-concept-synth-engine` · 2026-06-27 |
| 격리 | ud-ops `feat/sroi-integration` in-place |
| 근거 | **ADR-031(Accepted)** — 컨셉-퍼스트. 본 웨이브=엔진+데이터+영속(서버). UI(좌측 대화·맺힘 캔버스)는 Wave 2 별건. |

## 🎯 Mission
좌측 대화로 **컨셉을 단계별 선택하며 도출**하는 백엔드를 만든다: RFP + strategicNotes(기획의도) + 자산(+best-effort 당선패턴)을 그라운딩으로, **단계별 질문+선택 카드**를 내고, 누적 선택을 **컨셉으로 조립**(win-theme+핵심메시지3+차별점+근거+좁혀온 경로)해 `strategicNotes.concept`에 저장한다. **스키마 변경 0.**

## 📋 현재 (정독 — survey 확정)
- `src/lib/ai/strategic-notes.ts` — `StrategicNotes` 타입(clientHiddenWants·competitorWeakness·riskFactors[]·winStrategy·… ). **여기에 optional `concept?` 추가.**
- `src/app/api/projects/[id]/planning-intent/route.ts` — **영속 미러 대상**: PUT이 `requireProjectAccess` → strategicNotes read → **merge(기존 보존)** → `prisma.project.update`. POST action('draft'/'refine'/'suggest') 분기 + invokeAi(Flash) + safeParseJson.
- `src/lib/asset-registry.ts` `matchAssetsToRfp({rfp, profile?})` → `AssetMatch[]`(narrativeSnippet 등). **자산 그라운딩 재사용.**
- 당선패턴: `WinningProposalDoc`/`WinningProposalChunk`(embedding) 존재하나 **match 함수 미구현** → Wave 1은 best-effort(채널 일치 doc 일부 인용 or 생략, graceful).
- `src/lib/ai-fallback.ts` `invokeAi` · `src/lib/ai/config.ts`(`FLASH_MODEL`·`modelFor('engine.wintheme')`=Pro·`AI_TOKENS`) · `src/lib/ai/parser.ts` `safeParseJson`.
- `prisma/schema.prisma` `Project.strategicNotes Json?`(재사용). **수정 금지.**

## 🎯 Scope
### CAN touch
- **신규** `src/lib/program-design/concept-synth.ts` (타입 + `conceptStep()` + `assembleConcept()` — invokeAi 사용, 순수 외 부수효과 없음)
- **신규** `src/app/api/projects/[id]/concept/route.ts` (POST step/assemble + PUT save — planning-intent 미러)
- `src/lib/ai/strategic-notes.ts` (`StrategicNotes`에 optional `concept?: ConceptShape` 추가만)
### MUST NOT touch
- `prisma/schema.prisma`(스키마/마이그레이션 금지 — strategicNotes Json 재사용) · `planning-intent` route(미러만) · assistant route(W2 무관) · resolve-rules/operating-type 엔진 · `invokeAi` 시그 · `components/**`(W2) · asset-registry(호출만)

## 🧩 계약 (동결)
```ts
// concept-synth.ts
export interface ConceptShape {
  winTheme: string                 // 한 줄 컨셉
  keyMessages: string[]            // 정확히 3
  differentiation: string          // 차별점
  grounding: { kind: 'rfp'|'winning'|'asset'; label: string; ref?: string }[]
  derivationPath: string[]         // 좁혀온 경로(선택 라벨들, 순서대로)
  chosenAngle?: string
}
export interface ConceptCard { label: string; sub?: string; value: string }  // value=이 선택이 컨셉에 넣는 내용
export interface ConceptPick { stepKey: string; label: string; value: string }
export interface ConceptStepResult { stepKey: string; question: string; cards: ConceptCard[]; done: boolean }
```
- **단계 시퀀스(고정 골격, 카드 내용은 AI 생성)**: `angle`(날 세울 각도) → `differentiation`(차별점) → `message`(발주처 우려에 답할 한 줄) → (done). picks.length로 다음 stepKey 결정.
- `conceptStep(ctx, picks)` = Flash. 다음 질문+카드 2~3개(그라운딩 반영, 강제 X). 마지막 단계 후 `done:true`.
- `assembleConcept(ctx, picks)` = **Pro**(`modelFor('engine.wintheme')`). picks+그라운딩 → `ConceptShape`(메시지 정확히 3, 근거 채움, derivationPath=picks 라벨). 점수/합격/SROI 단정 금지.
- 모두 `safeParseJson` + 검증(빈/형식불량 graceful — 던지지 않음).

## 🧩 라우트 계약
```
POST /api/projects/[id]/concept   (requireProjectAccess)
  { action:'step', picks: ConceptPick[], message?: string }     → ConceptStepResult
  { action:'assemble', picks: ConceptPick[], message?: string } → { concept: ConceptShape }
PUT  /api/projects/[id]/concept   { concept: ConceptShape }     → strategicNotes.concept merge 저장 → { ok:true }
```
- ctx 로드(서버): project.rfpParsed + strategicNotes + `matchAssetsToRfp`(graceful catch []) + best-effort 당선패턴(채널 일치 일부 or 생략). message 있으면 그 힌트로 카드 편향.
- PUT 저장: planning-intent PUT 그대로 미러 — strategicNotes read → `{...existing, concept}` → update. 읽기 가드(strategicNotes 비배열·불량이면 {}).

## 🛠 Tasks
1. **concept-synth.ts** — 위 타입 + `conceptStep`(Flash, 단계골격+AI 카드) + `assembleConcept`(Pro). invokeAi 단일 진입. 그라운딩은 ctx로 주입받음(엔진은 fetch 안 함 — route가 조립).
2. **concept route** — POST(step/assemble: ctx 로드→엔진 호출) + PUT(save merge). planning-intent 인증·에러·merge 패턴 미러. Next 라우트 규약은 node_modules/next/dist/docs/ 확인.
3. **strategic-notes.ts** — `StrategicNotes`에 `concept?: ConceptShape` 추가(타입만, 기존 키 무변경). concept-synth에서 타입 import(순환 주의 — 필요시 타입을 strategic-notes나 concept-synth 한쪽에 두고 재export).
4. 점수/합격/SROI 단정 금지·강제 변경 금지(선택/입력만 반영) 프롬프트에 명시. 정량(당선패턴·자산 근거) 우대.

## 🧪 Self-Verification
- [ ] `typecheck`·`lint`(신규0)·`check:manifest`·`build` 통과 · `git diff` ⊆ 3파일(+신규 2)
- [ ] **스키마 변경 0**(`git diff prisma/schema.prisma` 빈 출력). strategicNotes read/update만.
- [ ] POST step → 단계별 question+cards(그라운딩 반영). assemble → ConceptShape(메시지 3·근거·경로). 검증 graceful(불량→안전값, throw X).
- [ ] PUT → strategicNotes.concept 저장, 기존 키 보존(merge).
- [ ] ⚠️ 메인이 프리뷰에서 API 직접 호출로 step/assemble/save 사후 검수 → **코드 ✓**. 백그라운드 dev·커밋 금지. (UI 없음 — W2.)

## 📤 Return (5섹션): ✅한일/❌못한일/🤔결정/🔬검증(`코드 ✓`+git diff/`시각 미확인`)/⚠️위험
- 🤔 당선패턴 best-effort 구현 방식(임베딩 검색 미구현)·단계 골격 수치는 보고. ADR-031 범위 밖 결정은 후보로만.

## ⚠️ 주의
- **스키마 변경 절대 금지**(strategicNotes Json 재사용). 엔진(operating-type)·assistant·planning-intent 무변경(미러·호출만). UI는 W2. 커밋은 메인.
