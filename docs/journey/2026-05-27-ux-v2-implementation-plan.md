# UX v2 — 8h Autonomous Implementation Plan

**작성일**: 2026-05-27
**상황**: 사용자 8시간 자리 비움. AI 가 mockup → React 변환 진행.
**Compact 보존용**: 이 문서가 SSoT. context 잃어도 이 파일 읽고 재개.

---

## 🎯 목표

`/public/mockups/v2/` 의 6 HTML mockup (index + S1~S5) 을 실제 작동하는 React/Next.js 페이지로 변환.
경로: `/projects/[id]/v2`. master 페이지 (`/projects/[id]`) 는 **절대 안 건드림**.

---

## ✅ 완료된 사전 작업 (이 시점까지)

| 항목 | 상태 |
|---|---|
| Brain 5-Layer (W14-W32) | ✅ master merged + production 운영 중 |
| Cron 시스템 (W19-W23·W28) | ✅ Vercel cron 가동 (매일/매주/매월) |
| DB migration (brain_models) | ✅ production DB 에 적용 완료 |
| Mockup 6 HTML | ✅ `/public/mockups/v2/*` Vercel 배포 됨 |
| Design audit | ✅ 82/100 → 95+ 추정 (cyan/red 제거 후) |
| post-commit hook | ✅ 자동 push 작동 |
| git push 권한 | ✅ `.claude/settings.local.json` 에서 deny 제거 |
| 기존 v2 shell 컴포넌트 (PR #9·#10) | ⚠ 디자인 부족, **mockup 기준 재작성 예정** |

---

## 🚀 8h 6-Phase Plan

### Phase A — Shell components Tailwind 변환 (~1h)
- `src/components/shell/TopBar.tsx` → mockup `_shared.css .topbar` 정확 일치 (Tailwind classname)
- `src/components/shell/NowBar.tsx` → `.nowbar` 정확 일치
- `src/components/shell/BrainDock.tsx` → `.brain-dock` 정확 일치
- StageSidebar **제거** (mockup 에는 좌 사이드바 없음, TopBar 의 stage-journey 가 대체)
- 신규: `src/components/shell/SubHeader.tsx` (mockup `.subheader` 영역)

**검증**: tsc · Claude in Chrome 으로 /v2 페이지 visual 비교

### Phase B — S1 RFP Hero (~1.5h)
- `src/components/stages/S1HeroCenter.tsx` → mockup `s1.html` 정확 일치
- 기존 `/api/projects/[id]/rfp` POST 와 연동 (이미 구현됨)
- After-analysis dark section (mockup s1.html 의 `.after-analysis`) 까지
- 분석 완료 후 자동 S2 진입 CTA

**검증**: tsc · 실제 프로젝트 (`cmpcgyyx7000004joclxcdlgh`) 로 시각 확인

### Phase C — S2 Chat-Canvas (~2h)
- `src/components/stages/S2ChatCanvas.tsx`
- 좌 챗봇 panel — 기존 express infrastructure (`/api/express/turn` 등) 재활용
- 우 미리보기 panel — 7 섹션 카드 (mockup `.section-card`)
- 슬롯 진행도 (mockup `.slot-bar`)

**검증**: tsc · slot 진행도 표시 · chat 메시지 렌더

### Phase D — S3 Checklist+Diff (~1.5h)
- `src/components/stages/S3Checklist.tsx`
- 7 lens grid (Inspector 점수 — initially static mock, real 은 후속)
- Asset 추천 카드 (Brain matching API `/api/v1/inference/match-tuple` 호출)
- Inline diff preview (mockup `.diff` block 정확)

**검증**: tsc · 실제 Brain 데이터로 자산 추천 표시되는지

### Phase E — S4 Workspace Tabs (~1h)
- `src/components/stages/S4Workspace.tsx`
- 4 tabs (Curriculum · Coaches · Budget · Proposal)
- 각 tab 내부 — read-only 카드 (기존 Project 모델 데이터)
- Edit 버튼은 placeholder (실 구현은 후속)

**검증**: tsc · 4 tab 전환 · 데이터 표시

### Phase F — S5 Summary + 통합 (~1h)
- `src/components/stages/S5Summary.tsx`
- 3 summary cell + impact block (orange gradient) + checklist + PDF preview + final approve
- impact-forecast API 연동
- 최종 approve 시 Project.status → SUBMITTED

**v2-shell.tsx 통합**:
- 신규 5 stage 모두 wire up
- Stage 전환 로직 (현재 stage 자동 감지)

**검증**: tsc · 전체 5 stage 시나리오 한 번 끝까지

---

## 🛡️ 5중 Quality Gate (매 PR 마다)

| Gate | 통과 조건 |
|---|---|
| 1. TypeScript | `npx tsc --noEmit -p tsconfig.json` 0 errors |
| 2. 시각 검증 | Claude in Chrome 으로 deployed page screenshot · 깨진 부분 없음 |
| 3. Mockup 일치 | sub-agent (general-purpose) 가 deployed vs mockup HTML 비교 · 격차 ≥3 critical 시 fix |
| 4. 운영 영향 0 | `/projects/[id]/v2/*` 만 수정 · master 페이지 안 건드림 |
| 5. CI 그린 | Vercel deploy SUCCESS (Vercel 자체 build 성공) |

**Gate 실패 시**:
- 1·5 실패 → 즉시 hotfix
- 2·3 실패 → 격차 분석 후 fix PR
- 4 위반 → 작업 전체 revert

---

## ⛔ 절대 안 건드릴 것 (Lockdown)

- `src/app/(dashboard)/projects/[id]/page.tsx` (master 페이지)
- `src/app/(dashboard)/projects/[id]/express/*` (Express 기존)
- `src/app/(dashboard)/projects/[id]/brain/*` (W31 Brain Panel)
- `src/app/admin/brain/*` (Brain Dashboard)
- `src/app/api/cron/brain/*` (운영 cron)
- `src/app/api/v1/brain/*` (Public API)
- `prisma/schema.prisma`
- `prisma/migrations/*`
- `package.json` (deps)
- `vercel.json` (cron config)

## ✅ 작업 경로 (오직)

- `src/components/shell/*` (수정만, mockup 일치시키기)
- `src/components/stages/*` (신규 S1~S5 컴포넌트)
- `src/app/(dashboard)/projects/[id]/v2/*` (페이지 + shell wrapper)

---

## 📁 핵심 파일 위치 (Reference)

```
Mockup SSoT:
  /public/mockups/v2/
    _shared.css   ← 디자인 토큰 + shell CSS (Tailwind 변환 대상)
    index.html    ← overview
    s1.html       ← Hero center (S1 ref)
    s2.html       ← Chat-canvas (S2 ref)
    s3.html       ← Checklist+Diff (S3 ref)
    s4.html       ← Workspace tabs (S4 ref)
    s5.html       ← Summary (S5 ref)

API (재활용):
  /api/projects/[id]/rfp     ← S1 RFP 분석
  /api/express/turn          ← S2 chat (기존)
  /api/v1/inference/match-tuple ← S3 Brain matching
  /api/projects/[id]         ← S5 status 변경

Stage Components (신규):
  src/components/stages/S1HeroCenter.tsx
  src/components/stages/S2ChatCanvas.tsx
  src/components/stages/S3Checklist.tsx
  src/components/stages/S4Workspace.tsx
  src/components/stages/S5Summary.tsx

Shell Components (재배치):
  src/components/shell/TopBar.tsx       (charcoal + stage journey)
  src/components/shell/SubHeader.tsx    (사업 메타)  ← 신규
  src/components/shell/NowBar.tsx       (sticky bottom CTA)
  src/components/shell/BrainDock.tsx    (우 slide-open)
  -- StageSidebar 제거 예정

Test 프로젝트 ID (실제 데이터 검증용):
  cmpcgyyx7000004joclxcdlgh  ← 한국외대 RISE 사업단
  cmpmrq0tz000004kyvtpw3zgh  ← 다른 프로젝트

배포 URL:
  https://ud-planner.vercel.app/mockups/v2/index.html  (mockup 참고)
  https://ud-planner.vercel.app/projects/<ID>/v2       (실제 작업 결과)
```

---

## 🎨 디자인 토큰 (mockup `_shared.css` 그대로)

```
Orange family:
  --primary-orange: #E8541A  (CTA primary)
  --orange3:        #F05519  (hover)
  --action-orange:  #FF8204  (accent)

Charcoal:
  --dark-charcoal:  #373938  (TopBar, NowBar bg)
  --dark2:          #2D2D2D

Light:
  --light-beige:    #F5F0EB  (canvas bg)
  --white:          #FFFFFF
  --hairline:       #f0ede8

Success (전용):
  --green:          #2ECC71  (완료/통과만)

Text:
  --body-text:      #333333
  --subtitle-text:  #666666
  --warm-gray:      #D8D4D7
```

Tailwind 변환:
- 가능하면 기본 Tailwind class 사용 (zinc/gray/orange)
- 커스텀 hex 필요 시 `tailwind.config` 의 theme.extend.colors 활용 (있다면)
- 아니면 inline `style={{...}}` 또는 arbitrary value `bg-[#E8541A]`

---

## 🔄 PR 워크플로 (자동화)

```
1. git checkout -b feat/ux-v2-phase-X-...
2. 코드 작성 + npx tsc --noEmit (gate 1)
3. git add + git commit  ← post-commit hook 이 자동 push
4. gh pr create --base master
5. gh pr merge --merge --delete-branch
6. Vercel 자동 빌드 대기 (~1.5분)
7. Claude in Chrome 으로 deployed URL 시각 확인 (gate 2)
8. (옵션) sub-agent 로 mockup 비교 audit (gate 3)
9. 실패 시 즉시 hotfix PR
```

---

## 📊 사용자 돌아왔을 때 확인 사항

1. **5 stage 모두 작동**:
   - https://ud-planner.vercel.app/projects/cmpcgyyx7000004joclxcdlgh/v2
   - TopBar stage chip 클릭 또는 NowBar CTA 로 S1 → S2 → S3 → S4 → S5 이동 가능
2. **master 페이지 영향 0**:
   - https://ud-planner.vercel.app/projects/cmpcgyyx7000004joclxcdlgh
   - 기존 6-step pipeline 그대로 작동
3. **PR 목록** (예상 6~10개):
   - https://github.com/udpb/ud_planner/pulls?q=is%3Amerged+ux-v2
   - 모두 merged 상태
4. **운영 시스템 변화 없음**:
   - Brain Dashboard `/admin/brain` 정상
   - Cron 정상 가동 (Vercel Cron 페이지)
   - Public API `/api/v1/brain/stats` 정상

---

## ❗ 막힐 때 (사용자 부재 중)

각 phase 별 막힐 만한 케이스 + 대응:

| 케이스 | 대응 |
|---|---|
| Express infrastructure (`/api/express/turn`) 데이터 형식 불명 | S2 chat 을 mock data 로 우선 빌드, 나중에 wire up |
| Tailwind 클래스로 커스텀 색 표현 어려움 | inline `style={{ background: '#E8541A' }}` 사용 가능 |
| 기존 컴포넌트와 conflict (ScoreBar 등) | v2 페이지 안에서만 안 쓰면 OK. 새로 안 만들기 |
| TypeScript 에러 풀기 어려움 | 해당 PR drop, 별도 phase 로 분리 |
| Vercel deploy 실패 (CI fail) | Vercel logs 확인, 즉시 rollback or hotfix |
| Mock data 와 real data shape 차이 | mock 우선, 노트 남기고 다음 PR 에서 real |

**확신 안 서면**: 노트 남기고 skip — 사용자 돌아와서 결정. **추측 X**.

---

## 🚦 시작 전 확인

- [x] working tree clean
- [x] master == origin/master
- [x] post-commit hook 작동 (test push 검증됨)
- [x] git push 권한 OK
- [x] Vercel 자동 배포 OK
- [x] Mockup SSoT 안정 (PR #11~#14 모두 merged)

---

**다음 단계**: Phase A 시작. 매 phase 끝나면 `docs/journey/2026-05-27-progress.md` 에 진행 기록 누적.
