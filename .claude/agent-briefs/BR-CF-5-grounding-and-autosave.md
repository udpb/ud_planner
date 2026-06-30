# Brief BR-CF-5 — 당선패턴 임베딩 그라운딩 + 컨셉 draft autosave (ADR-031 후속)

> **자급자족.** 본 파일 + W1/W2 산출 + `src/lib/express/winning-reference.ts`(재사용). 막히면 STOP·보고.

| 메타 | 값 |
|------|----|
| ID | `BR-CF-5-grounding-and-autosave` · 2026-06-27 |
| 격리 | ud-ops `feat/sroi-integration` in-place |
| 전제 | ADR-031 W1~W4 완료. 두 후속: A=임베딩 그라운딩, B=draft autosave. |

## 🎯 Mission
**A.** 컨셉 합성의 당선패턴 그라운딩을 현 채널필터(`bestEffortWinning`)에서 **임베딩 의미검색**(`retrieveWinningPassages`)으로 교체 — RFP 의미에 더 맞는 당선 근거.
**B.** 컨셉 대화 draft(picks + 조립 draft)를 **확정 전에도 autosave** → 새로고침해도 이어감. 스키마 변경 0.

## 📋 현재 (survey 확정)
- **A**: `src/lib/express/winning-reference.ts` `retrieveWinningPassages(query, {channel?, topK?})` → `{projectName, sectionHint, text, similarity}[]` — **이미 임베딩(generateEmbedding)+cosine+doc당 2개 dedup** 구현. concept route 의 `bestEffortWinning(channel)`(L62~82, 채널필터+최근3)이 교체 대상.
- **B**: `concept/route.ts` PUT(L215~263) read-merge-write(strategicNotes). `ConceptChat.tsx` picks(부모 lift)·확정 시만 PUT. `load-workspace.ts` `guardConcept`(L108~142)+`savedConcept`(L346). `strategic-notes.ts` `StrategicNotes`(`concept?` 있음). `ProgramWorkspace` concept state.
- `ConceptShape`·`ConceptPick` = `concept-synth.ts` export.

## 🎯 Scope
### CAN touch
- `src/app/api/projects/[id]/concept/route.ts` (A: 그라운딩 fetch 교체 · B: PUT 에 draft 저장 + GET/응답에 draft 로드 불필요 — load-workspace 가 함)
- `src/lib/ai/strategic-notes.ts` (B: `conceptDraft?: { picks: ConceptPick[]; concept?: ConceptShape }` 추가)
- `src/components/projects/workspace/ConceptChat.tsx` (B: 마운트 시 savedConceptDraft 하이드레이트 + picks 변경 debounce autosave)
- `src/components/projects/workspace/ProgramWorkspace.tsx` (B: savedConceptDraft 스레딩)
- `src/lib/projects/load-workspace.ts` (B: `savedConceptDraft` 추출·반환)
- `src/app/(dashboard)/projects/[id]/page.tsx` (B: savedConceptDraft 스레딩)
### MUST NOT touch
- `winning-reference.ts`·`embedding.ts`(재사용·호출만) · `concept-synth.ts`(엔진 W1) · ConceptCanvas·gate(W3)·W4 파일 · prisma · `invokeAi` 시그 · `components/ui/**`

## 🛠 Tasks
### A. 임베딩 그라운딩
1. concept route 의 `bestEffortWinning(channel)` → **`retrieveWinningPassages`** 사용으로 교체. query = RFP 요약(project.rfpParsed 에서 사업명+목표+대상 등 조립 문자열). `{channel, topK:3~4}`. 결과 → grounding `{kind:'winning', label: \`${projectName}${sectionHint?' · '+sectionHint:''}\`, ref: projectName}`. **graceful**(임베딩/조회 실패 → []). 채널 없으면 channel 생략(전체 검색).
2. 기존 자산(matchAssetsToRfp)·RFP 그라운딩은 유지. winning 만 의미검색으로.

### B. draft autosave
3. `strategic-notes.ts` — `StrategicNotes.conceptDraft?: { picks: ConceptPick[]; concept?: ConceptShape; updatedAt?: string }`(타입만).
4. concept route PUT — body `action: 'confirm'|'saveDraft'`(기본 confirm 호환). `saveDraft` → `merged.conceptDraft = {picks, concept}`. `confirm` → `merged.concept = concept` **+ `conceptDraft` 제거**(확정 시 draft 청소). read-merge-write 그대로. 가드 유지.
5. `ConceptChat` — props `savedConceptDraft?` 받아 마운트 시 picks/대화 복원(있으면 첫 step 시드 대신 resume; 카드/맺힘 재구성). picks 변경 시 **debounce(~1.5s) `PUT {action:'saveDraft', picks, concept?}`**(`.catch` 무음). 확정(기존 PUT)은 그대로 confirm.
6. `load-workspace` — `savedConceptDraft: {picks, concept?}|null` 추출(읽기 가드: picks 배열만 통과, 불량→null)·반환·타입. `page`·`ProgramWorkspace` 스레딩.

## 🧪 Self-Verification
- [ ] `typecheck`·`lint`(신규0)·`check:manifest`·`build` 통과 · `git diff` ⊆ CAN-touch
- [ ] 스키마 변경 0. winning-reference/embedding/concept-synth 무변경(호출만).
- [ ] A: route 가 retrieveWinningPassages 사용(채널·topK), graceful. B: saveDraft/confirm 분기, draft 하이드레이트+debounce autosave, 확정 시 draft 청소.
- [ ] ⚠️ 메인이 프리뷰에서 (a) 컨셉 그라운딩에 의미검색 당선근거 (b) 대화 중 새로고침→draft 복원 사후 검수 → **코드 ✓**. 백그라운드 dev·커밋 금지.

## 📤 Return (5섹션): ✅한일/❌못한일/🤔결정/🔬검증(`코드 ✓`+git diff/`시각 미확인`)/⚠️위험

## ⚠️ 주의
- 재사용 우선(retrieveWinningPassages·guardConcept 패턴). 스키마 0. 엔진/W1·W3·W4 무변경. 커밋은 메인.
