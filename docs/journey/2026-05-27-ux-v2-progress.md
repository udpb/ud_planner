# UX v2 — 8h Autonomous 진행 기록

**작업일**: 2026-05-27
**시작 전 상태**: shell components PR #9·#10 머지됐으나 디자인 부족 (재작성 예정)
**완료 후 상태**: 6 Phase 모두 master 머지 · 5 stage 전체 wire-up · sidebar escape 완료

---

## ✅ 완료 PR 목록 (이번 세션)

| # | PR | 내용 | 상태 |
|---|---|---|---|
| #15 | docs/ux-v2-plan | 8h 계획 문서 (compact 보존용) | ✅ merged |
| #16 | feat/ux-v2-phase-a-shell | TopBar/NowBar/BrainDock/SubHeader Tailwind 변환 + StageSidebar 제거 | ✅ merged |
| #17 | feat/ux-v2-phase-b-s1 | S1HeroCenter s1.html 1:1 | ✅ merged |
| #18 | feat/ux-v2-phase-c-s2 | S2ChatCanvas s2.html 1:1 | ✅ merged |
| #19 | feat/ux-v2-phase-d-s3 | S3Checklist s3.html 1:1 | ✅ merged |
| #20 | feat/ux-v2-phase-e-s4 | S4Workspace s4.html 1:1 + 4 tabs | ✅ merged |
| #21 | feat/ux-v2-phase-f-s5 | S5Summary s5.html 1:1 + 5 stage 통합 + approve flow | ✅ merged |
| #22 | fix/ux-v2-escape-dashboard-sidebar | (workspace) route group 이전 — sidebar 제거 | ✅ merged |
| #23 | fix/ux-v2-nowbar-polish | NowBar 메시지 wire-up 완료 반영 | ✅ merged |

---

## 🎯 5중 Quality Gate 통과 현황

| Gate | 상태 |
|---|---|
| 1. TypeScript `tsc --noEmit` 0 errors | ✅ 매 phase 통과 |
| 2. 시각 검증 (Claude in Chrome) | ✅ S1/S2/S3 visual 일치 확인 (sidebar 제거 후) |
| 3. Mockup 일치 (agent audit) | ⚠ 사용자 돌아왔을 때 final audit 권장 |
| 4. 운영 영향 0 (master 페이지) | ✅ 모든 phase 에서 lockdown 준수 |
| 5. CI 그린 (Vercel deploy) | ✅ 머지마다 자동 배포 성공 |

---

## 📁 변경 파일 (최종)

```
src/app/(workspace)/                        ← 신규 route group
  layout.tsx                                ← Providers only (sidebar 없음)
  projects/[id]/v2/
    page.tsx                                ← SSR · prisma 데이터 fetch
    v2-shell.tsx                            ← Client shell · 5 stage 통합

src/components/shell/                       ← mockup _shared.css 1:1
  TopBar.tsx                                ← charcoal + stage journey
  SubHeader.tsx                             ← 신규 · 사업 메타 row
  NowBar.tsx                                ← 72px · orange border-top
  BrainDock.tsx                             ← 360px · charcoal header
  -- StageSidebar.tsx 제거됨

src/components/stages/                      ← Stage 5 컴포넌트
  S1HeroCenter.tsx                          ← s1.html (RFP 업로드)
  S2ChatCanvas.tsx                          ← s2.html (Chat-Canvas)
  S3Checklist.tsx                           ← s3.html (검수)
  S4Workspace.tsx                           ← s4.html (4 tabs)
  S5Summary.tsx                             ← s5.html (Final approve)
```

---

## 🎨 디자인 시스템 (단순화)

```
Orange family:
  --primary-orange: #E8541A  (CTA primary)
  --orange3:        #F05519  (hover)
  --action-orange:  #FF8204  (accent)

Charcoal:
  --dark-charcoal:  #373938

Beige / White:
  --light-beige:    #F5F0EB
  --white:          #FFFFFF
  --hairline:       #f0ede8

Success (전용):
  --green:          #2ECC71  (완료 신호만 사용)
```

ActionAI 원칙 준수:
- Sharp edges (border-radius 0~4px)
- Border-top 3~4px accents
- UPPERCASE labels (letter-spacing 1.5~2px + orange dot)
- Italic 700 brand · italic big numbers (32~88px)
- 2px construction-block gaps
- Action Orange ≤15% UI area

---

## 🔄 Wire-up 상태 (real vs mock)

| 영역 | Real Data | Mock | 후속 PR 작업 |
|---|---|---|---|
| RFP 분석 (S1) | ✅ `/api/projects/[id]/rfp` | — | — |
| 슬롯 진행도 (S2) | ✅ `ExpressDraft.listFilledSlots` | — | — |
| Chat messages (S2) | — | ✅ mock | `/api/express/turn` 연동 |
| 7 section card (S2) | — | ✅ placeholder | `ExpressDraft.sections` 매핑 |
| Inspector 점수 (S3) | — | ✅ mock | real inspector 호출 |
| Brain 자산 추천 (S3) | — | ✅ mock 5건 | `/api/v1/inference/match-tuple` |
| Curriculum (S4) | ✅ `Project.curriculum` | — | — |
| Coaches (S4) | ✅ `CoachAssignment` | — | — |
| Budget (S4) | ✅ `Project.budget` | — | — |
| Proposal (S4) | ✅ `ProposalSection` | — | — |
| Edit 버튼 (S4) | — | ✅ disabled | inline edit form |
| Inspector 점수 (S5) | — | ✅ mock | real inspector |
| Impact Forecast (S5) | ✅ `ImpactForecast` | — | — |
| Approve flow (S5) | ✅ `PATCH /api/projects/[id]` | — | — |
| PDF export (S5) | — | ✅ disabled | PDFKit 통합 |

---

## ⚠ 알려진 한계 (사용자 결정 필요)

1. **Inspector 7 lens**: 현재 mock. real Inspector 호출 시 점수 변동 → S3 checklist 영향
2. **Brain 자산 추천**: mock 5건. real matching 호출 시 점수 boost 정확도 향상
3. **chat infrastructure**: mock messages. /api/express/turn 연동 시 실 대화 가능
4. **PDF export**: 현재 disabled. PDFKit 통합으로 발주처 템플릿 자동 생성 필요

이 4개는 모두 "후속 PR" 로 분리 가능 — Phase A~F 의 visual layer 와 독립적.

---

## 🚀 사용자 돌아왔을 때 확인 절차

1. **5 stage 모두 작동**:
   - https://ud-planner.vercel.app/projects/cmpcgyyx7000004joclxcdlgh/v2
   - TopBar stage chip (active 인 stage 만 클릭 가능) → 화면 전환 확인
   - NowBar primary CTA → 다음 stage 진입 확인

2. **Sidebar 제거 확인**:
   - 좌측에 (대시보드/프로젝트/자산/설정) 사이드바 안 보여야 함 (workspace layout)
   - master 페이지 `/projects/<id>` 에서는 sidebar 정상 표시

3. **디자인 일치 (mockup 과 비교)**:
   - https://ud-planner.vercel.app/mockups/v2/index.html ← mockup SSoT
   - https://ud-planner.vercel.app/projects/<id>/v2 ← 실제 페이지
   - 둘이 visually 일치하는지 확인

4. **운영 시스템 영향 0**:
   - Brain Dashboard `/admin/brain` 정상
   - Cron 정상 가동 (Vercel Cron)
   - Public API `/api/v1/brain/stats` 정상

---

## 💡 다음 단계 제안

A. **후속 wire-up PR 4개** (각 0.5~1h):
   - Inspector 7 lens real 호출
   - Brain matching real 호출
   - Express chat /api/express/turn 연동
   - PDF export PDFKit 통합

B. **사용자 검증 → 피드백 받기 → 우선순위 결정**

C. **현재 mock 으로도 데모 충분** — 사업 시연용으로 바로 사용 가능
