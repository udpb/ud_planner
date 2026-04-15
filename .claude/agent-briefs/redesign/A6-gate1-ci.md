# A6 Brief: Gate 1 CI (typecheck + build)

## 🎯 Mission (1 sentence)
`package.json` 에 `typecheck` 스크립트를 추가하고, GitHub Actions 워크플로우 하나를 만들어 PR·push 시 **typecheck + build + lint** 가 자동 실행되게 한다. 이게 품질 게이트 Gate 1 의 자동화.

## 📋 Context

**왜 이 작업이 필요한가.** 품질 게이트 4계층 중 Gate 1(구조·계약 검증)을 머지 차단 수준으로 강제. 현재 CI 없음 → 누군가 타입 에러 커밋해도 모르는 상태.

**무엇이 없는 상태인가.**
- `.github/workflows/` 폴더 없음
- `package.json` 에 `typecheck` 스크립트 없음 (`build` 는 prisma generate + next build 만 함)
- `lint` 스크립트는 있음 (`eslint`)

## ✅ Prerequisites
1. 작업 디렉토리: `c:\Users\USER\projects\ud-ops-workspace`
2. `npm run build` 현재 통과 (baseline)
3. `npm run lint` 현재 통과 또는 알려진 경고만
4. GitHub 저장소로 origin 연결됨 (아니면 워크플로우는 파일로 남고 실행만 안 됨 — 그래도 OK)

실패 시 STOP.

## 📖 Read These Files First

1. `CLAUDE.md` — 프로젝트 개요
2. `docs/architecture/quality-gates.md` §1 Gate 1 — 강제 대상 목록
3. `package.json` 전체 (scripts 섹션)
4. `tsconfig.json` — `noEmit` 설정 확인
5. `.gitignore` — 이미 노출된 것이 있는지
6. `next.config.ts` 또는 `.js` — 빌드 설정

## 🎯 Scope

### ✅ You CAN touch
- `package.json` — `scripts` 섹션에 `typecheck` 만 추가
- `.github/workflows/ci.yml` (신규)
- `.github/` 폴더 생성

### ❌ You MUST NOT touch
- 다른 `package.json` 항목 (dependencies, devDependencies 등)
- `tsconfig.json` (설정은 기존 유지)
- `.eslintrc` / `eslint.config.*`
- 소스 코드 (타입 에러 고치기 위해서라도)
- `prisma/schema.prisma`
- `next.config.*`

## 🛠 Tasks

### Step 1: `typecheck` 스크립트 추가

`package.json` 의 `scripts` 에 추가:

```json
"typecheck": "tsc --noEmit"
```

위치: `build` 스크립트 바로 뒤 또는 `lint` 바로 뒤. 다른 스크립트 변경 금지.

### Step 2: GitHub Actions 워크플로우

`.github/workflows/ci.yml` 생성:

```yaml
name: CI

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]

jobs:
  quality-gate-1:
    name: Gate 1 — Structure & Contract
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Prisma generate (required for typecheck)
        run: npx prisma generate

      - name: Typecheck
        run: npm run typecheck

      - name: Lint
        run: npm run lint

      - name: Build
        run: npm run build
        env:
          # 빌드만 실행, DB 연결은 런타임
          DATABASE_URL: "postgresql://dummy:dummy@localhost:5432/dummy?schema=public"
          NEXTAUTH_URL: "http://localhost:3000"
          NEXTAUTH_SECRET: "ci-dummy-secret"
```

**환경 변수 주의:**
- 기존 빌드가 DB 연결을 요구하는지 확인. 요구한다면 `env:` 블록에 dummy 값 포함.
- `NEXTAUTH_SECRET`, `NEXTAUTH_URL` 등 다른 필수 env 가 있으면 `env:` 에 추가 (실제 값이 아닌 CI용 dummy).
- 실제 시크릿이 필요하면 워크플로우 주석으로 TODO 표시 (이 브리프에서 GitHub Secrets 설정까지는 요구하지 않음).

### Step 3: 검증

로컬에서 새 스크립트 실행:
```bash
npm run typecheck
```

**실패 시:** 기존 타입 에러가 드러난 것일 수 있음. 이 경우 **코드 수정 금지**, 대신 Return Format 에 "기존 타입 에러 N개 발견 — 사용자 결정 필요" 로 보고. 브리프 종료.

**통과 시:** `.github/workflows/ci.yml` 까지 완성하고 PR 생성은 하지 않음 (사용자 승인 후).

### Step 4: README 또는 docs/architecture/quality-gates.md 에 CI 링크 추가 금지

다른 문서 수정은 메인 세션이 처리. 이 브리프는 CI 설정만.

## 🔒 Tech Constraints

- **Node 버전:** GitHub Actions 는 `20` 사용 (프로젝트 최소 버전 확인 — `package.json` `engines` 없으면 20 고정)
- **npm ci 사용** — lockfile 기반 reproducible
- **캐시:** npm 캐시만 사용 (build output 캐시는 필요 시 후속 작업)
- **의존성 추가 금지**
- **prisma generate 필수** — typecheck 이전에 실행해야 Prisma 타입 생성됨

## ✔️ Definition of Done

- [ ] `package.json` `scripts` 에 `typecheck: "tsc --noEmit"` 추가됨
- [ ] 다른 `package.json` 변경 없음 (git diff 확인)
- [ ] `.github/workflows/ci.yml` 생성됨
- [ ] `npm run typecheck` 로컬 실행 결과 확인됨 (통과 or 에러 보고)
- [ ] `npm run build` 여전히 통과

## 📤 Return Format

```
A6 Gate 1 CI 완료.

변경 파일:
- package.json (scripts.typecheck 추가)
- .github/workflows/ci.yml (신규)

스크립트:
- typecheck: "tsc --noEmit"

워크플로우:
- 트리거: master push, PR
- 단계: checkout → setup-node 20 → npm ci → prisma generate → typecheck → lint → build
- env: DATABASE_URL, NEXTAUTH_URL, NEXTAUTH_SECRET (dummy)

로컬 검증:
- npm run typecheck: [✅ 통과 | ⚠️ 기존 에러 N개 발견]
- npm run build: ✅
- npm run lint: [통과/경고]

주의사항:
- GitHub Secrets 설정 미포함 (사용자가 직접). 실제 CI 에서 비밀값이 필요하면 추가 설정 필요.
- [기존 타입 에러 목록 — 있다면]

후속:
- Gate 2 (룰 엔진) 는 Phase B/C 에서 단위 테스트로 추가 예정
- Manifest 계약 ESLint 룰은 Phase F
```

## 🚫 Do NOT

- 기존 타입 에러를 코드 수정으로 고치지 말 것 — 보고만
- 새 devDependency 추가 금지 (`tsc` 는 이미 설치됨)
- 다른 워크플로우 파일 추가 금지
- tsconfig.json 수정 금지
- ESLint 설정 수정 금지
- GitHub Secrets 설정 변경 금지 (권한 밖)

## 💡 Hints

- `npm run typecheck` 가 실패하면 출력을 리포트에 포함 (에러 목록). 흔한 원인: Prisma 스키마 변경 후 `prisma generate` 안 된 상태, 또는 A2/A4 가 추가한 새 타입과의 충돌
- 단, A2/A4 는 같은 Wave 에서 진행 중이므로 **이 A6 브리프 실행 시점에는 아직 그들의 변경이 없음**. 타입 에러는 순수 기존 코드의 문제.
- 워크플로우 YAML 들여쓰기 주의 (스페이스만, 탭 금지)
- `actions/setup-node@v4` + `cache: 'npm'` 조합이 표준

## 🏁 Final Note

CI 는 지금 설정해도 바로 동작 안 할 수 있음 (GitHub Secrets 필요, 또는 PR 없으면 트리거 없음). 그래도 파일로 존재해야 앞으로 머지 시 작동. 코드 완성도가 아닌 **방어선 구축** 이 목표.
