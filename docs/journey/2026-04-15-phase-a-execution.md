# 2026-04-15 (오후) — Phase A 실행: 에이전트 병렬 + 브랜드 정비

> kickoff 에서 세운 아키텍처를 실제 코드로. 에이전트 4+1 개를 백그라운드로 돌리고 그 사이에 웹사이트 분석·Skill·보관 작업을 병행한 날.

## 이날의 맥락
- **참여자:** 사용자, AI 공동기획자(메인), 서브 에이전트 5개 (A2·A4·A5·A6·A1+A3)
- **무엇을 하려 했나:** Phase A 전부 완료 + underdogs.global 분석 반영 + 불필요 페이지 보관
- **어디서 시작했나:** kickoff 직후, 브리프 6개 작성 완료 상태

## 흐름 (시간순)

### 1. Wave 1 병렬 실행 (A2·A4·A5·A6)
4개 에이전트 `run_in_background: true` 로 동시 실행. 사이에 메인은 `underdogs.global` 크롤링 + Skill 초안 작성.

**결과 순서:** A5 (사이드바) → A6 (CI) → A2 (PipelineContext) → A4 (Ingestion)

**각 에이전트가 만들어낸 핵심 발견:**
- **A2:** StrategySlice 구조 불일치 발견 (`whyUs` / `internalAdvantage` 분리 안 됨) → Phase B 에서 마이그레이션 필요. CurriculumItem 에 `category/method/objectives` 컬럼 부족.
- **A4:** Vercel 배포 시 로컬 storage 교체 필수 (TODO 주석). 신규 ingest 파일에 `as any` 2곳.
- **A5:** 사이드바 하단 "코치 DB 동기화" 버튼이 고아 상태로 남음 (사이드바 정리 후 발견).
- **A6:** 린트 325 errors 발견 → 사용자 결정 요청 (이후 Option D 적용).

### 2. Wave 2 (A1+A3) 실행 — 529 Overloaded 실패
에이전트가 A1 (page.tsx steps 배열) + `src/modules/_types.ts` 까지 만든 시점에 API 과부하 에러로 중단. **A3 manifest 7개 미작성**.

**대응:** 에이전트 재실행 대신 **메인이 직접 잔여 수습** (manifest 파일 7개 + page.tsx 조건부 렌더링 블록 순서·주석 재배치). 규모가 작고 설계 문서가 이미 있어 에이전트 재호출보다 빠름.

### 3. 린트 정책 선택: Option D (경로별) → Option E (전역 warn + 신규 error) 로 flip

**흐름:**
- 처음: 레거시 경로를 긴 리스트로 `warn`, 나머지 `error`
- 문제: glob pattern 의 `[id]` 가 character class 로 해석 → 매칭 실패. 325 → 71 error 로만 줄어들고 여전히 CI 차단.
- Flip: **전역 warn + 신규 경로만 error** 로 구조 역전. 목록이 훨씬 짧고 명확.
- 추가 룰 발견: `react/no-unescaped-entities`, `prefer-const`, `@next/next/no-html-link-for-pages`, `@next/next/no-assign-module-variable` — 레거시에서 모두 warn 완화.
- 최종: 0 errors, 354 warnings.

**교훈:** "경로 리스트" 가 길어지면 관리 비용이 커진다. **화이트리스트(신규)가 블랙리스트(레거시)보다 작을 때는 화이트리스트로 뒤집자**.

### 4. 사용자 결정 4개 반영
1. **컬러:** 본사 `#F05519` 기준으로 확정. 단, 현재 코드베이스의 `#FF8204` 는 Phase B 까지 그대로 유지 (마이그레이션 별도). Skill 에 "기준값과 현재값 분리 기록".
2. **법인명:** 언더독스 통일, 법적 표기 위치만 유디임팩트. `UD_LEGAL_ENTITY` 상수로 구조화.
3. **AI 코치:** 강점 언급 OK, 별도 레이어 ❌. 기존 4중 지원 체계 유지. Skill §9 에 명확히.
4. **린트:** Option D → Option E flip (위 참조).

### 5. Skill 2개로 분리 (디자인 / 브랜드 보이스)
한 Skill 에 다 담으려다 **트리거 조건이 다름** 을 인지 (UI 코드 작업 vs 제안서 문구). 분리가 깔끔. UI 수정 시 design-system 만, 제안서 문구 작성 시 brand-voice 만 로드.

### 6. ud-brand.ts 공식 수치 업데이트
사이트 기준으로 업데이트하면서 **일부 필드는 과거값이 더 보수적** 이라는 발견. 공식 20,211 vs 기존 21,000 → 사이트 카운터와 일치하게 수정. 대신 `totalGraduatesApprox: 25000` 이라는 별도 필드 추가 ("약 25,000명 누적" 표현용).

### 7. `_archived/` 보관 작업
Next.js 의 `_` 접두사 private folder 규칙 활용 → 파일 보존 + 라우트 비활성. 완전 삭제 대신 이 방식이 재설계 철학("점진 전환") 에 맞음.

**grep 으로 import 의존성 0건 확인 후 이동:**
- `(dashboard)/coaches/` · `modules/` · `sroi/` · `feedback/` (관리 뷰)
- `_archived/README.md` 에 대체 기능·실제 제거 시점·복구 방법 명시

## 내가 틀렸던 것

- **에이전트 병렬이 항상 빠르다는 가정 ❌**. Wave 2 에이전트가 529 에러로 죽었을 때 재호출보다 메인 직접 수행이 빠름. 작업 규모 + 에이전트 호출 오버헤드를 비교해야.
- **린트 경로 리스트를 길게 쓰면 유지가 된다는 가정 ❌**. glob pattern 의 특수 문자(`[id]`) 에 막힘. "짧은 화이트리스트" 가 답이었다.
- **Skill 하나에 다 담으려던 첫 판단 ❌**. 트리거 조건이 서로 다르면 Skill 도 분리해야 자동 로드가 정확.
- **"이동하면 끝" 이라는 가정 ❌**. `.next/types/validator.ts` 가 archived 경로 참조로 typecheck 실패 → `.next/types` 캐시 삭제 필요.

## 내가 맞았던 것

- Wave 1 을 4개 병렬·Wave 2 를 단일 순차로 분리한 전략 — 충돌 없이 통합 typecheck 0 에러.
- 기존 파일 재사용 (`data-flow-banner.tsx`, `planning-scorecard.tsx`) 우선 판단 — audit 에 UPGRADE 로 표시해둔 덕에 에이전트가 건드리지 않음.
- 사용자 결정을 "결정 4개" 로 묶어 일괄 요청한 것 — 개별로 물었으면 핑퐁 횟수가 많았을 것.
- ADR 3건에 Teaching Notes 를 미리 쓴 것 — kickoff 저녁에 세션 후반 events 가 이미 그 원칙을 검증함.

## 잃은 것 / 감수한 것

- **린트 354 warnings 상태 유지** — Phase 재작업 중에 자연 정리. 그전까지 IDE 에 노이즈.
- **신규 ingest 파일의 `as any` 2건** — legacy 임시 포함. Phase D 에서 해결.
- **컬러 미일치 기간** — 시스템은 `#FF8204`, 기준은 `#F05519`. Phase B 시작 전까지.
- **`meta.lastUpdatedBy: "system"`** 하드코딩 — 실제 감사 추적 불완전.
- **GitHub Secrets 없어서 CI 실제 가동 시 빌드 실패 가능** — 배포 세팅 별도.

## 다음에 또 할 일 (이 상황 재발 시)

- [ ] 서브 에이전트가 529 로 죽으면: 잔여 작업 규모 > 30분일 때만 재호출. 작으면 메인이 마무리.
- [ ] 린트 override 패턴 만들 때: **"신규가 레거시보다 짧은가?"** 먼저 확인 후 화이트리스트 선택.
- [ ] Skill 만들 때: **"언제 자동 로드되어야 하는가?"** 를 먼저 쓰고, 트리거가 다른 것은 분리.
- [ ] 파일 이동 (`_archived/`) 후: **`.next/types` 캐시 삭제** 후 typecheck 재실행.
- [ ] 새 Prisma 모델 추가 병렬 작업 시: **schema 수정 권한을 한 에이전트만** 갖게 (A4 가 유일하게 schema 건드릴 수 있도록 제한한 것은 올바랐다).

## 신입에게 전할 말 (교육자료 씨앗)

**"병렬이 항상 빠르지 않다. 블록 크기를 봐라."**
- 에이전트 호출 오버헤드(토큰+지연)는 고정. 10분짜리 작업을 에이전트에 맡기면 실제로는 15분. 메인이 5분에 끝낼 수 있는 건 직접 하는 게 빠름.
- 단, 30분+ 작업은 에이전트 위임이 압도적 유리 (메인이 다른 일 병행).

**"블랙리스트보다 화이트리스트. 레거시가 많으면 '정상' 을 정의하라."**
- 큰 코드베이스에서 레거시 제약을 하나하나 막는 것보다, 신규 엄격 경로를 짧게 선언하는 게 더 간결하고 유지 쉬움.

**"Archive 는 Delete 가 아니다."**
- Next.js 의 `_` 접두사, Git 의 branch archive, 프로젝트의 `/legacy` 폴더 — 모두 "지우지 않고 비활성" 하는 방법. 대체 기능 완성 전까지 원본 보존하는 게 재설계의 정석.

## 연결
- 관련 ADR: [001](../decisions/001-pipeline-reorder.md) · [002](../decisions/002-module-manifest-pattern.md) · [003](../decisions/003-ingestion-pipeline.md)
- 관련 kickoff journey: [2026-04-15-redesign-kickoff](./2026-04-15-redesign-kickoff.md)
- 이번 세션 커밋: (아래에서 추가)
