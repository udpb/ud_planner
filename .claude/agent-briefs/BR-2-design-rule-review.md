# Brief BR-2 — DesignRule 검수 UI + 타입/검증 (v1.2 규칙 시드 → 사람 승인)

> **이 브리프는 자급자족입니다.** 서브 에이전트는 본 파일 + `../../CLAUDE.md`
> + `../../AGENTS.md` + `../../docs/glossary.md` 외에 메인 세션 컨텍스트 없이도
> 작업 가능해야 합니다. 막히면 추측하지 말고 STOP 후 메인에 보고하세요.

| 메타 | 값 |
|------|----|
| ID | `BR-2-design-rule-review` |
| Owner | 메인 세션 |
| 작성일 | 2026-06-15 |
| 상태 | 🔲 대기 |
| 의존 브리프 | BR-1 (✅ 완료 — 추출 데이터 존재) |
| 우선순위 | P0 |
| 예상 시간 | 1~1.5일 |
| 격리 | 일반 (master 직접 / `feat/br-2-design-rule` 브랜치) |
| 관련 ADR | **ADR-028 추록 3** (DesignRule 스키마 동결 — 이 브리프의 스펙) |

---

## 🎯 Mission
메인이 v1.2 에서 큐레이션해 발행한 **DesignRule 시드(`data/program-design/design-rules.json`)** 를
(1) **zod 타입으로 검증**하고, (2) **`/admin/design-rules` 검수 UI** 로 사람이 규칙 단위로
**승인/수정/반려**할 수 있게 만든다. 승인 결과는 같은 JSON 파일에 되기록(`status`·`reviewerNote`).
**규칙 내용은 만들지 않는다** — 이미 메인이 작성함. 너의 일은 **타입 안전 + 검수 도구**다.

> ⚠️ 이건 제안서 생성기가 아니다. **프로그램 기획 문법(규칙)을 사람이 검수하는 내부 도구**다.
> 규칙은 전부 `isDefault:true` (강제 아님). 생성기 연결(BR-3)은 별도 브리프 — 여기선 만들지 않는다.

## 📋 Context
브레인은 당선작 147건을 16축으로 추출했지만(BR-1), 그 데이터를 생성에 쓰는 경로가 0%다.
v1.2 (`docs/UD-Brain-CurriculumDesignLogic-v1.2.html`)가 그 데이터를 **설계 로직(제0원칙·D0~D8·운영유형 T1~T5·흐름 문법)** 으로 큐레이션했고,
메인이 그걸 **DesignRule 시드**로 변환했다. 이제 사람이 규칙을 승인해야 다음 단계(BR-3 생성기)가 소비한다.
DesignRule 은 **JSON-first** (ADR-028 Option B — 로컬 DB migration 보류 중이라 Prisma 모델 안 만듦).

## ✅ Prerequisites (STOP 조건)
- [ ] `docs/decisions/028-program-design-grammar.md` 의 **추록 3** 존재 (스키마 동결 스펙)
- [ ] `data/program-design/design-rules.json` 존재 (메인 발행 시드, 규칙 약 23건, 전부 `status:"draft"`)
- [ ] `npm run dev` 기동 가능 (Next 16)
- [ ] 시드 JSON 과 ADR-028 추록 3 스키마가 **불일치**하면 → 고치지 말고 STOP·보고 (메인이 시드 작성자)

## 📖 Read These Files First
1. `../../CLAUDE.md` · `../../AGENTS.md` · `../../docs/glossary.md` (기본)
2. `../../docs/decisions/028-program-design-grammar.md` **추록 3** ⭐ — DesignRule 스키마 동결 (이 브리프의 계약)
3. `../../data/program-design/design-rules.json` ⭐ — 검증·검수 대상 (구조 학습)
4. `../../.claude/skills/ud-design-system/SKILL.md` ⭐ — **새 UI 는 디자인킷 260529 토큰으로 처음부터** (radius 0 · `--accent`/`--ink`/`--paper`/`--muted`/`--line` · NanumHuman+Poppins · 틴트박스 그리드). 폐기 컬러(#06A9D0·#F48053 계열)·`bg-primary`/`rounded-*` 신규 사용 금지.
5. `../../src/app/admin/content-hub/` — 기존 admin 페이지 구조·라우팅·서버컴포넌트 패턴 참고 (모방할 레퍼런스)
6. `../../src/components/ui/` — shadcn 컴포넌트 (직접 수정 금지, 그대로 사용)
7. `../../src/lib/program-design/operating-format.ts` — 기존 zod 컨벤션(축별 `{value,confidence,evidence}` 패턴) 참고

## 🎯 Scope
### CAN touch (이 파일들만)
- `src/lib/program-design/design-rule.ts` (신규 — zod 타입 + 로더/세이버)
- `src/app/admin/design-rules/**` (신규 — 검수 UI 페이지)
- `src/app/api/admin/design-rules/**` (신규 — status 변경 API)
- `data/program-design/design-rules.json` (**`status`·`reviewerNote` 필드만** 되기록. 규칙 내용·구조 변경 금지)
- `scripts/_check-design-rules.ts` (선택 — 시드 검증 스모크)
### MUST NOT touch (절대)
- `prisma/schema.prisma` (DesignRule 은 JSON-first — 모델 추가 금지)
- `src/lib/ai-fallback.ts` · `src/lib/program-design/operating-format.ts`·`extraction-prompt.ts`·`vod-catalog.ts` (BR-1 동결물)
- `src/components/ui/**` (shadcn 직접 수정 금지)
- `data/program-design/extracted/**`·`_aggregate.json` (BR-1 산출물 읽기만)
- 다른 트랙(Express/Deep/Brain 생성) 컴포넌트 · 생성기 연결 로직 (BR-3 영역)

## 🛠 Tasks
1. **`src/lib/program-design/design-rule.ts`** — ADR-028 추록 3 스키마의 zod 타입.
   - `DesignRuleSchema` (단일 규칙) + `DesignRuleSetSchema` (`{version, source, generatedAt, note?, rules: DesignRule[]}`).
   - `ruleType` enum 7종 · `decisionPolicy` enum 3종 · `condition.dimension` enum 7종 · `recommend.kind` enum 6종 · `status` enum 3종. `isDefault` 는 `z.literal(true)`. `recommend.value` 는 `z.unknown()` (단일값/객체/트리 모두 허용).
   - `loadDesignRules(): DesignRuleSet` — 파일 읽어 zod 파싱(실패 시 명확한 에러). `saveRuleStatus(id, status, reviewerNote?)` — 해당 규칙의 `status`/`reviewerNote` **만** 수정해 파일 되기록(나머지 필드·순서·포맷 보존, 2-space indent).
   - ⚠️ 파일 경로는 `process.cwd()` 기준 `data/program-design/design-rules.json` 상수로.
2. **검수 UI `src/app/admin/design-rules/page.tsx`** (서버 컴포넌트에서 로드 → 클라이언트 컴포넌트로 렌더):
   - 규칙을 `ruleType` 별로 그룹핑(A 운영유형 / B 유형프로파일 / C 흐름문법 / D 예산구조 / E 몰입세트 / F 대상기본값 / **G 입력게이트** / Z 메타). 그룹 헤더 + 카운트.
   - 각 규칙 카드: `title` · `condition`(조건) · `recommend`(권장값 — 객체는 보기 좋게 펼침) · `rationale` · `evidence`(source/n/stat) · `confidence`(0~1 막대) · `decisionPolicy` 배지 · `status` 배지.
   - **decisionPolicy 시각 구분**: `auto`=조용한 기본값 / `ask_human`=사람 결정 게이트(강조 — accent 라벨) / `auto_unless_conflict`=조건부. 사람이 "이 규칙이 자동 적용인지, 선택지로 뜨는지"를 한눈에.
   - 액션: **승인(approved)** / **반려(rejected)** / **메모(reviewerNote 수정)** 버튼 → API 호출 → 낙관적 갱신 + `toast.success`.
   - 진행 요약: 전체 N건 중 approved/draft/rejected 카운트 상단 표시.
   - 디자인킷: 틴트박스 그리드(`gap:2px`+셀 배경), radius 0, accent 면적 최소(confidence 막대·ask_human 라벨만). 상태 배지는 SKILL §7 팔레트.
3. **API `src/app/api/admin/design-rules/[id]/route.ts`** (`PATCH`): body `{status?, reviewerNote?}` → `saveRuleStatus` 호출 → 갱신된 규칙 반환. `status` enum 검증. (조회는 page 서버컴포넌트가 직접 load 하면 GET 불필요.)
4. **시드 검증 스모크** (`scripts/_check-design-rules.ts`, 선택이지만 권장): `loadDesignRules()` 가 시드를 무오류 파싱하는지 + 모든 규칙 `isDefault===true` + `evidence.source` 존재 확인. `npx tsx scripts/_check-design-rules.ts` → PASS/FAIL.

## 🧪 Self-Verification (완료 선언 전 필수)
- [ ] `npm run typecheck` 통과
- [ ] `npm run lint` 통과
- [ ] `npm run check:manifest` 통과 (manifest 건드린 게 없어야 정상)
- [ ] 시드 검증 스모크 PASS — 시드 약 23건 전부 zod 통과, 불일치 0
- [ ] `npm run dev` → `/admin/design-rules` 렌더 확인: 그룹 8종 표시, 카드에 근거·신뢰도·decisionPolicy 보임
- [ ] 한 규칙 승인 → 토스트 → `design-rules.json` 의 해당 `status`만 `"approved"` 로 바뀌고 **다른 필드·규칙·들여쓰기 무손상** (git diff 로 확인 — 변경은 status/reviewerNote 라인만)
- [ ] 디자인킷 위반 0: 새 코드에 `bg-primary`/`rounded-*`/폐기 hex 없음 (킷 토큰만)
- [ ] `git diff --name-only` 가 CAN-touch 부분집합

## 📤 Return Format (5섹션 그대로)
**✅ 한 일** / **❌ 못한 일** / **🤔 결정** (ADR 후보만 보고, 직접 작성 금지) / **🔬 검증** (위 체크리스트 실측 결과·`git diff --stat`) / **⚠️ 위험**

## ⚠️ 주의
- **규칙 내용·구조를 바꾸지 마라.** 시드가 ADR-028 추록 3 과 어긋나면 STOP·보고 (메인이 시드 작성자, 너는 검수 도구 구현자).
- DesignRule 은 **DB 가 아니라 JSON** 이다 (migration 보류). API 가 파일을 쓴다 — fs 동시쓰기 충돌 방지를 위해 read-modify-write 를 한 번에(원자적 쓰기 권장: temp write → rename).
- 생성기 연결·D0~D8 파이프라인은 **이 브리프 범위 밖**(BR-3). 여기서 시작하지 마라.
- 새 화면이니 **처음부터 디자인킷 토큰** — 기존 화면의 `bg-primary`/`rounded-*` 잔재를 복붙하지 마라.
