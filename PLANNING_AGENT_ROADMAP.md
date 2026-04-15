# Planning Agent 로드맵

> 사용자 의도까지 캡처하는 AI 공동기획자 시스템 — 격리 모듈 전략
> **결정일:** 2026-04-07
> **최신 동기화:** 2026-04-15

---

## 📌 다른 로드맵과의 관계

현재 프로젝트에는 **두 개의 병행 트랙**이 있습니다:

| 트랙 | 문서 | 다루는 범위 |
|------|------|------------|
| **파이프라인 재설계** | [ROADMAP.md](ROADMAP.md) / [REDESIGN.md](REDESIGN.md) | 6단계 파이프라인 전체 흐름 재설계 — 스텝 순서, PipelineContext, PM 가이드, 예상 점수 |
| **Planning Agent** (이 문서) | PLANNING_AGENT_ROADMAP.md | 코치 풍부화·추천 엔진·Coach Finder UI 임베드 (격리 모듈) |

**통합 지점:**
- 이 로드맵의 Phase 4(추천 엔진)는 파이프라인 재설계 Phase E2(세션별 코치 자동 추천)에 사용됨
- 이 로드맵의 Phase 5(Coach Finder UI)는 파이프라인 재설계 Step 3(코치 매칭) UI에 임베드됨
- 이 로드맵의 Phase 6 "기존 파이프라인 통합"은 파이프라인 재설계가 먼저 진행된 **새 파이프라인**에 맞춰 조정 필요

**참고:** Phase 6 상세 작업 항목은 ROADMAP.md Phase A~C 완료 후 재검토.

---

## 0. 핵심 결정사항 요약

### 무엇을 만드는가
**시니어 PM보다 좋은 기획을 뽑는 AI 공동기획자**
- ❌ 단순 검색/추천 도구 (60% 수준)
- ✅ 문답으로 의도 캡처 + 반복 개선 + 학습 루프 (95%+ 수준)

### 어떻게 만드는가
**ud-ops 안 격리 모듈로 시작 → 검증 후 통합**
- Phase 1~5: `src/lib/planning-agent/` + `(lab)/` 격리 라우트
- Phase 6에서만 기존 파이프라인 통합
- 각 Phase 끝마다 사용자 직접 검증

### 왜 이렇게 하는가
1. 인지부하 관리 (한 번에 30+ 파일 만지지 않음)
2. 기존 기능 깨질 위험 0
3. 격리된 상태에서 Agent 품질 검증 가능
4. 클린한 통합 경로

---

## 1. 인터뷰 설계 원칙

| 원칙 | 설명 |
|------|------|
| **자유 답변** | 객관식 ❌. PM의 통찰을 끌어내야 함 |
| **예시 4-5개 제공** | 답변이 어려운 PM을 도움 |
| **"잘 모름" OK** | Agent가 다른 각도로 재질문 |
| **진짜 Agent 루프** | state + reasoning + tools + termination |

### 인터뷰 예시
```
Q: 클라이언트가 (말로 안 하지만) 진짜 원하는 건 뭐라고 보시나요?

[자유 입력 박스]

💡 답변 예시:
   - "작년에 진행한 OO업체가 운영이 부실해서, 이번엔 운영 안정성을 가장 보고 있을 듯"
   - "정량 KPI보다는 졸업생 후일담, 사진 같은 정성적 자료를 원하는 분위기"
   - "내부 평가위원이 ESG 담당이라 임팩트 측정 방법론을 자세히 보고 싶어할 듯"
   - "잘 모르겠음" ← OK, AI가 다른 각도로 다시 질문함

[건너뛰기] [답변 후 다음으로]
```

---

## 2. 데이터 모델

### PlanningIntent (Agent의 메인 산출물)
```typescript
{
  // RFP에서 추출된 객관 정보
  rfpFacts: { projectName, client, budget, period, target, ... }

  // PM 인터뷰에서 캡처된 주관 정보 (핵심!)
  strategicContext: {
    whyUs: string                 // "왜 우리에게 이 사업이 왔다고 보시나요?"
    clientHiddenWants: string     // "클라이언트가 진짜 원하는 건?"
    mustNotFail: string           // "절대 실패하면 안 되는 부분"
    competitorWeakness: string    // "경쟁사 약점"
    internalAdvantage: string     // "우리 차별화"
    riskFactors: string[]
    decisionMakers: string
    pastSimilarProjects: string
  }

  // 도출된 전략
  derivedStrategy: {
    keyMessages: string[]         // 제안서 키 메시지 3-5개
    differentiators: string[]
    coachProfile: string          // 이상적 코치 프로필
    sectionVBonus: string[]       // RFP 범위 외 추가 제안
    riskMitigation: string[]
  }

  // 메타데이터
  completeness: number            // 0-100
  confidence: 'low' | 'medium' | 'high'
  turnsCompleted: number
  questionsRemaining: string[]
}
```

### 추가 모델 (Phase 2)
- `AgentSession` — 대화 상태 (history, status)
- `PMFeedback` — 학습 루프용 (PM 피드백 + 추출 패턴)
- `Coach` 풍부화 필드 (Phase 3 추가)

---

## 3. 6-Phase 로드맵

각 Phase 끝마다 사용자가 검증한 후 다음 진행.

### Phase 1: Agent 로직 (No UI, No Schema)
**기존 코드 영향: 0**

신규 파일 7개:
```
src/lib/planning-agent/
├── types.ts              # 모든 타입
├── intent-schema.ts      # PlanningIntent 스키마 + 유효성
├── question-bank.ts      # 15-20개 질문 + 4-5개 예시
├── prompts.ts            # 시스템 프롬프트 (3종)
├── tools.ts              # Agent 도구
├── state.ts              # 대화 상태 (in-memory)
└── agent.ts              # runAgentTurn 메인 함수
```

**성공 기준:** TypeScript 빌드 통과, 격리된 unit 호출 가능

---

### Phase 1.5: 격리 테스트 UI
**기존 코드 영향: 0 (신규 라우트)**

신규 파일 4개:
```
src/app/(lab)/agent-test/page.tsx     # 채팅 UI
src/app/(lab)/agent-test/chat-ui.tsx
src/app/api/agent/start/route.ts      # POST: 첫 질문 생성
src/app/api/agent/respond/route.ts    # POST: 다음 턴 진행
```

**성공 기준 (사용자 직접 검증):**
- [ ] RFP 텍스트 paste → Agent가 첫 질문 (예시 포함) 표시
- [ ] PM 자유 답변 → Agent가 다음 질문 또는 종료
- [ ] 5-10턴 후 PlanningIntent JSON 출력
- [ ] "잘 모름" 답변에도 Agent가 재질문
- [ ] Intent JSON 다운로드 가능

---

### Phase 2: 추가형 스키마
**기존 코드 영향: 최소 (마이그레이션만)**

```prisma
model PlanningIntent { ... }
model AgentSession { ... }
model PMFeedback { ... }
```

작업:
1. 3개 모델 추가
2. `npx prisma migrate dev --name "add_planning_agent_models"`
3. in-memory state → DB 영구 저장 전환
4. 세션 이어가기 기능

**성공 기준:** 대화가 DB에 저장되고, 새 탭에서 이어가기 가능

---

### Phase 3: Coach 데이터 풍부화 (Stage 0)
**기존 코드 영향: 최소 (Coach 컬럼 추가만)**

Coach 모델 추가 필드:
```prisma
domainTags         String[]
skillTags          String[]
strengthSummary    String?    @db.Text
idealProjectTypes  String[]
searchKeywords     String[]
enrichedAt         DateTime?
```

신규 파일 2개:
```
scripts/enrich-coaches.ts             # 800명 풍부화 스크립트
src/lib/planning-agent/enrich.ts      # 풍부화 프롬프트
```

작업:
1. Coach 스키마에 5개 필드 추가
2. 마이그레이션
3. 풍부화 스크립트 (Claude API, 배치 처리)
4. 800명 1회 실행 (~10분, ~$8)
5. 10명 샘플 검증

**성공 기준 (사용자 검증):**
- [ ] 800명 모두 domainTags, skillTags 채워짐
- [ ] "투자유치" 검색 → "VC", "IR", "벤처캐피탈" 코치 모두 매칭
- [ ] strengthSummary가 한 문장으로 깔끔

---

### Phase 4: 추천 엔진 (Stages 1-4)
**기존 코드 영향: 0 (격리 API)**

신규 파일 4개:
```
src/lib/planning-agent/
├── recommend.ts          # 추천 메인 함수
├── scoring.ts            # 정형 점수
└── rerank.ts             # Claude 의미적 재랭킹

src/app/api/agent/recommend/route.ts
```

**5단계 추천 흐름:**

| Stage | 작업 | 결과 |
|-------|------|------|
| 1 | PlanningIntent → Claude → 검색 쿼리 풍부화 | core_competencies, domain_keywords, archetype |
| 2 | PostgreSQL 정형 필터 | 800 → ~200명 |
| 3 | 정형 점수 계산 (domainTags, skillTags, 티어, 만족도, 연차, 지역) | 200 → Top 50 |
| 4 | Claude 의미적 재랭킹 (요약 + 컨텍스트) | 50 → Top 10 + 이유 |
| 5 | 결과 + 4중 지원 체계 매핑 | Final |

**성공 기준 (사용자 검증):**
- [ ] 동일 RFP, 다른 시나리오 → 다른 추천
- [ ] "왜 이 코치인지" 설명이 구체적
- [ ] PM 피드백 → 재추천 즉시 반영

---

### Phase 5: Coach Finder UI 임베드
**기존 코드 영향: 0 (격리 라우트)**

원본 위치:
```
C:\Users\USER\.gemini\antigravity\scratch\underdogs-coach-finder\client\src\components\
├── FilterPanel.tsx      ← 그대로
├── CoachCard.tsx        ← 그대로
├── CoachDetailModal.tsx ← 그대로
├── AiRecommendModal.tsx ← API만 swap
└── SelectionBar.tsx     ← 그대로
```

신규 위치:
```
src/components/coach-finder/   # 5개 컴포넌트
src/app/(lab)/coach-finder/
└── page.tsx
```

작업:
1. 5개 컴포넌트 복사
2. Wouter → Next.js navigation
3. Firebase 데이터 → PostgreSQL API
4. AI Recommend Modal → `/api/agent/recommend` 연결
5. 격리 라우트 `/coach-finder`에서 동작

**성공 기준 (사용자 검증):**
- [ ] 800명 코치 그리드 표시
- [ ] 필터 패널 작동
- [ ] 코치 카드 클릭 → 상세 모달
- [ ] AI Recommend → 추천 결과 표시
- [ ] ud-ops 디자인과 어울림

---

### Phase 6: 기존 파이프라인 통합
**여기서 처음으로 기존 코드 수정**

작업:
1. **RFP 스텝**: 파싱 후 → Planning Agent 인터뷰 트리거
2. **임팩트 스텝**: derivedStrategy 사용 (목표 후보 생성)
3. **커리큘럼 스텝**: PlanningIntent 주입, 세션별 코치 추천
4. **코치 스텝**: 단순 테이블 → Coach Finder UI 전면 교체
5. **제안서 스텝**: keyMessages, sectionVBonus 주입
6. **품질 등급**: 70점 스코어카드에 C/B/A/S 등급 + 가이드

**성공 기준:** 신규 프로젝트 → RFP → 인터뷰 → 모든 스텝이 의도 알고 작동

---

## 4. 일별 작업 체크리스트

### Day 1-2: Phase 1 (Agent 로직)
- [ ] Step 1.1: types.ts
- [ ] Step 1.2: intent-schema.ts
- [ ] Step 1.3: question-bank.ts (15-20개 질문 + 예시)
- [ ] Step 1.4: prompts.ts (3종 프롬프트)
- [ ] Step 1.5: tools.ts
- [ ] Step 1.6: state.ts (in-memory)
- [ ] Step 1.7: agent.ts (runAgentTurn)
- [ ] Step 1.8: 빌드 체크

### Day 2-3: Phase 1.5 (테스트 UI)
- [ ] Step 1.5.1: /api/agent/start
- [ ] Step 1.5.2: /api/agent/respond
- [ ] Step 1.5.3: (lab)/agent-test/page.tsx
- [ ] Step 1.5.4: 사용자 검증 (RFP 1개, 5-10턴)

### Day 3-4: Phase 2 (스키마)
- [ ] Step 2.1: PlanningIntent 모델
- [ ] Step 2.2: AgentSession 모델
- [ ] Step 2.3: PMFeedback 모델
- [ ] Step 2.4: 마이그레이션
- [ ] Step 2.5: in-memory → DB 전환
- [ ] Step 2.6: 세션 이어가기

### Day 4-5: Phase 3 (코치 풍부화)
- [ ] Step 3.1: Coach 스키마 5개 필드
- [ ] Step 3.2: 마이그레이션
- [ ] Step 3.3: enrich.ts
- [ ] Step 3.4: scripts/enrich-coaches.ts
- [ ] Step 3.5: 800명 실행 (~10분, ~$8)
- [ ] Step 3.6: 10명 샘플 검증

### Day 5-7: Phase 4 (추천 엔진)
- [ ] Step 4.1: scoring.ts
- [ ] Step 4.2: rerank.ts
- [ ] Step 4.3: recommend.ts
- [ ] Step 4.4: /api/agent/recommend
- [ ] Step 4.5: 3개 시나리오 검증
- [ ] Step 4.6: PMFeedback 처리

### Day 7-9: Phase 5 (UI 임베드)
- [ ] Step 5.1: 5개 컴포넌트 복사
- [ ] Step 5.2: Wouter → Next.js
- [ ] Step 5.3: 데이터 소스 swap
- [ ] Step 5.4: AI Recommend 연결
- [ ] Step 5.5: /coach-finder 라우트
- [ ] Step 5.6: 시각/UX 검증

### Day 9-12: Phase 6 (통합)
- [ ] Step 6.1: RFP 스텝 강화
- [ ] Step 6.2: 임팩트 스텝 강화
- [ ] Step 6.3: 커리큘럼 스텝 강화
- [ ] Step 6.4: 코치 스텝 교체
- [ ] Step 6.5: 제안서 스텝 강화
- [ ] Step 6.6: 품질 등급 (C/B/A/S)
- [ ] Step 6.7: 회귀 테스트

---

## 5. 위험 관리

| 위험 | 대응 |
|------|------|
| Agent 대화 품질 낮음 | Phase 1.5에서 검증 → 질문/프롬프트 튜닝 |
| 풍부화 비용 폭주 | 배치 + 캐싱 + enrichedAt으로 부분 재실행 |
| Phase 6 통합 시 회귀 | 격리 라우트는 통합 후에도 유지 (롤백 가능) |
| Claude API rate limit | 배치 사이 sleep + 재시도 로직 |
| PM 답변 너무 짧음 | Agent가 답변 깊이 평가 → 재질문 |

---

## 6. 핵심 원칙 (반복 확인)

1. **격리 우선** — Phase 6 전까지 기존 코드 손대지 않음
2. **검증 후 전진** — 각 Phase 끝에 사용자 직접 검증
3. **자유 답변 인터뷰** — 객관식 ❌, 예시 포함 자유 답변 ⭕
4. **진짜 Agent** — 단발 호출 ❌, state+reasoning+tools+termination ⭕
5. **품질 목표** — 시니어 PM 수준 95%+

---

## 시작하려면

```bash
# 1. 현재 작업 stash (있다면)
git stash

# 2. 새 브랜치
git checkout -b feature/planning-agent

# 3. Phase 1 시작 — Claude에게:
"Phase 1 시작. PLANNING_AGENT_ROADMAP.md Day 1-2 체크리스트 따라 진행해줘.
Step 1.1부터 1.8까지 순서대로."
```

각 Phase가 끝나면 반드시 사용자 검증 → 그 다음 진행.
