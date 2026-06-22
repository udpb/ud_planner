# Brief BR-WS-3 — ②기획의도 단계 (하이브리드: AI 초안 + "?" 핀 + 대화)

> **자급자족.** 본 파일 + `CLAUDE.md` + `AGENTS.md` + `docs/glossary.md` + `ud-design-system/SKILL.md` + `docs/architecture/program-workspace-redesign-v1.md`(§5 ②, §8 불변제약). 막히면 STOP·보고.

| 메타 | 값 |
|------|----|
| ID | `BR-WS-3-planning-intent` |
| Owner | 메인 세션 (위임) |
| 작성일 | 2026-06-22 |
| 상태 | 🔲 대기 |
| 관련 | 재설계 v1 §5 ②기획의도 · ADR-029 · ADR-013(외부LLM 최소화 정신) |
| 격리 | ud-ops `feat/sroi-integration` in-place |

## 🎯 Mission
정본 워크스페이스에 **②기획의도** 단계를 신설한다. RFP→바로 커리큘럼으로 가서 "맥락없이 딱딱하게" 떨어지던 문제(재설계 §2 진단1)의 해결책 = **맥락의 못**. 방식은 **하이브리드**:
1. AI가 RFP핵심 + 작년 유사사업 + 자산에서 **의도 초안 카드 4종**(목표해석·작년대비·차별점·리스크)을 깐다 — 각 카드에 **confidence**.
2. confidence 낮은(또는 비어있는) 카드에 **"?" 핀** → PM이 **대화**로 채운다.
3. 확정된 의도를 `Project.strategicNotes`(기존 필드)에 저장 → 커리큘럼·제안서 생성이 이미 이 필드를 읽으므로(`formatStrategicNotes`) **지식이 실제로 ③으로 내려간다**.

> 원칙(재설계 §3·§8): AI는 **초안만**, 결정·변형은 PM. 강제값 0(전부 default). 외부 LLM 호출 없음(내부 invokeAi만). SROI 무관.

## 📋 Context — 저장처·재료 (전부 존재, 스키마 변경 금지)
- **저장처 = `Project.strategicNotes Json?`** — 이미 존재. 타입 `StrategicNotes`(`src/lib/ai/strategic-notes.ts`). **이 인터페이스를 import해서 그대로 쓴다(수정 금지).** 4카드 매핑:
  | 화면 카드 | StrategicNotes 필드 |
  |---|---|
  | 목표 해석 (RFP 목표 재해석) | `clientHiddenWants` |
  | 작년 대비 무엇이 달라야 | `pastSimilarProjects` |
  | 차별점 (우리 우위) | `competitorWeakness` |
  | 리스크 (담당자 우려) | `riskFactors: string[]` (+ 핵심 1개 `mustNotFail`) |
  | (선택) 메인 솔루션·전략 | `winStrategy` |
- **재료 입력**: `Project.rfpParsed`(RfpParsed) · `Project.programProfile` · 작년 유사사업 = `program-profile.profileSimilarity` 활용 가능(있으면) · 매칭 자산 = `asset-registry.matchAssetsToRfp`(이미 load-workspace가 가짐).
- **AI 진입점**: `src/lib/ai-fallback.ts` `invokeAi` **단일**(eslint 강제). 초안=Pro 티어, 대화 즉답=Flash 티어(라우팅은 `ai/config.ts`). JSON은 `safeParseJson`(`ai/parser.ts`).
- **마운트 지점**: `ProgramWorkspace`의 `'design'` stage content. 현재 `<ProgramDesignFlow/>`만 렌더 → **그 위에 `<PlanningIntent/>`를 얹는다**(additive). 풀 6섹션 분리는 후속 BR-WS-5.

## ✅ Prerequisites
- [ ] `Project.strategicNotes` 필드·`StrategicNotes` 타입 존재 확인
- [ ] 재설계 §5 ②·§8 정독 · `strategic-notes.ts`·`ai-fallback.ts`·`ProgramWorkspace.tsx`·`load-workspace.ts` 정독

## 📖 Read First
1. `CLAUDE.md`·`AGENTS.md`·`ud-design-system/SKILL.md`·`docs/architecture/program-workspace-redesign-v1.md`
2. `src/lib/ai/strategic-notes.ts` (저장 타입·formatStrategicNotes — 수정 금지, import)
3. `src/lib/ai-fallback.ts` (invokeAi 시그니처) · `src/lib/ai/parser.ts`(safeParseJson) · `src/lib/ai/config.ts`(티어 라우팅)
4. `src/components/projects/workspace/ProgramWorkspace.tsx` + `src/lib/projects/load-workspace.ts` (마운트·서버로드)
5. `src/app/api/projects/[id]/recommend-coaches/route.ts` (route 패턴 참고)

## 🎯 Scope
### CAN touch
- `src/components/projects/workspace/PlanningIntent.tsx` (신규 — 카드 4종 + "?" 핀 + 대화 + 저장)
- `src/lib/program-design/planning-intent.ts` (신규 — `PlanningIntentDraft` 타입, `draftPlanningIntent()`/`refineIntentField()` invokeAi 호출, StrategicNotes 매핑 헬퍼)
- `src/app/api/projects/[id]/planning-intent/route.ts` (신규 — `POST`=초안 생성, `PUT`=확정 저장, `POST .../chat` 대신 같은 route에서 action 분기 OK)
- `src/components/projects/workspace/ProgramWorkspace.tsx` (design stage content에 `<PlanningIntent/>` 얹기 + props 통과)
- `src/lib/projects/load-workspace.ts` (`strategicNotes` 읽어 WorkspaceData에 추가)
- `src/app/(dashboard)/projects/[id]/page.tsx` (intent props 전달)
### MUST NOT touch
- `prisma/schema.prisma` (저장은 기존 `strategicNotes`만 — 새 필드 0)
- `src/lib/ai/strategic-notes.ts` (import만, 수정 0)
- `src/lib/ai-fallback.ts` invokeAi 시그니처
- `ProgramDesignFlow`·`ForecastClient` 내부, 다른 라우트(express·v2·program-design·impact-forecast·brain)
- `components/ui/**`·manifest

## 🛠 Tasks (순서)
1. **`planning-intent.ts`** — `PlanningIntentDraft`(각 필드 + `confidence: 'high'|'low'`), `draftPlanningIntent(input)`: invokeAi(Pro)로 RFP·프로파일·자산 → 4카드 초안 + 카드별 confidence(AI가 모르는 작년/담당자 의도 = low). `refineIntentField({field, pmMessage, currentDraft})`: invokeAi(Flash)로 PM 답변을 해당 필드 값으로 정제. `toStrategicNotes(draft)`/`fromStrategicNotes(notes)` 매핑(위 표).
2. **route** — `POST`(생성/재생성: draftPlanningIntent) · `PUT`(toStrategicNotes → `prisma.project.update({strategicNotes})`) · chat 정제(refineIntentField). NextAuth 인증 가드(recommend-coaches 패턴).
3. **`PlanningIntent.tsx`** (client) — 4 카드: confidence=high면 ✓확정 톤, low면 **"?" 핀 + 대화 입력**. 카드별 인라인 편집(PM이 직접 고쳐도 됨 — §3 원칙2). 하단 "기획의도 확정→커리큘럼 반영" → PUT 저장 + toast. 저장 후 "③ 각 회차의 '왜'로 내려갑니다" 안내. **목업 = 재설계 §5 ② ASCII + 대화의 화면 ②** 톤.
4. **마운트** — `ProgramWorkspace` design content = `<><PlanningIntent .../><ProgramDesignFlow .../></>`. `load-workspace`가 `strategicNotes`→초기 draft 시드, 없으면 컴포넌트가 POST로 초안 생성(자동 1회) 또는 "초안 생성" 버튼.
5. **디자인킷**: accent #F05519 1개·radius 0·NanumHuman/Poppins·틴트/보더 박스. 점수·게이트 없음.

## 🧪 Self-Verification
- [ ] `npm run typecheck`·`npm run lint`(신규0)·`npm run check:manifest`·`npm run build` 통과
- [ ] `git diff --name-only` ⊆ CAN touch. `prisma/schema.prisma` 무변경. `strategic-notes.ts` 무변경(import만).
- [ ] invokeAi 외 직접 AI SDK 호출 0 (eslint). 외부 LLM 호출 0.
- [ ] 저장 경로 = `Project.strategicNotes`만. PUT 후 값이 `formatStrategicNotes`로 흘러갈 형태인지(필드명 일치) 확인.
- [ ] ⚠️ 로컬 DB drift로 인증/렌더 막히면 **컴파일·타입·구조까지** 보증하고 정직 보고. 백그라운드 dev 금지.

## 📤 Return (5섹션, 한국어): ✅한일 / ❌못한일 / 🤔결정(ADR후보) / 🔬검증(빌드 실측+git diff --stat) / ⚠️위험

## ⚠️ 주의
- **스키마 변경 절대 금지** — 기존 `strategicNotes`로만. 새 필드 필요하다고 판단되면 STOP·보고(DATA 브리프 별도).
- AI는 초안만, 강제 0. confidence는 UI 상태(저장은 값만).
- 커밋 금지(메인 검수). 다른 트랙·라우트 무변경.
