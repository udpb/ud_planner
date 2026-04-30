# User Flow — UD-Ops Workspace

> PM 의 PRD-v7.1 시스템 사용 흐름 — Express Track (메인) + Deep Track (보조).
> 2026-04-29 v1 — 프로덕션 가동 기준 (Phase L 100% + Phase I I2/I3/I5 + Phase J PoC).

---

## 0. 한 눈 정리

```
신규 PM 진입 → /projects/new (RFP 우선) → Express → 1차본 (30~45분)
                                          │
                                          ├─→ 1차본 승인 (markCompleted)
                                          │     └─→ 정밀화 권장 영역 패널 (Step 링크)
                                          │
                                          ├─→ 정밀 기획 (Deep) 즉시 이동 (handoffToDeep)
                                          │
                                          ├─→ 검수만 받기 (inspectDraft, 7 렌즈)
                                          │
                                          └─→ 엑셀 추출 (Phase J PoC, 5 시트)
```

---

## 1. Express Track Flow (메인)

### 1.1 진입 → RFP 자동 채움 → Express 화면

```
[1] 사이드바 「+ 새 프로젝트」
       │
       ▼
[2] /projects/new
       │
       │  ◇ "🪄 RFP 부터 — 자동으로 사업 정보 채워드려요" 카드
       │  ◇ PDF 업로드  또는  본문 붙여넣기  (둘 중 하나)
       │  ◇ [분석 시작] 클릭
       │
       ▼
[3] 백그라운드: parseRfp (Gemini → Claude fallback) ~30초
       │
       │  ◇ 사업명·발주기관·예산·기간 자동 form 채움
       │  ◇ ProgramProfile 11축 자동 추정
       │  ◇ ContentAsset 매칭 (RFP 키워드 vs 자산 키워드)
       │
       ▼
[4] [프로젝트 생성] 클릭
       │
       │  ◇ Project.expressActive = true 자동 설정
       │
       ▼
[5] redirect → /projects/[id]/express
       │
       ▼
[6] Express 단일 화면 (좌 챗봇 + 우 미리보기 + 상단 북극성 바)
```

### 1.2 챗봇 대화 → 12 슬롯 채움

```
[Express 진입]
       │
       ▼
[자동 첫 턴] AI 가 RFP 요약 + intent 후보 4개 quickReplies 제시
       │
       ▼
   ┌──── 슬롯 우선순위 ────┐
   │                       │
   │  ① intent (정체성)    │ ← 사업의 한 문장 정체성
   │  ② beforeAfter.before │ ← 교육 전 모습
   │  ③ beforeAfter.after  │ ← 교육 후 모습
   │  ④ keyMessages.0      │ ← 핵심 메시지 ①
   │  ⑤ keyMessages.1      │ ← 핵심 메시지 ②
   │  ⑥ keyMessages.2      │ ← 핵심 메시지 ③
   │  ⑦ differentiators    │ ← 차별화 자산 3+
   │  ⑧ sections.1         │ ← ① 제안 배경 및 목적
   │  ⑨ sections.2         │ ← ② 추진 전략 및 방법론
   │  ⑩ sections.3         │ ← ③ 교육 커리큘럼
   │  ⑪ sections.4         │ ← ④ 운영 체계 및 코치진
   │  ⑫ sections.6         │ ← ⑥ 기대 성과 및 임팩트
   │                       │
   └───────────────────────┘
       │
       ▼
[각 슬롯마다] PM ↔ AI 1~3 턴 대화
       │
       │  ◇ AI 가 컨텍스트 (RFP + ProgramProfile + 매칭 자산) 인용해 질문
       │  ◇ PM 답변 → AI 가 Partial Extraction → 슬롯 채움
       │  ◇ quickReplies 4~6개 (chip) — 클릭 시 prefill (편집 후 전송)
       │  ◇ 외부 카드 (3 유형) — 메시지 바로 아래 인라인:
       │     • 🌱 자동 추출 — 시스템 자동 처리 알림
       │     • 🔍 외부 LLM — 시장·통계 자료 (프롬프트 자동 생성, ChatGPT 위임)
       │     • 📞 PM 직접 — 발주처 통화 체크리스트
       │  ◇ 자동 저장 (debounced 1500ms) → DB
       │
       ▼
[우측 미리보기] 7 섹션 카드 채움 진행률 표시 (0/800 → 200/800 → 600/800 ...)
[상단 북극성 바] 5단계 진행 점 (RFP / 의도 / 차별화 / 섹션 / 1차본)
[부차 기능 1줄 박스] SROI / 예산 / 코치 / 커리큘럼 자동 추정
```

### 1.3 종료 트리거 → 4 액션 분기

```
[진행률 50%+ 도달]
       │
       ▼
[자동 종료 안내 패널 등장]  ← 본문 위, 오렌지 그라데이션
       │
       │  🎯 1차본 핵심이 채워졌어요 (N%) — 다음 단계:
       │
       ├─→ [✓ 1차본 승인 + 검수]  ← Primary 강조
       │       │
       │       ▼
       │   inspectDraft (7 렌즈) → toast 점수 + 이슈
       │       │
       │       ▼
       │   prisma.$transaction:
       │     • Project 필드 (proposalConcept / proposalBackground / keyPlanningPoints / acceptedAssetIds)
       │     • ProposalSection 7건 시드 (version=1, isApproved=false)
       │     • isCompleted=true, completedAt=now
       │       │
       │       ▼
       │   suggestDeepAreas → "정밀화 권장 영역" 패널 자동 등장
       │       │
       │       ▼  Step 1 (RFP) / Step 4 (예산) / Step 5 (임팩트) 등 추천
       │
       ├─→ [⚙ 정밀 기획 (Deep) →]
       │       │
       │       ▼
       │   handoffToDeep('rfp')
       │     • Project 필드 sync (markCompleted 와 동일)
       │     • ProposalSection 7건 시드
       │     • 즉시 router.push('/projects/[id]?step=rfp')
       │
       ├─→ [🔍 검수만 받기]
       │       │
       │       ▼
       │   inspectDraft → toast 점수만 (저장·이동 없음)
       │
       └─→ [📥 엑셀 추출] (Phase J PoC)
               │
               ▼
           GET /api/projects/[id]/export-excel
             • 5 시트: 요약 / 커리큘럼 / 코치 / 예산 / SROI
             • 한글 파일명 utf-8
             • {project.name}_제안자료.xlsx 다운로드
```

---

## 2. Deep Track Flow (정밀 기획)

### 2.1 6 Step 파이프라인 — 자동 데이터 흐름

```
[Step 1. RFP 분석 + 기획 방향]
   읽음: 없음
   씀:  context.rfp + context.strategy
       │
       ▼  자동 매칭: ContentAsset (RFP 키워드 vs 자산 keywords)
       │
[Step 2. 커리큘럼 설계]
   읽음: rfp + strategy
   씀:  context.curriculum
       │
       ▼  자동 흐름: rfpKeywords → 커리큘럼 회차 추천 + IMPACT 모듈 매핑
       │
[Step 3. 코치 매칭]
   읽음: rfp + curriculum
   씀:  context.coaches
       │
       ▼  자동 흐름: 회차별 필요 역량 → coach-finder API 호출
       │
[Step 4. 예산 설계 (② Input · ADR-008)]
   읽음: curriculum + coaches
   씀:  context.budget
       │
       ▼  자동 흐름: 코치 단가 × 회차 + AC 운영비 표준 → PC/AC/마진 산출
       │
[Step 5. 임팩트 + SROI Forecast (⑤ Outcome · ADR-008)]
   읽음: curriculum + budget + coaches + rfp
   씀:  context.impact
       │
       ▼  자동 흐름: Activity (커리큘럼) → Outcome (SROI) ← 루프 수렴점
       │
[Step 6. 제안서]
   읽음: rfp + strategy + curriculum + coaches + budget + impact (모두)
   씀:  context.proposal
       │
       ▼  자동 흐름: Express 의 sections.1~7 → ProposalSection 시드 (Step 6 진입 시 이미 들어가 있음)
```

### 2.2 각 Step 의 동반 컴포넌트

```
┌─────────────────────────────────────────────────────────────┐
│ Step 컴포넌트 (예: step-rfp.tsx)                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  좌 (메인 영역)                          우 (사이드바 280px) │
│                                                              │
│  ┌──────────────────────────────┐   ┌──────────────────────┐ │
│  │ 본 Step 의 데이터 입력·확인  │   │ PM 가이드 패널        │ │
│  │  • RFP 파싱 결과            │   │  • 4 핵심 질문        │ │
│  │  • 자산 매칭 추천            │   │  • Tips & 경고        │ │
│  │  • 기획 방향 작성            │   │  • 리서치 요청 카드   │ │
│  │  • DataFlowBanner (이전 Step│   │  • 평가표 가중치 표시 │ │
│  │    요약)                     │   │                       │ │
│  └──────────────────────────────┘   └──────────────────────┘ │
│                                                              │
│  하단: 4 게이트 검증 (Gate 1~4)                              │
│   • Gate 1 — 구조 (자동)                                     │
│   • Gate 2 — 룰 (R-001 등)                                   │
│   • Gate 3 — AI 검증 (제1원칙 4 렌즈)                        │
│   • Gate 4 — PM 확인                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 데이터 흐름 — Express 와 Deep 의 만남

### 3.1 Express → Deep 인계 시점

```
ExpressDraft (Json on Project)
       │
       │  ◇ markCompleted=true 또는 handoffToDeep=true 시 자동
       │
       ▼
mapDraftToProjectFields()
       │
       ├─→ Project.proposalConcept       ← draft.intent
       ├─→ Project.proposalBackground    ← draft.beforeAfter (Before/After 합침)
       ├─→ Project.keyPlanningPoints[]   ← draft.keyMessages
       └─→ Project.acceptedAssetIds[]    ← draft.differentiators (acceptedByPm=true)

mapDraftToProposalSections()
       │
       ▼
ProposalSection.{1..7} 시드 (version=1, isApproved=false)
       │
       │  ◇ 기존 isApproved=true 는 보존
       │
       ▼
Deep Track Step 1·6 즉시 사용 가능
```

### 3.2 자산 자동 인용 (Asset Registry)

```
[ContentAsset DB] ← 콘텐츠 담당자 (/admin/content-hub)
       │
       │  ◇ 3중 태그: applicableSections + valueChainStage + evidenceType
       │
       ▼
[matchAssetsToRfp()] — RFP 파싱 직후 자동 호출
       │
       │  ◇ keywords + ProgramProfile fit 매칭 점수
       │
       ├─→ Express: differentiators 슬롯 자동 시드 (acceptedByPm=false)
       │      │
       │      └─→ PM 토글 (수락) → narrativeSnippet 자동 sections 주입
       │
       └─→ Deep Step 1: 자산 매칭 패널 표시 + Step 6 제안서에 narrativeSnippet 인용
```

### 3.3 부차 기능 1줄 자동 인용 (Phase L4)

```
[Express 우측 미리보기 하단]
       │
       ▼
buildAutoCitations() async ← 모든 호출자 await
       │
       ├─→ citationSroi() — ContentAsset (asset-sroi-proxy-db / asset-benchmark-pattern) + ProgramProfile 휴리스틱
       │       └─→ "예상 SROI 1:3.2 (창업 교육 벤치마크 · SROI Proxy DB 16종×4국)"
       │
       ├─→ citationBudget() — CostStandard 평균 PC 단가 + estimateSessionCount
       │       └─→ "총 0.80억 · 인건비 89% · 운영비 40% · 마진 -29% ⚠"
       │
       ├─→ citationCoaches() — Coach.count(isActive) + coach-finder 외부 LLM 프롬프트 자동 생성
       │       └─→ "활성 코치 N명 — 정밀 매칭은 coach-finder"
       │
       └─→ citationCurriculum() — RFP eduStartDate~eduEndDate + IMPACT/UOR 자산 인용
               └─→ "회차 13회 · IMPACT 18 모듈 매핑"
       │
       ▼
신뢰도 칩 (높음 60+ / 중간 40+ / 추정) + Deep 링크 + 외부 프롬프트 복사 버튼
```

---

## 4. 외부 카드 3 유형 (Phase L3)

```
챗봇 대화 중 AI 가 turn 응답에 externalLookupNeeded 채우면 →
TurnBubble 안에 카드 인라인 (메시지 바로 아래 한 묶음)

┌─────────────────────────────────────────────────────────────┐
│ 🌱 자동 추출 (auto-extract)                                  │
│ 시스템이 자동 처리한 사항 알림 — PM 은 [확인] 만              │
│ 예: "Alumni Hub 자산이 ② 섹션에 인용됐어요"                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 🔍 외부 LLM (external-llm)                                   │
│ 시장·통계·정책 자료 필요 — AI 가 프롬프트 자동 생성          │
│ • [📋 프롬프트 복사] → ChatGPT/Claude desktop 에서 답변      │
│ • [외부 답 붙여넣기] → 슬롯 자동 추출 + evidenceRefs 누적    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 📞 PM 직접 (pm-direct)                                       │
│ 발주처 통화·내부 정보 영역 — 시스템이 모르는 영역            │
│ • 체크리스트 3~5개 (예: "작년 우승 제안서 마음에 든 점")     │
│ • PM 입력 자유 텍스트 → 슬롯 자동 추출                       │
└─────────────────────────────────────────────────────────────┘

마지막 AI 턴의 카드만 active. 이전 턴 카드는 opacity 50% (historical).
```

---

## 5. 검증 게이트 (Phase L5 + 기존 Gate)

```
Gate 1 — 구조 (zod schema)
   ExpressDraftSchema.safeParse(draft) — 매 자동 저장 직전
   실패 시 /api/express/save → 400 + issues 반환

Gate 2 — 룰 (각 슬롯 길이·내용)
   intent ≥ 20자 / keyMessages 3개 / differentiators ≥ 3개 등
   process-turn.extractor.ts 가 자동 검증 → ValidationError 누적

Gate 3 — AI 검수 (Phase L5)
   inspectDraft() — 7 렌즈로 평가위원 시각 분석
     market / statistics / problem / before-after / key-messages / differentiators / tone
   심각도 3: critical (평가 0점) · major (점수 손실) · minor (마감 다듬기)
   휴리스틱 백업: heuristicInspect() (LLM 실패 시 자동 fallback)

Gate 4 — 사람 (PM 최종 승인)
   "1차본 승인" 클릭 = Gate 4 통과
   이후 markCompleted=true + Deep 인계
```

---

## 6. 진입점 정리 (사이드바 + 양방향 토글)

```
┌─ 사이드바 ───────────────┐
│ 대시보드                  │
│ 프로젝트  ← 메인 진입     │
│   └ + 새 프로젝트         │
│ 자료 업로드               │
│ Content Hub  ← 콘텐츠 담당│
│ 설정                      │
└──────────────────────────┘

신규 프로젝트 생성:
  /projects/new → RFP 분석 → 자동 redirect → /projects/[id]/express
                                                  │
                                                  └─ 사이드바: 「Express」 강조

Express ↔ Deep 양방향:
  /projects/[id]/express
       │
       ├─→ "정밀 기획 (Deep) →" 버튼 (북극성 바 옆)  ← /projects/[id]?step=rfp
       │
       │
  /projects/[id]?step=rfp (Deep)
       │
       └─→ "✨ Express" 링크 (우상단)            ← /projects/[id]/express
```

---

## 7. 보안·운영 (Phase I I5)

```
[프로덕션 환경]
   • https://ud-planner.vercel.app
   • Neon PostgreSQL (ap-southeast-1, sslmode=require)
   • Gemini 3.1 Pro Preview (Primary)
   • Claude Sonnet 4.6 (Fallback)
   • NextAuth v5 + JWT 전략
   • Vercel maxDuration: 60s (proxy + functions)

[빌드 파이프라인]
   git push → GitHub webhook → Vercel auto-build
        │
        ├─→ npm install
        ├─→ prebuild: npm run check:manifest (errors 0)
        ├─→ prisma generate
        ├─→ prisma migrate deploy (Neon 자동 동기화, idempotent)
        └─→ next build → Deployment Ready

[검증 사이클 (사용자 내부 테스트)]
   1. RFP 1~2개로 Express → Deep 끝까지
   2. 발견 버그 → 알림 → fix → push → 자동 redeploy
   3. 보안 마무리: API key rotate, Neon password rotate, OAuth Redirect URIs
```

---

## 변경 이력

| 일자 | 버전 | 변경 |
|---|---|---|
| 2026-04-29 | v1.0 | 초판 — Express + Deep + 데이터 흐름 ASCII 다이어그램 (PRD-v7.1 동시 발행) |
