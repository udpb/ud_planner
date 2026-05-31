# B4 Brief: Step 1 UI 재설계 + PATCH 저장

## 🎯 Mission (1 sentence)
`step-rfp.tsx` 를 3컬럼 레이아웃(파싱 결과 / 기획 방향 / PM 가이드) 으로 재작업하여, Wave 1 에서 만든 세 API(B1 planning-direction · B2 similar · B3 eval-strategy)를 소비하고, PM 확정 시 B0 필드에 `PATCH /api/projects/[id]/rfp` 로 저장한다.

## 📋 Context

**왜 필요한가.**
- Step 1 이 파이프라인의 척추. 여기서 나온 제안배경·컨셉·핵심 포인트가 이후 Step 2~6 모두의 AI 프롬프트 컨텍스트.
- 현재 `step-rfp.tsx` 는 파싱 결과만 표시. 기획 방향 영역이 없음.

**Wave 1 의존:**
- B0: Project 필드 `proposalBackground`, `proposalConcept`, `keyPlanningPoints`, `evalStrategy` 확보됨
- B1: POST /api/ai/planning-direction (stateless) — 3개 컨셉 후보 + 기획 포인트 + 제안배경 반환
- B2: GET /api/projects/[id]/similar — 유사 프로젝트 top N
- B3: src/lib/eval-strategy.ts — 클라이언트/서버 양쪽에서 import 가능

**기존 저장값 복원:** PM 이 과거에 이미 확정한 기획방향이 있으면 `page.tsx` 가 `project` 레코드에서 `proposalBackground`, `proposalConcept`, `keyPlanningPoints`, `updatedAt` 을 추려 `initialRfpSlice` prop 으로 전달. B4 는 마운트 시 이 값을 편집 상태 초기값으로 주입 → PM 이 재방문해도 작업 연속.

**page.tsx 수정 주의:** page.tsx 도 살짝 건드려야 함 — `<StepRfp>` 호출부에 `initialRfpSlice` prop 추가. 단, **스텝 순서·렌더링 블록은 A1 결과 유지**. 해당 JSX 위치에 프롭 한 개만 추가.

**3컬럼 레이아웃:**
```
┌─────────────────────────┬──────────────────────────────────┬──────────────────────────┐
│ [좌] 파싱 결과          │ [중] 기획 방향                    │ [우] PM 가이드 (placeholder) │
│                         │                                   │                              │
│ RFP 업로드·파싱 UI       │ 제안배경 (편집 가능)               │ "평가위원 관점" 예고 (D3 예정) │
│ (기존 유지)              │ ─────                             │ "유사 프로젝트" 요약          │
│ 파싱 결과 필드들         │ 컨셉 후보 3개 카드 (선택·편집)      │ "평가 전략" top 3 가이드      │
│ (이미 구현됨)            │ ─────                             │ ─────                        │
│                         │ 핵심 기획 포인트 3개 (편집)        │ Phase D3 에서 본격 구현      │
│                         │ ─────                             │                              │
│                         │ [기획 방향 확정] 버튼              │                              │
└─────────────────────────┴──────────────────────────────────┴──────────────────────────┘
```

**PM 플로우:**
1. RFP 파싱 완료 → 좌측 채워짐
2. 중앙 상단 `기획 방향 생성` 버튼 활성화
3. 클릭 → B1 호출, 로딩 스피너 → 결과 표시
4. PM 이 컨셉 3개 중 1개 선택, 편집 가능 (title/oneLiner 인라인 편집)
5. 핵심 포인트 3개도 편집 가능
6. 제안배경도 textarea 편집 가능
7. `기획 방향 확정` 클릭 → PATCH 저장
8. 저장 성공 시 toast + 우측 가이드 패널 갱신

## ✅ Prerequisites (Wave 1 완료 필수)
1. Wave 1 (B0 + B1 + B2 + B3) 전부 완료 → typecheck 통과 상태
2. Prisma Client 에 새 필드 4개 노출되어 있음 (`prisma generate` 완료)
3. `POST /api/ai/planning-direction` 동작
4. `GET /api/projects/[id]/similar` 동작
5. `src/lib/eval-strategy.ts` export 완료

실패 시 STOP.

## 📖 Read These Files First

1. `CLAUDE.md`
2. **`.claude/skills/ud-design-system/SKILL.md`** — 컬러·레이아웃·스니펫 (3컬럼 구조 설계 시 기준)
3. **`.claude/skills/ud-brand-voice/SKILL.md`** — UI 문구·섹션 레이블에 반영
4. **`docs/architecture/data-contract.md` §1.2 RfpSlice** — 저장할 필드 타입
5. `src/app/(dashboard)/projects/[id]/step-rfp.tsx` 현재 구현 전체 — 파싱 UI 는 보존
6. `src/app/(dashboard)/projects/[id]/rfp-parser.tsx` — 파싱 컴포넌트 (유지)
7. `src/lib/pipeline-context.ts` — RfpSlice, EvalStrategy, SimilarProject 타입
8. `src/lib/eval-strategy.ts` — analyzeEvalStrategy 사용법
9. `src/lib/planning-direction.ts` (B1 산출물) — PlanningDirectionResponse 타입
10. `src/components/ui/` — Card, Button, Input, Textarea, Badge, Separator, ... 사용 가능 목록
11. `src/components/projects/data-flow-banner.tsx` — 상단 배너 재활용 가능

## 🎯 Scope

### ✅ You CAN touch
- `src/app/(dashboard)/projects/[id]/step-rfp.tsx` — 대폭 재작업
- `src/app/(dashboard)/projects/[id]/_step-rfp/` (신규 폴더, 옵션) — 하위 컴포넌트 분리 시
- `src/app/api/projects/[id]/rfp/route.ts` (신규) — PATCH 저장 엔드포인트
- `src/app/(dashboard)/projects/[id]/step-rfp.manifest.ts` — `api` 필드 업데이트

### ❌ You MUST NOT touch
- `src/app/(dashboard)/projects/[id]/page.tsx` — **스텝 순서·기존 블록 유지** (A1). 단 `<StepRfp>` 호출부에 `initialRfpSlice` prop 추가는 허용 (한 줄 수정)
- `src/app/(dashboard)/projects/[id]/rfp-parser.tsx` — 기존 파싱 UI 내부 로직 수정 금지
- `prisma/schema.prisma` — B0 결과 유지
- `src/lib/pipeline-context.ts` / `ud-brand.ts` / `claude.ts` 수정 금지
- B1/B2/B3 의 산출물(`planning-direction.ts`, `similar-projects.ts`, `eval-strategy.ts`) 수정 금지 — 사용만
- 다른 스텝 컴포넌트 (`step-impact`, `curriculum-board` 등) 건드리지 말 것
- 의존성 추가 금지

## 🛠 Tasks

### Step 1: PATCH 저장 API (신규)

`src/app/api/projects/[id]/rfp/route.ts`:

```typescript
// PATCH /api/projects/[id]/rfp
// Body:
// {
//   proposalBackground?: string
//   proposalConcept?: string
//   keyPlanningPoints?: string[]
//   evalStrategy?: EvalStrategy | null
// }
```

- NextAuth 인증
- Partial update (body 에 있는 필드만 update)
- 간단 검증: keyPlanningPoints 는 배열이어야, proposalConcept 은 300자 이하 등
- 성공 시 `{ ok: true, updatedAt }` 반환
- 에러 시 400/401/404/500

### Step 2: step-rfp.tsx 레이아웃 재작업

기존 파일을 **완전 재작업**:

**기본 구조:**
```tsx
'use client'

interface StepRfpProps {
  projectId: string
  initialParsed: RfpParsed | null
  /**
   * 이미 저장된 기획방향 — PM 이 과거에 확정했으면 editedBackground/Concept/Points
   * 초기값으로 복원됨. page.tsx 가 project 레코드에서 읽어 전달.
   */
  initialRfpSlice?: {
    proposalBackground?: string | null
    proposalConcept?: string | null
    keyPlanningPoints?: string[] | null
    confirmedAt?: string | null
  }
}

export function StepRfp({ projectId, initialParsed, initialRfpSlice }: StepRfpProps) {
  const [parsed, setParsed] = useState(initialParsed)
  const [planningDirection, setPlanningDirection] = useState<PlanningDirectionResponse | null>(null)
  const [similar, setSimilar] = useState<SimilarProject[]>([])
  const [evalStrategy, setEvalStrategy] = useState<EvalStrategy | null>(null)
  const [selectedConceptIdx, setSelectedConceptIdx] = useState<number | null>(null)
  // 기존 저장값이 있으면 그대로 복원
  const [editedBackground, setEditedBackground] = useState<string>(initialRfpSlice?.proposalBackground ?? '')
  const [editedConcept, setEditedConcept] = useState<string>(initialRfpSlice?.proposalConcept ?? '')
  const [editedPoints, setEditedPoints] = useState<string[]>(initialRfpSlice?.keyPlanningPoints ?? ['', '', ''])
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const isConfirmed = !!initialRfpSlice?.confirmedAt

  // useEffect 1: mount 시 B2 similar 조회
  // useEffect 2: parsed.evalCriteria 변경 시 B3 analyzeEvalStrategy 로 계산

  return (
    <div className="grid grid-cols-[1fr_1.2fr_320px] gap-4 h-full">
      <LeftPanel parsed={parsed} onUpdate={setParsed} />
      <MiddlePanel ... />
      <RightPanel similar={similar} evalStrategy={evalStrategy} />
    </div>
  )
}
```

**호출 순서 (B4 가 조율):**
1. Mount → B2 `GET /similar` 호출 (병렬) + B3 `analyzeEvalStrategy(parsed.evalCriteria)` 계산
2. 저장된 기획방향 있으면 (`initialRfpSlice.confirmedAt`) 바로 표시
3. "기획 방향 생성" 클릭 → B1 `POST /planning-direction` 호출 (body 에 similar 포함하여 주입)
4. PM 편집 → "확정" 클릭 → `PATCH /api/projects/[id]/rfp`

### Step 3: LeftPanel (파싱 결과 — 기존 유지)

현재 파싱 UI 로직(rfp-parser.tsx 호출 + 결과 표시) 은 그대로 이식. 내부 로직 수정 ❌.

### Step 4: MiddlePanel (기획 방향 — 신규 핵심)

**상단:** "기획 방향 생성" 버튼 (parsed 있어야 enabled)
- 클릭 → `POST /api/ai/planning-direction { projectId, similarProjects: similar }` 호출
- 로딩 스피너 ("AI 가 제안 방향 3개를 생성하는 중...")
- 성공 시 `planningDirection` state 업데이트 + `editedBackground` 초기화

**제안배경 영역:**
- `<Textarea>` (min-h-[200px])
- 초기값: `planningDirection.proposalBackground`
- 편집 가능, 600자 카운터 표시

**컨셉 후보 3개 카드:**
- 3개 카드 가로 배치 (`grid grid-cols-3 gap-3`)
- 각 카드: title (큰 글씨) · oneLiner · rationale (접힘/펼침)
- 선택된 카드는 `border-primary ring-2 ring-primary/30` 강조
- 클릭 시 `selectedConceptIdx` 업데이트 + `editedConcept` 초기값 = 해당 후보의 `oneLiner`
- 선택 후 카드 아래 `<Input>` 으로 컨셉 문장 편집 가능

**핵심 기획 포인트 영역:**
- 3개 `<Input>` (왼쪽에 번호 원 배지, border-brand-left 유틸)
- 초기값: `planningDirection.keyPlanningPoints`
- 편집 가능

**하단:**
- "기획 방향 확정" 버튼
  - disabled 조건: planningDirection 없음 / selectedConceptIdx === null / editedBackground 공백
  - 클릭 → PATCH 호출 → 성공 시 `toast.success('기획 방향 저장됨')` + 페이지 소프트 새로고침 (router.refresh())
- 재생성 링크: "다시 생성" (B1 API 재호출, editedConcept 등 초기화)

### Step 5: RightPanel (PM 가이드 — placeholder + 데이터 요약)

Phase D3 에서 본격 구현. B4 단계에서는:

**카드 1: 평가 전략 요약 (B3)**
- `evalStrategy.topItems` 3개 리스트
- 각 항목: name · points · section 배지 · guidance 한 줄
- `evalStrategy.overallGuidance` 를 아래 불릿 리스트

**카드 2: 유사 프로젝트 (B2)**
- top 3 만 표시 (공간 절약)
- 각 행: name · client · budget 형식 · won 배지 · similarity %

**카드 3: "Phase D3 준비 중"** (placeholder)
- 평가위원 관점 · 당선 레퍼런스 · 흔한 실수 항목이 들어올 예정 안내

### Step 6: manifest 업데이트

`src/app/(dashboard)/projects/[id]/step-rfp.manifest.ts` 의 `api` 필드에 추가:

```typescript
api: [
  'POST /api/ai/parse-rfp',
  'POST /api/ai/planning-direction',
  'GET /api/projects/[id]/similar',
  'PATCH /api/projects/[id]/rfp',       // 신규
],
```

### Step 7: 검증

```bash
npm run typecheck
npm run build
```

둘 다 통과. 런타임 수동 테스트 권장 — RFP 파싱된 Project 가 있으면 /projects/[id]?step=rfp 에서 3컬럼 + 생성 + 저장까지 확인.

## 🔒 Tech Constraints

- **디자인 시스템 엄격 준수** — `ud-design-system` SKILL § 섹션 준수. shadcn/ui + lucide-react 만.
- **브랜드 보이스** — UI 문구는 `ud-brand-voice` SKILL 참조. 특히 §11 금지 목록 (AI 코치 별도 레이어 언급 ❌).
- **타입 안전** — 이 파일은 **신규 경로로 간주**, `no-explicit-any` error 유지 (ESLint override 수정 금지)
- **의존성 추가 금지**
- **모바일 반응형 무시 OK** — 데스크탑 전용 UI. 하지만 좌측 패널 접힘 등 과도한 기능 ❌.

## ✔️ Definition of Done

- [ ] `step-rfp.tsx` 3컬럼 레이아웃 구현
- [ ] B1 API 호출 + 결과 렌더링 (로딩·에러 처리)
- [ ] B2 API 호출 + 우측 표시
- [ ] B3 유틸 사용 + 평가 전략 카드
- [ ] PM 선택·편집 흐름 (컨셉 3개 중 선택 → 편집 → 저장)
- [ ] `PATCH /api/projects/[id]/rfp` 신규 + 인증
- [ ] manifest.ts `api` 업데이트
- [ ] toast 피드백 (sonner)
- [ ] 저장 버튼 disabled 조건
- [ ] 재생성 기능
- [ ] `npm run typecheck` 통과 (`any` 사용 없이)
- [ ] `npm run build` 통과
- [ ] 기존 rfp-parser.tsx 건드리지 않음
- [ ] 다른 스텝 파일 건드리지 않음 (git diff)
- [ ] 디자인 시스템 SKILL §7 상태 배지·§11 스니펫 준수

## 📤 Return Format

```
B4 Step 1 UI 재설계 완료.

변경 파일:
- src/app/(dashboard)/projects/[id]/step-rfp.tsx (재작업)
- src/app/(dashboard)/projects/[id]/_step-rfp/*.tsx (하위 컴포넌트 분리 시)
- src/app/api/projects/[id]/rfp/route.ts (PATCH 신규)
- src/app/(dashboard)/projects/[id]/step-rfp.manifest.ts (api 필드 업데이트)

3컬럼 구조:
- 좌: 파싱 결과 (기존 유지)
- 중: 기획 방향 (제안배경 · 컨셉 3개 카드 · 핵심 포인트 3개 · 확정 버튼)
- 우: PM 가이드 (평가 전략 · 유사 프로젝트 · D3 placeholder)

PM 플로우:
- 파싱 완료 → "기획 방향 생성" → 3개 후보 → 선택·편집 → 확정 → PATCH 저장

API 연결:
- POST /api/ai/planning-direction (B1)
- GET /api/projects/[id]/similar (B2)
- src/lib/eval-strategy.ts analyzeEvalStrategy (B3)
- PATCH /api/projects/[id]/rfp (신규)

검증:
- npm run typecheck: ✅
- npm run build: ✅
- 디자인 시스템 SKILL 준수: ✅
- 브랜드 보이스 SKILL 준수: ✅

런타임 확인 (optional):
- [수동 테스트 결과 있으면 기록]

주의 / 이슈:
- [B1 API 응답 속도·품질 이슈 / UX 엣지 케이스 / 등]

후속:
- Phase D3 에서 우측 PM 가이드 패널 본격 구현 (pm-guide 모듈)
- Phase D5 에서 평가 시뮬 점수 Gate 3 통합
- Phase E1 IMPACT 모듈 자동 추천도 Step 2 동일 패턴 (참고 가치)
```

## 🚫 Do NOT

- page.tsx, 다른 스텝 파일 수정 금지
- rfp-parser.tsx 내부 수정 금지 (사용만)
- pipeline-context.ts · claude.ts · ud-brand.ts 수정 금지
- Prisma schema 수정 금지
- `any` 타입 사용 금지 (신규 경로 error 유지)
- shadcn 컴포넌트 직접 수정 금지 (래퍼만)
- `alert` / `confirm` 사용 금지 (sonner toast 필수)
- 의존성 추가 금지
- 크롤링·AI 코치 상품화 언급 (브랜드 보이스 위반)

## 💡 Hints

- Grid layout `grid-cols-[1fr_1.2fr_320px]` — 우측 고정폭, 중앙 비중 높임
- 3개 컨셉 카드는 `data-state="selected"` 속성으로 스타일 분기 (shadcn 패턴)
- 저장 직후 `router.refresh()` 하면 SSR fresh data 다시 불러옴
- PATCH 실패 시 sonner `toast.error('저장 실패 — 네트워크 확인')` + 버튼 재활성화
- PM 이 재생성하면 기존 편집 내용이 날아가므로 `confirm` 대신 sonner 의 action toast 사용:
  ```tsx
  toast('재생성하면 현재 편집 내용이 사라집니다', {
    action: { label: '재생성', onClick: () => regenerate() }
  })
  ```
- `editedPoints` 는 `string[]` 길이 3 고정. 추가/삭제 UI 없음.

## 🏁 Final Note

Phase B 의 UX 결정판. PM 이 실제로 이 화면에서 시간을 가장 많이 씀. **3개 컨셉 카드가 매력적으로 보여야 한다** — 본사 사이트 톤 (오렌지 그라데이션 · 선언형 헤드라인) 참고. B1 AI 품질 + B4 UI 직관성 결합이 Step 1 의 성패. 막히면 보고, 특히 B1 응답이 기대와 다르면 B1 프롬프트 조정 제안 → 메인에 상의.
