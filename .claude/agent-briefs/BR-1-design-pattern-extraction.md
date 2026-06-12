# Brief BR-1 — 프로그램 설계 패턴 전수 추출 (WinningProposalDoc 148건 → 16축 JSON)

> **이 브리프는 자급자족입니다.** 서브 에이전트는 본 파일 + `../../CLAUDE.md`
> + `../../AGENTS.md` + `../../docs/glossary.md` 외에 메인 세션 컨텍스트 없이도
> 작업 가능해야 합니다. 막히면 추측하지 말고 STOP 후 메인에 보고하세요.

| 메타 | 값 |
|------|----|
| ID | `BR-1-design-pattern-extraction` |
| Owner | 메인 세션 |
| 작성일 | 2026-06-12 |
| 상태 | 🟡 in-progress |
| 의존 브리프 | 없음 (ADR-028 Accepted 선행 완료) |
| 우선순위 | P0 |
| 예상 시간 | 0.5~1일 |
| 격리 | 일반 (master 직접) |
| 관련 ADR | **ADR-028** (스키마 동결 — 이 브리프의 스펙) |

---

## 🎯 Mission
ADR-028 스키마(운영 16축 + profileSnapshot + contentMix + sessions + validity + evidence/confidence)대로 WinningProposalDoc 원문에서 ProgramDesignPattern JSON 을 추출하는 **타입 + 추출 스크립트 + 집계 스크립트**를 구현하고, 다양한 표본 3건 스모크로 추출 품질을 증명한다. (전수 148건 실행은 메인이 수행)

## 📋 Context
브레인이 "대상에 따라 프로그램 설계가 어떻게 달라지는가"에 답하지 못함 — 운영 구조가 1급 데이터가 아니라서. ADR-028 이 16축 스키마와 JSON-first 파이프라인을 동결함. 코퍼스 = 로컬 DB `WinningProposalDoc` 148건 (fullText 총 186만 자, p50 7.9k / max 63k, pdf-parse 133 · vision-ocr 13 · unsupported 2). **반드시 ADR-028 을 먼저 정독** — 축 키 이름·구조가 거기 동결되어 있다.

## ✅ Prerequisites (STOP 조건)
- [ ] ADR-028 존재 — `docs/decisions/028-program-design-grammar.md`
- [ ] DB 접속 가능 — `npx tsx -e "import 'dotenv/config'; import { prisma } from './src/lib/prisma'; prisma.winningProposalDoc.count().then(c => { console.log(c); process.exit(0) })"` → 148
- [ ] GEMINI API 키 — `.env` 에 존재 (invokeAi 가 읽음)

## 📖 Read These Files First
1. `../../CLAUDE.md` · `../../AGENTS.md` · `../../docs/glossary.md` (기본)
2. `../../docs/decisions/028-program-design-grammar.md` ⭐ — 스키마 스펙 (동결)
3. `../../src/lib/ai-fallback.ts` — invokeAi 시그니처 (모든 AI 호출은 이 진입점, eslint 강제)
4. `../../src/lib/ai/config.ts` — 모델 라우팅 (추출 = plumbing 티어)
5. `../../prisma/schema.prisma` 의 `WinningProposalDoc` 모델 (fullText·charCount·parseBy·lowText·channel·year·won)
6. `../../scripts/local-folder-ingest.ts` 상단 — dotenv 로딩 + 스크립트 컨벤션 참고
7. 429 백오프·동시성 제한 기존 패턴 — `git log --grep=QUAL-THROTTLE` 의 변경 파일 또는 `src/lib/` 에서 backoff 검색해 재사용

## 🎯 Scope
### CAN touch (이 파일들만)
- `src/lib/program-design/**` (신규 디렉토리 — 타입·zod·프롬프트)
- `scripts/extract-design-patterns.ts` (신규)
- `scripts/aggregate-design-patterns.ts` (신규)
- `data/program-design/**` (신규 — 산출물)
### MUST NOT touch (절대)
- `prisma/schema.prisma` (어떤 변경도 금지 — JSON-first 가 ADR-028 결정)
- `src/lib/ai-fallback.ts` 시그니처 · 모듈 manifest · 다른 트랙 컴포넌트
- 기존 ingest·brain 코드 수정 (읽기만)

## 🛠 Tasks
1. **`src/lib/program-design/operating-format.ts`** — ADR-028 스키마의 TypeScript 타입 + zod 스키마. 키 이름은 ADR 표 그대로 (camelCase). 모든 축: `{ value: <축별 구조|null>, confidence: number(0~1), evidence: string[] }` 패턴 통일. 최상위: `{ docId, projectId, projectName, profileSnapshot, operatingFormat(16축), contentMix, sessions, validity, kpiTargets, intensity, extractionMeta }`.
2. **추출 프롬프트** (`src/lib/program-design/extraction-prompt.ts`) — 핵심 원칙:
   - 원문에 없는 값은 **null + confidence 0** — 추측 채움 절대 금지 (강의 분류 v5.4 "[파악 불가]" 원칙)
   - 모든 non-null 값에 원문 인용 evidence ≤200자 1개 이상
   - enum 밖 관찰값은 `기타` + evidence 로 보존 (조용히 버리지 말 것)
   - 금액은 원 단위 정수, 비율은 0~100 정수
   - intensity 는 LLM 에게 시키지 말고 추출값에서 코드로 파생 계산
3. **`scripts/extract-design-patterns.ts`**:
   - dotenv 로딩 (local-folder-ingest 패턴) → prisma 로 WinningProposalDoc 로드
   - `invokeAi` + JSON 응답 (plumbing 티어 = Flash, responseSchema 또는 safeParseJson 이중 안전)
   - fullText 가 60k 초과 시 앞 55k + "…[중략]" (p99 만 해당) / `lowText` 또는 `parseBy='unsupported'` 는 추출하되 extractionMeta 에 플래그
   - CLI: `--ids <id,id>` `--limit N` `--concurrency N(기본 3)` `--force`(기존 파일 덮어쓰기, 기본은 skip = 멱등·재개 가능)
   - 429/5xx 지수 백오프 (기존 패턴 재사용), 실패 건은 `data/program-design/_run-report.json` 에 기록하고 계속
   - 산출: `data/program-design/extracted/<docId>.json` (zod 검증 통과분만 저장, 실패 시 1회 재시도 후 run-report 에 기록)
4. **`scripts/aggregate-design-patterns.ts`** (LLM 없음, 순수 코드):
   - extracted/*.json 전부 로드 → `data/program-design/_aggregate.json`
   - 집계: 채널별·targetStage별·demographic별 × 각 축의 분포 (enum 카운트, 수치는 min/p50/avg/max, null율) + confidence 평균
   - 섹션 05 가설 매트릭스 검증에 쓸 수 있는 형태 (세그먼트 키 × 축 키 중첩 객체)
5. **스모크 3건** — 다양성 있게 선택: ① charCount 큰 pdf-parse 1건 ② vision-ocr 1건 ③ B2B 1건. 실행 후 **출력 JSON 을 원문과 대조해 직접 스팟체크** — 축 5개 이상에 대해 "원문 근거 → 추출값" 매핑이 정확한지 보고서에 표로 포함.

## 🔒 Tech Constraints
- 모든 AI 호출 = `invokeAi` (eslint no-restricted-imports 가 우회 차단)
- TypeScript strict · zod 경계 검증 · Next.js 코드 아님(스크립트) — 단 src/lib 타입은 앱에서 import 가능하게 클린하게
- 추출 = plumbing 티어 (ADR-022). Pro 호출 금지.

## ✔️ Definition of Done
- [ ] `npm run typecheck` · `npm run lint` 통과 (신규 파일 에러 0)
- [ ] 스모크 3건: extracted/<docId>.json 3개가 zod 통과 + non-null 축에 evidence 존재
- [ ] 스팟체크 표 (축 5개 × 3건) — 원문 인용과 추출값 일치 확인
- [ ] `--force` 없이 재실행 시 skip (멱등) 확인
- [ ] aggregate 스크립트가 3건 기준 _aggregate.json 생성
- [ ] Scope 위반 없음 (`git diff --name-only`)

## 📤 Return Format
```
## ✅ 한 일
## ❌ 못한 일 / 보류
## 🤔 결정한 것 (ADR 후보)
## 🔬 검증 (명령 + 결과 + 스팟체크 표)
## ⚠️ 위험 신호 / 다음 진입점 (전수 실행 시 예상 비용·시간 추정 포함)
```

## 🚫 Do NOT
- prisma/schema.prisma 변경 · 전수 148건 실행 (메인이 수행 — 스모크 3건만)
- 원문에 없는 값 추측 채움 · evidence 없는 non-null 값
- 커밋 (메인이 검증 후 커밋)

## 💡 Hints & Edge Cases
- OCR 원문은 표가 깨져 있을 수 있음 — 커리큘럼 회차표가 깨진 경우 sessions[] 는 빈 배열이 정답 (억지 복원 금지)
- "후속 온라인 코칭 2회", "2박 3일 집중 해커톤", "전국 5개 권역 30개 거점" 같은 문구가 coaching/cadence/venue 의 전형적 evidence
- 예산은 제안서에 없을 수 있음(과업지시서 별도) — null 허용
- projectName 에 사업코드(A.24.XXXX)가 붙어 있음 — 그대로 보존

## 🏁 Final Note
전수 실행·집계 해석·가설 검증(P3)은 메인 몫. 부수 발견(예: fullText 품질 문제, channel null 22건 보정 가능성)은 보고만.
