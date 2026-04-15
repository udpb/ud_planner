# UD-Ops 파이프라인 재설계 로드맵

> 상세 설계: [REDESIGN.md](REDESIGN.md)
> 마지막 업데이트: 2026-04-15

---

## 전체 진행 현황

| Phase | 이름 | 상태 | 진행률 |
|-------|------|------|--------|
| A | 골격 재구성 | 🔲 대기 | 0% |
| B | Step 1 고도화 | 🔲 대기 | 0% |
| C | 데이터 흐름 연결 | 🔲 대기 | 0% |
| D | PM 가이드 시스템 | 🔲 대기 | 0% |
| E | 내부 데이터 자동 로드 | 🔲 대기 | 0% |
| F | 안정화 + 배포 | 🔲 대기 | 0% |

---

## Phase A: 골격 재구성 (파이프라인 흐름)

> A가 끝나면: 스텝 순서가 자연스러워지고, 데이터가 스텝 간 전달됨

- [ ] **A1. 스텝 순서 변경**
  - 파일: `page.tsx`
  - 변경: rfp → ~~impact~~ → curriculum → coaches → budget → impact → proposal
  - 기존 컴포넌트 재배치 (코드 변경 최소화)

- [ ] **A2. PipelineContext 설계 + API**
  - 신규: `src/lib/pipeline-context.ts` — PipelineContext 타입 정의
  - 신규: `GET /api/projects/[id]/pipeline-context` — 전체 컨텍스트 반환
  - 변경: `page.tsx` — 로드 후 각 스텝 컴포넌트에 props로 전달

- [ ] **A3. 사이드바 정리**
  - 파일: `src/components/layout/sidebar.tsx`
  - 유지: 대시보드, 프로젝트, 설정
  - 제거: 코치 DB, 교육 모듈, 예산 기준, SROI 프록시, 피드백 관리
  - 이동: 프로젝트 내부 스텝에서 접근하도록

---

## Phase B: Step 1 고도화 (기획의 시작점)

> B가 끝나면: RFP 파싱 → 제안배경 + 컨셉 + 핵심기획포인트가 자동 생성됨

- [ ] **B1. 기획 방향 AI 생성**
  - 신규: `POST /api/ai/planning-direction`
  - 입력: RfpParsed + 발주처 유형 + 유사 프로젝트
  - 출력: 제안배경 초안 + 컨셉 후보 3개 + 핵심기획포인트 3개

- [ ] **B2. 유사 프로젝트 검색**
  - 신규: `GET /api/projects/[id]/similar`
  - 검색: 키워드/발주처/예산규모/대상자 매칭
  - 출력: 과거 프로젝트 리스트 (사업명, 예산, 수주 여부, 핵심 전략)

- [ ] **B3. 평가배점 전략 분석**
  - 신규: `src/lib/eval-strategy.ts`
  - 입력: evalCriteria
  - 출력: 최고배점 항목 + 섹션 매핑 + 가이드 메시지
  - AI 호출 없음 (규칙 기반)

- [ ] **B4. Step 1 UI 재설계**
  - 파일: `step-rfp.tsx` 대폭 수정
  - 레이아웃: 파싱 결과 | 기획 방향 (제안배경/컨셉/핵심포인트) | PM 가이드
  - PM 확정 플로우: 컨셉 선택 → 핵심포인트 조정 → "기획 방향 확정" 버튼

---

## Phase C: 스텝 간 데이터 흐름 연결

> C가 끝나면: 이전 스텝의 결정이 다음 스텝에 자동 반영됨

- [ ] **C1. 커리큘럼 AI에 기획 방향 주입**
  - 파일: `src/lib/claude.ts` — `suggestCurriculum()` 수정
  - 주입: 제안컨셉 + 핵심기획포인트 + 평가배점 가중치

- [ ] **C2. 임팩트 AI에 커리큘럼 자동 추출**
  - 파일: `src/lib/claude.ts` — `buildLogicModel()` 수정
  - 변경: Activity를 커리큘럼 세션에서 자동 추출 (PM이 수동 생성 아님)
  - 변경: Input을 코치+예산에서 자동 추출

- [ ] **C3. 제안서 AI에 전체 PipelineContext 주입**
  - 파일: `src/lib/claude.ts` — `generateProposalSection()` 수정
  - 주입: Step 1 제안배경/컨셉 + Step 2 커리큘럼 + Step 3 코치 + Step 4 예산/SROI + Step 5 임팩트

- [ ] **C4. 각 스텝 UI에서 이전 스텝 요약 표시**
  - 모든 step-*.tsx에 상단 배너 추가
  - "Step 1에서 확정한 컨셉: '...'" / "평가 최고배점: 커리큘럼 30점"

---

## Phase D: PM 가이드 시스템

> D가 끝나면: 신입 PM도 왜 이렇게 써야 하는지 이해하며 작업 가능

- [ ] **D1. 당선 제안서 패턴 DB 구축**
  - 신규: `WinningPattern` Prisma 모델
  - 데이터: 청년마을/전통문화 제안서에서 섹션별 패턴 추출
  - 각 패턴: snippet + whyItWorks + projectName

- [ ] **D2. 발주처 유형별 프리셋**
  - 신규: `ChannelPreset` Prisma 모델 또는 `src/lib/channel-presets.ts`
  - B2G: 정책 대응 + 안정적 운영 + 정량 KPI
  - B2B: 비즈니스 ROI + 속도 + 유연성
  - 재계약: 작년 성과 + 개선점 + 신뢰

- [ ] **D3. 스텝별 가이드 패널 컴포넌트**
  - 신규: `src/components/projects/step-guide-panel.tsx`
  - 내용: 평가위원 관점 + 당선 레퍼런스 + 흔한 실수 + UD 강점 팁
  - 각 step-*.tsx 우측에 배치

- [ ] **D4. 예상 점수 시스템**
  - 신규: `src/lib/predicted-score.ts`
  - 파이프라인 상단에 점수 바 표시
  - 스텝 완료마다 업데이트 (규칙 기반 + 제안서 생성 후 AI 시뮬레이션)

---

## Phase E: 내부 데이터 자동 로드

> E가 끝나면: PM이 찾으러 다니지 않아도 관련 데이터가 자동으로 올라옴

- [ ] **E1. Step 2: IMPACT 모듈 자동 추천**
  - targetStage 기반 모듈 추천 (예비→I,M / 초기→P,A / 성장→C,T)
  - UI: "추천 모듈" 사이드패널

- [ ] **E2. Step 3: 세션별 코치 자동 추천**
  - 신규: `POST /api/coaches/recommend`
  - 커리큘럼 세션 주제 → 코치 expertise 매칭 → Top 3
  - coach-finder DB 실시간 연동

- [ ] **E3. Step 4: SROI 통합 + 유사 프로젝트 예산 벤치마크**
  - SROI를 /sroi 별도 페이지 → Step 4 안으로 통합
  - 유사 프로젝트 대비 예산 비교 표시

- [ ] **E4. Step 5: 커리큘럼 → Activity/Output 자동 추출**
  - 커리큘럼 세션 → Logic Model Activity 자동 변환
  - 세션 산출물 → Output 자동 변환
  - AI는 Outcome/Impact만 생성

---

## Phase F: 안정화 + 배포

> F가 끝나면: 프로덕션 배포 완료

- [ ] **F1. 전체 E2E 테스트**
  - 양양 신활력 RFP로 Step 1~6 전체 플로우
  - 각 스텝의 데이터 흐름 검증

- [ ] **F2. 빌드 확인 + 에러 수정**
  - TypeScript 0 에러
  - Vercel 서버리스 호환 확인

- [ ] **F3. Vercel 배포 + GitHub push**
  - 프로덕션 배포
  - Google OAuth 최종 확인

---

## 참고: 새 파이프라인 흐름

```
Step 1: RFP 분석 + 기획 방향
  → 제안배경 / 컨셉 / 핵심기획포인트 / 평가전략 / 유사프로젝트
       │
       ▼
Step 2: 커리큘럼 설계
  → 트랙 구성 / 회차별 세션 / IMPACT 매핑 / 설계 근거
       │
       ▼
Step 3: 코치 매칭
  → 세션별 추천 코치 / 배정표 / 사례비
       │
       ▼
Step 4: 예산 + SROI
  → 예산 구조표 / 마진 / SROI 예측 / 벤치마크
       │
       ▼
Step 5: 임팩트 체인
  → Impact Goal / 5계층 체인 (커리큘럼에서 자동 추출) / 측정 계획
       │
       ▼
Step 6: 제안서 생성
  → 7개 섹션 (위 모든 데이터 주입)
```

## 참고: 데이터 레이어

```
Layer 1: 내부 자산 (회사 공통)
  브랜드 자산 / IMPACT 18모듈 / 코치 DB / 비용 기준 / SROI 프록시 / 당선 패턴 / 유형별 프리셋

Layer 2: 프로젝트 컨텍스트 (PipelineContext — 스텝 간 흐름)
  Step 1→2→3→4→5→6으로 누적 전달

Layer 3: 외부 인텔리전스 (AI + PM 수집)
  티키타카 리서치 / AI 생성 / 수주 전략 인터뷰
```
