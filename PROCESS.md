# PROCESS.md — 일하는 방식

> 이 문서는 **새 세션 진입자가 30분 안에 "이 팀이 어떻게 일하는지" 파악** 하기 위한 사용 설명서다.
> 설계 자체(무엇을 만드는가)는 [REDESIGN.md](REDESIGN.md) / [ROADMAP.md](ROADMAP.md) / [docs/architecture/](docs/architecture/) 를 본다.
> 이 문서는 **일을 진행하는 방법(어떻게 만드는가)** 만 다룬다.

---

## 0. 한 줄 요약

**AI 공동기획자가 메인 조정, 서브 에이전트 병렬 위임, Wave 단위 진행, 모든 결정·과정 기록.**

- 메인 세션은 **기획 · 조율 · 통합 커밋 · 게이트 검증** 만 담당.
- 기능 구현은 **서브 에이전트(Agent 도구)** 에게 자기 충족적 브리프로 병렬 위임.
- 한 Phase 는 6~9개 **Wave** 로 쪼개고, Wave 0 은 항상 **기록(ADR + spec + journey)** 으로 시작.
- "결론만 적은 문서" 금지. **경로(왜 그렇게 됐는지) 까지 journey 에 남긴다.**

---

## 1. 워크트리 정책 (2026-04-27 통합 후)

### 1.1 단일 작업 경로

**유일한 작업 경로:**

```
C:\Users\USER\projects\ud-ops-workspace
```

- master 브랜치 + 단일 워크트리.
- Claude Code 가 자동으로 `.claude/worktrees/<slug>/` 를 만드는 경우가 있음 → **작업 끝나면 머지하고 즉시 삭제**.
- 별도 dev/test 워크트리를 추가로 두지 않는다.

### 1.2 과거 사고 사례

2026-04 중순까지 운영하던 master + feat 워크트리 2개 구성에서 **"잘못된 워크트리에서 dev 띄우기"** 사고가 두 번 발생. 결과는:

- 한쪽 워크트리에 작업 중인 마이그레이션이 다른 쪽에서 실행되어 스키마 충돌
- 같은 파일을 두 워크트리가 동시에 수정 → 머지 시 한 쪽 작업 유실 위험

### 1.3 재발 방지 — predev 훅

`package.json` 의 `predev` 가 `npm run dev` 직전 자동 실행:

```bash
node scripts/print-worktree.cjs
```

이 스크립트는 ([scripts/print-worktree.cjs](scripts/print-worktree.cjs)):

- 현재 cwd 와 git 브랜치를 출력
- `.claude/worktrees/` 안이면 `⚠️ 워크트리 안에서 dev 를 띄우고 있습니다` 경고
- 정상 master 경로면 `✓ master worktree 정상` 통과

**dev 를 띄울 때마다 첫 4줄을 반드시 본다.** 워크트리 경고가 떴으면 즉시 중단하고 master 로 이동.

### 1.4 Claude Code 자동 worktree 사용 시

작업이 끝났을 때:

1. master 로 PR 머지 (또는 squash 통합 커밋)
2. `git worktree remove .claude/worktrees/<slug>`
3. `git branch -D claude/<slug>` (필요 시)

---

## 2. Wave 기반 진행

### 2.1 Phase 와 Wave

- 한 **Phase** = 한 큰 목표 (예: Phase F = Impact Value Chain 도입).
- Phase 는 6~9개의 **Wave** 로 쪼갠다. Wave 하나 = 한 번의 커밋 단위.
- ROADMAP.md 의 체크리스트가 Wave 단위와 일치.

### 2.2 Wave 0 = 기록 + 계획

**모든 Phase 의 첫 Wave 는 코드를 짜지 않는다.** Wave 0 산출물:

- `docs/decisions/NNN-<제목>.md` — ADR 1건 이상
- `docs/architecture/<area>.md` — 영향받는 아키텍처 문서 갱신
- `docs/journey/YYYY-MM-DD-<제목>.md` — kickoff journey 1건
- ROADMAP.md 의 해당 Phase 체크리스트 갱신

기록이 끝나야 Wave 1 (실제 코드) 으로 진입.

### 2.3 Wave 종료 시 의무

각 Wave 끝에:

1. `npx tsc --noEmit` 통과 확인
2. 영향 모듈의 manifest (`reads` / `writes`) 갱신
3. journey 파일에 한 단락 추가 (시간순, 막힌 지점 + 결정 + 사용자 한마디)
4. `feat(phase-X,scope): ...` 형식으로 커밋

### 2.4 게이트 — 설계 재검토 책임

Wave 종료 시점은 **자동 게이트** 다. 메인 세션은 다음을 자문:

- 이 Wave 산출물이 ADR 의 결정과 일치하는가
- 다음 Wave 가 시작 전제(전 Wave 산출물) 를 만족하는가
- 품질을 위해 **설계를 바꿔야** 하는 신호가 보이는가

설계 변경이 필요하면 **사용자에게 제시** 한다 (메모리: `feedback_gatekeeping.md`). 메인이 단독으로 ADR 결정을 뒤집지 않는다.

---

## 3. 의사결정 기록 (ADR + journey)

### 3.1 ADR (Architecture Decision Record)

위치: `docs/decisions/NNN-<kebab-제목>.md`. 템플릿: [docs/decisions/TEMPLATE.md](docs/decisions/TEMPLATE.md).

**ADR 을 써야 하는 신호 3가지** (하나라도 해당하면):

1. **되돌리기 어려움** — 한 번 적용하면 데이터/스키마/사용자가 묶여서 원복 비용이 큼
2. **여러 모듈 영향** — 2개 이상 슬라이스의 reads/writes 가 바뀜
3. **나중에 "왜?" 질문이 예상됨** — 6개월 뒤 다른 사람이 코드를 보고 의문을 가질 결정

**필수 섹션**: Status / Date / Context / Options Considered (Option A/B/C 비교) / Decision / Consequences (Risks 포함) / Implementation Notes.

번호는 단조 증가 (현재 ADR-001 ~ ADR-010 까지 있음). 새 ADR 추가 시 [ROADMAP.md](ROADMAP.md) 상단 링크에도 반영.

### 3.2 Journey

위치: `docs/journey/YYYY-MM-DD-<제목>.md`. 템플릿: [docs/journey/TEMPLATE.md](docs/journey/TEMPLATE.md).

**Journey 는 결론만 아니라 경로를 적는다:**

- 이날의 맥락 (누구 · 무엇을 · 어디서 시작)
- 흐름 (시간순) — **막힌 지점 / 잘못 든 길 / 궤도 수정** 다 포함
- **사용자 원문 인용** (특히 결정의 결정적 한 마디)
- 제가 틀렸던 것 — AI 메인 세션이 잘못 짚은 부분 명시

세션 끝나기 직전, 그날의 주요 변경을 한 묶음으로 journey 에 남긴다. 커밋 메시지로 압축하지 않는다.

### 3.3 메모리와의 관계

`C:\Users\USER\.claude\projects\C--Users-USER-projects-ud-ops-workspace\memory\` 에 사용자 자동 메모리. ADR / journey 의 핵심 결정은 메모리에도 인덱스되어 다음 세션이 시작될 때 참조됨. 메모리 항목 추가는 사용자가 명시 요청할 때만.

---

## 4. 에이전트 병렬 위임

### 4.1 원칙

- 독립 작업 N 개는 **한 메시지에 다중 Agent 호출** (병렬). 순차 호출 금지.
- 메인 세션은 **기획 · 조율 · 통합 커밋** 만. 기능 구현 코드는 가급적 서브에 위임.
- 사례: Phase F Wave 6+7 (impact-rules 갱신 + value-chain UI) 병렬, Phase G Wave 5+6 (asset-registry seed + UI) 병렬.

### 4.2 브리핑 원칙 — 자기 충족적

서브 에이전트는 메인 대화의 컨텍스트가 없다. 브리프 하나로 작업이 끝나야 한다.

브리프에 반드시 들어가야 할 것:

- **목표** — 한 줄. 무엇을 만드는가.
- **파일 경로** — 신규/수정 파일 절대 경로 또는 저장소 루트 기준 경로
- **읽을 참고 문서** — 관련 ADR 번호 · architecture 문서 · 기존 코드 위치
- **제약** — 건드리면 안 되는 파일, 변경 금지 슬라이스, 스타일 규약
- **품질 기준** — 통과해야 할 게이트 (예: typecheck, 룰 게이트, 시드 통과)
- **보고 형식** — 변경 파일 목록 + 핵심 변경 요약 + 다음 단계 제안
- **`커밋 금지`** — 메인 세션이 통합 커밋한다. 서브가 커밋하면 Wave 단위 구성 무너짐.

### 4.3 브리프 저장 위치

`.claude/agent-briefs/` 또는 `.claude/tasks/`. Phase 단위 디렉토리로 정리 (예: `.claude/agent-briefs/redesign/B1-planning-direction-ai.md`).

### 4.4 통합 커밋 책임

- 메인 세션이 서브 결과를 받아 직접 검토 → typecheck 통과 → 통합 커밋.
- 서브가 커밋 메시지를 제안해도, 최종 메시지는 메인이 작성.

---

## 5. 품질 게이트 4계층

상세: [docs/architecture/quality-gates.md](docs/architecture/quality-gates.md).

### 5.1 Gate 1 — 구조 (빌드 타임)

- `npm run typecheck` (= `npx tsc --noEmit`)
- `npm run build` 통과
- Manifest 의 `reads` / `writes` 와 실제 import 일치 (Phase F 이후 ESLint 룰)
- Prisma 스키마 ↔ PipelineContext 타입 일치

실패 시 **머지 차단**.

### 5.2 Gate 2 — 룰 (결정론)

각 슬라이스별 결정론적 룰 엔진:

- `src/lib/curriculum-rules.ts` — 이론 30%, Action Week 필수 등
- `src/lib/budget-rules.ts` — 직접비 비율, 마진, 총액 한도
- `src/lib/impact-rules.ts` — Activity-Session 1:1, Outcome-Proxy 매핑
- `src/lib/proposal-rules.ts` — 7섹션 완성도, avoidMessages 검사

판정: BLOCK / WARN / SUGGEST. BLOCK 은 저장 거부.

### 5.3 Gate 3 — AI 검증 (정성)

- **3a 당선 패턴 대조** — `winning-patterns.ts` 와 유사도 점수
- **3b 평가위원 시뮬레이션** — Claude 에게 평가위원 역할 부여
- **3c 논리 체인 검증** — Impact → Input → Output → Activity → Outcome 정합성

### 5.4 Gate 4 — 사람 (운영)

- Phase F 의 **루프 얼라인** — SROI 축 3방향 얼라인 (메모: `loop-alignment.ts`)
- PM/Admin 의 최종 판단
- Smoke Test 결과 사용자 검토

---

## 6. AI 호출 규약 (v7 / Phase L1 갱신)

### 6.1 모델과 헬퍼 (L1 완료, 2026-04-27)

- **단일 진입점**: `src/lib/ai-fallback.ts` `invokeAi(params)` — provider/model 중립
- **Primary**: Google Gemini 3.1 Pro Preview (`gemini-3.1-pro-preview` via `googleapis`)
- **Fallback**: Claude Sonnet 4.6 (`claude-sonnet-4-6`, `CLAUDE_MODEL` 상수) — Gemini 실패·할당량 초과 시 자동
- 모델 변경은 ADR 필요. L1 의 변경 근거: ADR-011 + STATE 알려진 이슈 *"제안서 전체 생성 매우 느림 (45~76초/섹션)"*
- JSON 파싱은 **반드시** `safeParseJson<T>(raw, label)` — L1 강화: trailing comma 제거 + 마크다운 펜스 제거 + `{ }` 슬라이스 + 잘림 감지 + 자동 1회 재시도

```ts
const { raw, provider, model, elapsedMs } = await invokeAi({
  prompt,
  maxTokens: 8192,
  temperature: 0.4,
  label: 'logic-model',  // 콘솔 로그 + 디버깅용
})
const json = safeParseJson<LogicModelResponse>(raw)
```

### 6.2 max_tokens 가이드 (L1 확장)

| 호출 | max_tokens (v7/L1) | 변경 전 (v6) |
|------|-----------|-----------|
| RFP 파싱 | 8192 | 4096 |
| Logic Model | 8192 | 4096 |
| 커리큘럼 생성 | 8192 | 4096 |
| **Express 일괄 생성** ⭐ | **16384** | (해당 없음) |
| Smoke Test (디버그) | 8192 | 8192 |

확장 근거: Logic Model 5843byte truncate 사고 (LESSONS §13). 늘려야 하면 프롬프트 정리도 병행 (먼저 프롬프트, 그 다음 토큰).

### 6.3 공통 원칙 자동 주입

`src/lib/planning-principles.ts` 의 `COMMON_PLANNING_PRINCIPLES` 가 모든 AI 호출 프롬프트 헤더에 자동 주입됨. Express 의 `buildTurnPrompt()` 도 동일.

### 6.4 Gemini Primary (L1 변경)

`src/lib/ai-fallback.ts` 가 Gemini 우선 호출 → 실패 시 Claude 자동 fallback. 호출자는 어느 모델이 응답했는지 신경 안 써도 됨 (`provider` 필드로 추적만).

L1 커밋:
- `f2c0c38` — Gemini 통합 + max_tokens 확대 + safeParseJson 강화
- `6369403` — 모델명 fix (`gemini-3.1-pro-preview` 실제 API 명)
- `f0ffab8` — 호출마다 provider/model/elapsed 콘솔 로그

---

## 7. 커밋 컨벤션

### 7.1 형식

```
feat(scope): 한글 설명
fix(scope): 한글 설명
docs(scope): 한글 설명
refactor(scope): 한글 설명
```

Phase 단위 작업은 **scope 에 phase 표기**:

```
feat(phase-d,pm-guide): D3 스텝별 우측 가이드 패널
feat(phase-f,value-chain): Wave 5 Outcome SROI 수렴 UI
```

### 7.2 scope 목록 (CLAUDE.md 와 동기화)

`step-rfp` · `step-curriculum` · `step-coaches` · `step-budget` · `step-impact` · `step-proposal` · `pipeline-context` · `planning-agent` · `pm-guide` · `winning-pattern` · `channel-preset` · `asset-registry` · `value-chain` · `content-hub` · **`express`** ⭐ · **`ai`** ⭐ · `auth` · `coaches` · `modules` · `smoke-test` · `guidebook`

Phase L 작업은 **`feat(phase-l,express): ...`** 형식 (예: `feat(phase-l,express): L2 PoC 단일 화면 + ExpressDraft schema`).

### 7.3 다줄 메시지는 HEREDOC

```bash
git commit -m "$(cat <<'EOF'
feat(phase-f,value-chain): Wave 5 Outcome SROI 수렴 UI

- src/lib/value-chain.ts 에 ValueChainState 타입 추가
- src/components/value-chain/loop-panel.tsx 신규
- prisma 스키마 ValueChainSnapshot 모델 추가

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### 7.4 커밋 푸시 원칙

- master 직접 커밋: **인프라/설정 변경 + 통합 머지** 만 허용
- 그 외 기능 작업은 `feat/<task-id>` 또는 `claude/<slug>` 브랜치
- 사용자가 명시 요청하기 전엔 **푸시 금지**

---

## 8. 데이터 흐름 (PipelineContext)

### 8.1 직접 호출 금지 원칙

모듈 간 함수 직접 호출 ❌. 데이터 흐름은 **PipelineContext 슬라이스 경유** 만.

```
Step N  →  PipelineContext.<slice>  →  Step N+1
```

### 8.2 buildPipelineContext()

진입점: `src/lib/pipeline-context.ts`. 런타임에 다음을 조립:

- DB 의 `Project` + 슬라이스별 모델 (`CurriculumItem[]`, `CoachAssignment[]`, ...)
- Layer 1 자산 (브랜드, IMPACT 18모듈, 코치풀, 채널 프리셋 등) — 자동으로 컨텍스트에 부착
- ProgramProfile (11축, ADR-006) — Step 1 에서 정규화 후 모든 후속 스텝이 참조

각 스텝 컴포넌트는 page.tsx 가 한 번 빌드한 컨텍스트를 props 로 받아쓰기만 한다.

### 8.3 Manifest 의 reads / writes

각 모듈의 `manifest.ts` (예: `src/lib/planning-agent/manifest.ts`) 가 슬라이스 경계 선언. Manifest 에 없는 슬라이스에 접근하면 Gate 1 의 ESLint 룰이 차단 (Phase F 이후).

### 8.4 자산은 자동 축적

- Layer 1 (자산): `ud-brand` · `impact-modules` · `coach-pool` · `winning-patterns` · `channel-presets` · `program-profiles` · `content-assets` · `asset-registry`
- 자산 갱신은 `prisma/seed-*.ts` 또는 Ingestion 파이프라인(`src/lib/ingestion/`).
- PM 이 찾아가지 않음 — Step 시작 시 자동 주입.

---

## 9. 시작/검증 명령 모음

저장소 루트 (`C:\Users\USER\projects\ud-ops-workspace`) 에서 실행.

### 9.1 인프라 기동

```bash
docker compose up -d postgres
```

→ `ud_ops_db` 컨테이너 5432 포트. pgadmin 도 같이: `docker compose up -d`.

### 9.2 의존성 + DB 초기화

```bash
npm install
npx prisma generate
npm run db:migrate
```

### 9.3 시드 적재

```bash
npm run db:seed                       # 기본 시드
npm run db:seed:channel-presets       # 채널 프리셋
npm run db:seed:program-profiles      # ProgramProfile 11축 (ADR-006)
npm run db:seed:content-assets        # 콘텐츠 허브 (ADR-010)
```

### 9.4 dev 서버

```bash
npm run dev
```

→ predev 훅이 `scripts/print-worktree.cjs` 자동 실행. 첫 4줄 반드시 확인.

### 9.5 타입 / 빌드 / 린트

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run build        # prisma generate + next build
```

### 9.6 스모크 / 시뮬레이션

```bash
npx tsx scripts/smoke-test-phase-e.ts    # Phase E Control vs Treatment 비교
npx tsx scripts/simulate-pm-guide.ts     # PM 가이드 시뮬레이터
npx tsx scripts/verify-db.ts             # DB 시드 무결성
npx tsx scripts/sync-coaches.ts          # 코치풀 동기화
```

스모크는 실제 Claude API 호출 → 비용 발생. 의도한 시점에만.

### 9.7 Prisma Studio

```bash
npm run db:studio
```

브라우저에서 35개 모델 직접 검사.

---

## 10. 새 세션 재진입 체크리스트 (v7 갱신)

세션 시작 전 (3~5분):

- [ ] **작업 경로 확인**: `pwd` → `C:\Users\USER\projects\ud-ops-workspace` 인가
- [ ] **브랜치 확인**: `git branch --show-current` → `master` 인가 (또는 의도한 feat 브랜치)
- [ ] **작업트리 깨끗**: `git status` → 미커밋 변경 없음
- [ ] **원격 동기화**: `git fetch && git status` → "up to date" 또는 의도한 차이만
- [ ] **CLAUDE.md 한 번 훑기**: 디자인 시스템 / 설계 철학 10 / scope 목록 변경 없는지
- [ ] ⭐ **이 작업이 Express 인지 Deep 인지 확인**: 현재 진행 중 Phase 가 L (Express) 이면 L 흐름 (§12) 으로. Phase H 이전이거나 Deep Track 6 스텝 작업이면 §2~§9 흐름으로
- [ ] **진행 중 Phase 가 있다면 journey 끝 줄 확인**: `docs/journey/` 의 가장 최근 파일 마지막 단락
- [ ] **DB 기동 확인**: `docker ps | grep ud_ops_db` → Up 상태
- [ ] **시드 동기화**: 최근 마이그레이션이 있었으면 `npm run db:migrate` + 관련 seed 재실행
- [ ] **API 키 확인**: `.env` 의 `GEMINI_API_KEY` + `ANTHROPIC_API_KEY` 둘 다 있는가 (L1 후 Gemini Primary)
- [ ] **dev 띄워서 predev 출력 확인**: `npm run dev` → `✓ master worktree 정상` 통과

체크 끝나면 그 세션의 목표를 한 줄로 적고 시작.

---

## 11. 메모리 · 기록 우선

> *"모든 과정을 기록한다."* — 사용자 원칙 (2026-04-15 / `feedback_gatekeeping.md` / `session_20260420_status.md`)

### 11.1 우선순위

작업 순서는 **항상 기록이 코드보다 먼저**:

1. ADR (`docs/decisions/`) — 결정의 근거
2. Architecture spec (`docs/architecture/`) — 모듈 경계와 계약
3. Journey kickoff (`docs/journey/`) — 이 작업이 왜 시작됐는지
4. CLAUDE.md / ROADMAP.md / REDESIGN.md — 변경된 룰을 살아있는 문서에 반영
5. **그 다음에 코드**

### 11.2 안티 패턴 — 코드만 짜고 기록 누락

다음은 금지:

- "구현은 끝났는데 ADR 은 시간 없어서 다음에" → 다음은 영영 안 옴
- 커밋 메시지로 결정 근거 압축 → 6개월 뒤 grep 으로 못 찾음
- journey 에 "Wave X 완료" 한 줄만 → 막힌 지점이 사라짐, 같은 실수 재발

### 11.3 세션 종료 의무

세션 끝나기 직전 5~10분 확보:

1. 그 세션의 주요 변경을 journey 한 단락으로 요약 (시간순)
2. 사용자가 한 결정적 발언이 있었으면 **원문 인용**
3. 메인 세션이 잘못 짚은 부분이 있었으면 "제가 틀렸던 것" 섹션에 명시
4. ROADMAP.md 의 체크박스 갱신
5. 통합 커밋

기록을 안 남기는 것은 다음 세션에 대한 부채. **기록은 사치가 아니라 일의 일부.**

---

## 12. Express Mode 진입 흐름 (v7 신규)

> Phase L 진행 중 또는 Express 관련 작업 시 §2~§9 와 *병행* 적용. Express 는 Deep Track 6 스텝과 다른 정체.

### 12.1 Express 의 정체

ADR-011 채택 (2026-04-27) 으로 시스템이 두 트랙으로 재정의됨:

```
Express Track (메인)              Deep Track (보조)
────────────────────              ────────────────────
RFP → 30~45분 → 1차본              기존 6 step 파이프라인 (§8)
챗봇 + Slot Filling                정밀 산출 (수주 후 실행)
점진 미리보기                      Step 4·5·6 등 디테일
부차 기능 자동 인용 (1줄)          SROI/예산/코치 정밀
신규 진입점                        Loop 얼라인 Gate
```

**북극성**: RFP → 30~45분 → "당선 가능한 기획 1차본 (7 섹션 초안)".

### 12.2 Express 작업 시 추가 규약

§2~§9 위에 다음 규약 *추가* (대체 X):

- **AI 호출은 invokeAi 만**: §6.1 의 단일 진입점 — Gemini Primary, Claude Fallback. 직접 anthropic 클라이언트 부르지 않음
- **zod schema first**: 새 슬롯 추가 시 `src/lib/express/schema.ts` 의 zod 정의가 SSoT. 코드보다 schema 가 먼저
- **Partial Extraction Per Turn**: LLM 출력은 매 턴 `extractedSlots` JSON 으로 받아 즉시 PM 에게 visible. 누적 실패 방지 (ADR-011 §"비정형→정형 안전장치 B")
- **자유 발화 허용**: PM 이 슬롯 외 자유 답변하면 LLM 이 자유 답에서 슬롯 추출 (Hybrid C). "AI 가 묻는 대로만" 답답함 방지
- **외부 LLM 카드는 자동 프롬프트**: AI 가 "모르겠어요" 시 챗봇이 외부 LLM 프롬프트 자동 생성. PM 이 ChatGPT 등 가서 답 가져와 붙여넣기

### 12.3 Express 코드 위치

```
src/app/(dashboard)/projects/[id]/express/page.tsx   # 진입 라우트 (L2)
src/components/express/
  ExpressChat.tsx          # 좌측 챗봇
  ExpressPreview.tsx       # 우측 미리보기
  NorthStarBar.tsx         # 상단 진행 바
  cards/
    PmDirectCard.tsx       # 📞 PM 직접 카드 (L3)
    ExternalLlmCard.tsx    # 🔍 외부 LLM 카드 (L3)
    AutoExtractCard.tsx    # 🌱 자동 추출 카드 (L3)
src/lib/express/
  schema.ts                # ExpressDraft zod schema (12 슬롯)
  conversation.ts          # ConversationState
  slot-priority.ts         # selectNextSlot 결정론
  prompts.ts               # buildTurnPrompt
  active-slots.ts          # computeActiveSlots (RFP 따라 적용 슬롯)
  handoff.ts               # mapDraftToContext + suggestDeepAreas (L6)
  inspector.ts             # inspectDraft 검수 에이전트 (L5)
  auto-citations.ts        # SROI/예산/코치 1줄 인용 (L4)
src/app/api/express/
  save/route.ts            # 자동 저장 (debounce 1500ms)
  turn/route.ts            # 챗봇 턴 처리
```

### 12.4 Express Wave 분해

ROADMAP §Phase L 그대로:

- L0 ✅ 문서 (이 세션)
- L1 ✅ AI 안정화
- L2 PoC 단일 화면 (다음)
- L3 외부 LLM 분기 + 자산 자동 인용
- L4 부차 기능 1줄 인용
- L5 검수 에이전트
- L6 Express + Deep 통합

L3·L4·L5 는 L2 만 끝나면 병렬. L6 는 마지막.

### 12.5 Express 의 게이트 (§5 4계층 매핑)

| 게이트 | Express 적용 |
|---|---|
| Gate 1 | `ExpressDraftSchema.safeParse(draft)` 매 자동 저장 직전 |
| Gate 2 | 슬롯별 룰 (zod refine) — intent ≥20자 / keyMessages 정확히 3개 / sections 200~800자 |
| Gate 3 | `inspectDraft()` (L5) — 1차본 완성 후 자동 평가 |
| Gate 4 | "1차본 승인" 버튼 — Express 종료 후 Deep 진입 시 v6 의 루프 Alignment 활성 |

### 12.6 사용자 원문 (시스템 정체성 재정의의 결정적 한 마디)

> *"언더독스의 강점은 부각이 되지만 RFP에 따라 유연하게 적용 유무를 판단하고 적용하면서, 과정이 가장 사용자 친숙한 방식으로 되려면 어떻게 해야할까? 복잡도가 올라가는 방식보다는 사용자가 직관적으로 따라가지만, 계속 본인 스스로 흐름을 놓치지 않고 핵심 메세지 중심으로 결과물이 완성되는거야. SROI, 예산, 코치추천 이것도 필요한 기능이지만 부차적이야. **핵심은 RFP에 맞춰서 당선 가능한 기획 1차본이 나오는거지**"*
> — 2026-04-27, ADR-011 §배경

이 한 문단이 ADR-011 의 채택 근거. 추후 Express 관련 의사결정 시 *"이 변경이 1차본 도달을 도와주는가, 방해하는가"* 가 첫 질문.

---

## 부록 — 자주 참조하는 파일

### 설계 진실 소스

- **[PRD-v7.0.md](PRD-v7.0.md)** ⭐ — 단일 진실 원본 (v6.0 archived)
- [ROADMAP.md](ROADMAP.md) — 10 Phase 체크리스트 (A~H 완료, L 진행, I 대기)
- [REDESIGN.md](REDESIGN.md) — 재설계 v2 상세
- [docs/architecture/](docs/architecture/) — modules / data-contract / ingestion / quality-gates / value-chain / program-profile / asset-registry / content-hub / **express-mode** ⭐
- [docs/decisions/](docs/decisions/) — ADR-001 ~ **ADR-011**

### 핵심 코드

- `src/lib/pipeline-context.ts` — 슬라이스 조립 (Deep)
- `src/lib/ai-fallback.ts` — **invokeAi 단일 진입점 (Gemini Primary / Claude Fallback)** (L1)
- `src/lib/claude.ts` — Claude 클라이언트 + `safeParseJson` 강화
- `src/lib/planning-principles.ts` — 공통 원칙 자동 주입
- `src/lib/program-profile.ts` — 11축 정규화 (ADR-006)
- `src/lib/value-chain.ts` — Impact 5단계 (ADR-008)
- `src/lib/asset-registry.ts` — 자산 레지스트리 (ADR-009·010)
- `src/lib/express/` ⭐ — Express schema·conversation·prompts·handoff·inspector (L2~L6)
- `prisma/schema.prisma` — 44 모델 (Phase L2 후 `Project.expressDraft` 추가)

### 운영 도구

- `scripts/print-worktree.cjs` — predev 훅
- `scripts/smoke-test-phase-e.ts` — Phase E Control/Treatment 비교
- `scripts/simulate-pm-guide.ts` — PM 가이드 시뮬레이터
- `scripts/verify-db.ts` — 시드 무결성 검사
