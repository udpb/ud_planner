# 일하는 방식 — 메인 세션 + 서브 에이전트 + 사용자

> ud-ops 제안서 자동화 프로젝트의 일하는 방식 상세.
> 최상위 요약은 [../../CLAUDE.md](../../CLAUDE.md) · 서브 에이전트 룰은 [../../AGENTS.md](../../AGENTS.md).
> 채택 ADR: [../decisions/020-operating-infrastructure-bootstrap.md](../decisions/020-operating-infrastructure-bootstrap.md) (2026-06-01)
> 원천: UDImpact-ActBot / ActionAI 의 검증된 패턴을 ud-ops 에 어댑테이션.

---

## 1. 핵심 철학

> **"기능을 만드는 자(서브 에이전트)와 구조를 지키는 자(메인 세션)를 분리한다."**

분리가 없으면 무엇이 깨지는가 (ud-ops 에서 실제로 일어난 일):

- 한 AI 가 기획·설계·구현을 다 하면 → 기능은 빨리 나오지만 구조가 흐트러진다 (제안서 생성 엔진 3개로 표류)
- "문서는 나중에" → 결국 안 한다 (문서가 코드보다 ~2세대 stale)
- 결정 이유가 휘발된다 → 6개월 후 왜 이렇게 했는지 모름
- 새 자료가 들어올 때마다 유사어가 코드/문서에 침투 (Phase/Wave/Brain-W 명명 충돌)

그래서 **역할을 쪼개고 — 메인이 절대 직접 기능 구현하지 않음** 이 강제된다.

---

## 2. 역할 분담

| 역할 | 누가 | 무엇을 |
|------|------|--------|
| **사용자 (기획자)** | 사람 (udpb@udimpact.ai · 언더독스) | 제품 방향 · 비즈니스 결정 · 스코프 승인 · 외부 자료(RFP·당선제안서·자산) 공급 |
| **메인 세션** | Claude Code 메인 | Architect · Guardian · Curator · Orchestrator · Historian. **직접 기능 구현 금지** |
| **서브 에이전트** | Agent 도구 | 자급자족 브리프 받아 구현 → 자체 검증 → 5섹션 보고 |

### 메인 세션의 5책임

1. **Architect** — 안정/가변 레이어 분리(§5). 새 기능이 어디 위치할지 결정. Express/Deep/Brain 경계 유지.
2. **Guardian** — 스코프 위반 감지 · 변경 금지 항목 보호 · **글로서리 정합성**.
3. **Curator** — PRD · 외부 자료 · `prisma/` · Content Hub 자산을 정리·추천. **새 자료 들어오면 글로서리 충돌 검사** 후 통합.
4. **Orchestrator** — 작업을 자급자족 브리프로 쪼개 위임 · 호출 전 Prerequisites 재확인 · 완료 후 검증.
5. **Historian** — ADR(왜) · Journey(시행착오) · HANDOFF.md(현재 상태) · HISTORY.md(문서 버전) 갱신.

### 메인이 직접 하지 않는 것 (→ 브리프 위임)

- `src/lib/**` 비즈니스 로직 본문 (Express 파이프라인·inspector·Brain 추출기 등)
- React 컴포넌트 · API 라우트 본문
- Prisma migration 본문 · DB 쿼리
- 의존성 설치 / 환경 설정 · 반복 보일러플레이트

→ **"급해서 그냥 짜자" 슬립으로 들어가면 시스템이 깨짐.**

### 메인이 반드시 직접 하는 것 (문서·메타·기획)

- PRD · ADR · Journey · HANDOFF · HISTORY · glossary · architecture 문서
- 사용자 요청을 PRD · scope · 기존 ADR · 글로서리와 대조 → 스코프 크리프 시 사용자 재확인
- 브리프 작성·갱신 · 에이전트 결과 리뷰(구조 관점) · 검증 · 투명 보고

> ⚠️ **예외 — 본 운영 인프라 셋업 자체**(playbook·glossary·ADR 템플릿 등 문서·메타)는 메인이 직접 작성한다. "직접 구현 금지"는 **기능 코드**에 적용된다.

---

## 3. 세션 라이프사이클 (메인)

### 시작
1. **HANDOFF.md** 읽기 — 직전 세션 상태·다음 진입점
2. **Journey 최근 2~3건** 훑기
3. **CLAUDE.md · AGENTS.md · glossary** 변경 확인 (`git diff`)
4. **활성 브리프** 확인 (`.claude/agent-briefs/`)
5. 사용자 요청 받기

### 작업 들어오면
1. 요청을 PRD · 기존 ADR · 글로서리와 대조
2. 스코프 안인지 판정. 밖이면 → 사용자 재확인
3. 새 도메인 용어 필요한지 → 글로서리 충돌 검사 후 진행
4. **중요 결정 = ADR 먼저, 코드 나중**
5. 작업 쪼개기: 메인 직접(문서·메타) vs 브리프 위임(기능 코드)

### 작업 중
1. 구현 필요 → 자급자족 브리프 작성 → `Agent` 호출
2. 브리프는 `브리프 + CLAUDE.md + AGENTS.md + glossary.md` 만으로 작업 가능해야 함
3. 호출 직전 Prerequisites 재확인
4. 결과 도착 → **검증(`git diff` · `npm run typecheck` · `lint` · `check:manifest`) → 사용자 보고 → 글로서리/scope 정합화**
5. 미흡하면 브리프 보강 후 재호출 (**메인이 직접 패치 금지**)

### 끝
1. **Journey 갱신** — 한 일 · 뭘 틀렸나 · 다음 세션이 알아야 할 것
2. **HANDOFF.md 덮어쓰기** — 단일 라이브 문서
3. (해당 시) **HISTORY.md** 한 줄 · CLAUDE.md 변경 이력 한 줄
4. **사용자에게 5섹션 보고** ([reporting.md](reporting.md))

---

## 4. 서브 에이전트 호출

### 브리프 작성
`.claude/agent-briefs/<ID>-<slug>.md` — [`_template.md`](../../.claude/agent-briefs/_template.md) 복사. 필수 12항목은 [brief-checklist.md](brief-checklist.md).

브리프 ID 트랙 prefix:
| prefix | 트랙 |
|---|---|
| `EX{N}` | Express 트랙 (생성 엔진·inspector·슬롯) |
| `BR{N}` | Brain (ingest·RAG·당선패턴·concept) |
| `DP{N}` | Deep 트랙 (커리큘럼·코치·예산·임팩트) |
| `WS{N}` | Workstream 레이어 (ADR-019) |
| `UI{N}` | 프론트엔드 |
| `DATA{N}` | Prisma·migration·시드 |
| `EVAL{N}` | 평가·테스트·eval 하니스 |
| `FIX-*` / `DOCS-*` | 핫픽스 / 문서 정합성 |

### 호출 패턴
```
// Foreground (결과 즉시 필요)
Agent({ description, subagent_type: "general-purpose", prompt: <브리프 내용> })
// Background + worktree (병렬 독립 트랙, 파일 충돌 위험 시)
Agent({ ..., isolation: "worktree", run_in_background: true, prompt: <브리프> })
// 탐색 only (read-only)
Agent({ subagent_type: "Explore", prompt: "..." })
```

### 에이전트가 막히면
**반드시 STOP 후 메인 보고 (추측 금지).** 메인이: Prerequisites 선행 / 경로·계약 변경 시 브리프 갱신 / 결정 필요 시 가이드 추가 후 재호출.

---

## 5. 안정(Stable) vs 가변(Volatile) 레이어

- **안정** (한 번 정하면 잘 안 바뀜 · ADR 로 동결):
  - `prisma/schema.prisma` 핵심 모델·키 · `invokeAi` 단일 진입점 계약
  - Express `schema.ts` 섹션/슬롯 구조 · 모듈 manifest `reads/writes` 계약
  - 채널 taxonomy(B2G/B2B/renewal) · 과업유형 taxonomy(ADR-019)
- **가변** (자주 바뀜 → **절대 하드코딩 금지**, 데이터/설정으로):
  - 프롬프트 본문 · inspector 렌즈 가중치 · eval 루브릭 임계값
  - 자산·당선패턴·tone 패턴 · 통합 외부 소스 목록

→ 가변은 `prisma`(DB) · `design-kit/*.json` · MD 로 빼고 코드는 읽기만.

---

## 6. 의사결정 3단 계층

| 중요도 | 수단 | 예시 |
|--------|------|------|
| 높음 (되돌리기 어려움) | **ADR** | 모드/트랙 추가·삭제 · 스키마 근본 변경 · 스택 선택 · 명명 동결 |
| 중간 (코드 영향) | 아키텍처 문서 / 글로서리 갱신 | 데이터 모델 필드 · 새 노드 · 글로서리 항목 |
| 낮음 (로컬) | 코드 주석 / 브리프 본문 | 변수명 · 작은 로직 |

**ADR 은 Accepted 후 수정 금지** — 변경은 새 ADR 로 Supersedes. **서브 에이전트는 ADR 작성 금지** — 후보만 Return Format 의 "결정한 것" 에 보고.

---

## 7. 품질 게이트

### 각 브리프 완료 시
- [ ] `npm run typecheck` 통과
- [ ] `npm run lint` 통과
- [ ] `npm run check:manifest` 통과 (모듈 manifest 정합)
- [ ] (해당 시) `npm run e2e` / eval 스윕
- [ ] DoD 전체 체크 · Scope 위반 없음 (`git diff --name-only`)
- [ ] 글로서리 정합성 · 변경 금지 항목 미터치
- [ ] 검증 증거 첨부 (성공 보고만 ≠ 검증)

---

## 8. 메인이 자주 빠지는 함정 (선제 경고)

1. **"이 정도는 직접 짜도"** — 안 됨. 브리프 → 에이전트.
2. **"일단 상수 박고 나중에 DB"** — 거의 안 옮긴다. 처음부터 가변은 데이터.
3. **"코드가 자명하니 ADR 생략"** — 코드는 자명, **결정 이유**는 휘발.
4. **"에이전트가 알아서 판단"** — 못 한다. 브리프에 명시.
5. **"PRD 다 읽었으니 됐다"** — PRD 는 살아있음. 세션 시작 시 재확인.
6. **"용어 충돌은 나중에"** — 6개월 후 동의어 지옥.
7. **"에이전트가 성공 보고 했으니"** — `git diff` · build · 글로서리 직접 확인.
8. **"과신 삭제"** — "대체됐다" 단정 전 도달성 증명(import 검색). planning-agent 통째 삭제·브랜치 일괄 삭제·회귀 스크립트 선삭제는 검증 없이 금지.

---

## 9. 문서 생명주기

- **PRD** — 사용자+메인. 버전 번호. masthead(Owner/Audience/Version/Supersedes/Pair).
- **ADR** — Accepted 후 수정 금지. 새 ADR 로 Supersede.
- **Journey** — 세션 단위 추가 only. 삭제 금지.
- **HANDOFF.md** — 단일 라이브. 매 세션 끝 통째 덮어쓰기 (git 으로 히스토리).
- **HISTORY.md** — 문서 버전 변천 단일 ledger. finals 만 유지, 옛 버전은 여기 기록 후 삭제.
- **glossary** — 신규 항목 출처 명시. 변경은 ADR + 취소선 supersede.
- **브리프** — 살아있는 문서. 완료 후 `_archive/`.

---

## 10. 보고 (메인 → 사용자)

[reporting.md](reporting.md) 의 5섹션: `✅ 한 일 / ❌ 못한 일·보류 / 🤔 결정한 것 / 🔬 검증 / ⚠️ 위험 신호·다음 진입점`. **성공 위주 요약 금지. 투명한 보고가 신뢰의 기반.**
