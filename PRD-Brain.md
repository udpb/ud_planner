# PRD-Brain — Sphere 2 의 진화: 라이브러리 → 유기체 → 프로덕트

> **Status**: Draft v1 (2026-05-26)
> **Scope**: Sphere 2 (AI 두뇌) 의 deep architecture — 단순 자산 매칭을 넘어 **온톨로지·자가 강화·자기 인식** 까지 갖춘 완성된 brain 의 명세.
> **Companion**: PRD-v11.0.md §4 (Sphere 2) — 본 문서는 그 §4 의 5-Layer deep-dive.

---

## 0. 사용자 원문 (북극성)

> "지금 가장 중요한 건 brain 이 제대로 스스로 학습하고 강화하기 위한 것들이 계속 추가되어야 해.
> 온전히 brain 이 온톨로지처럼 하나의 완성된 프로덕트 형태가 나올 수 있을까?"

이 문장이 본 문서 전체의 기준.

---

## 1. Brain 의 정의

**Brain ≠ 데이터베이스**. Brain ≠ 검색 엔진.

Brain 은 다음 3 가지 특성을 동시에 갖춘 **유기체**:

1. **온톨로지 (Ontology)** — 개념·자산·결과가 의미 그래프로 연결됨
2. **자가 강화 (Self-Evolution)** — 사용 결과로 스스로 quality·score 학습
3. **자기 인식 (Meta-Cognition)** — 어떤 영역이 부족한지, 어떤 패턴이 잘 작동하는지 스스로 보고

PM 도구로서의 Brain 의 약속:
> "RFP 가 들어오면 단순히 비슷한 자산을 검색하는 게 아니라, **언더독스의 brain 이 PM 옆에 앉아** 어떤 사업과 비슷하고, 어떤 IP 를 인용해야 차별화되고, 비슷한 사업이 어떤 결과를 냈고, 어떤 예산 구조로 했는지, 그리고 우리가 부족한 부분은 무엇인지 알려준다."

---

## 2. 5-Layer 모델 — Brain 의 단계적 진화

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 5 — META-COGNITION (자기 인식)                       │
│   "어떤 자산이 부족한지 / 어떤 패턴이 잘 작동하는지"        │
│   • Gap 분석 (도메인·channel·section 별 자산 부족 자동 진단)│
│   • Quality dashboard (인용·수주 기여도)                    │
│   • Trend (시간 흐름의 자산 사용 패턴)                      │
│   • Recommendation (PM 에게 "다음 ingest 권장")             │
├─────────────────────────────────────────────────────────────┤
│  Layer 4 — SELF-EVOLUTION (자가 강화)                       │
│   "사용 결과로 자산 quality 자동 학습"                       │
│   • AssetUsage → 인용 → 수주 결과 → win-rate                │
│   • Time-decay (1년 미사용 → 'developing' 상태)            │
│   • Auto-merge (유사도 0.92+ 자산 통합 제안)               │
│   • Version evolution (v1 → v2 진화 추적)                  │
├─────────────────────────────────────────────────────────────┤
│  Layer 3 — ONTOLOGY (의미 그래프)                           │
│   "자산을 횡단하는 개념·관계의 네트워크"                    │
│   • Concept entity (액트프러너·ACTT·DOGS·5D 등)           │
│   • Relations (자산 ↔ 개념, 패턴 ↔ 개념)                  │
│   • Inference (RFP → concept → 자산·패턴·예산 자동 추론)   │
│   • Concept Hierarchy (액트프러너 → Act-preneur 7steps)   │
├─────────────────────────────────────────────────────────────┤
│  Layer 2 — MATCHING (의미 매칭)         ✅ 현재 완성        │
│   "RFP 와 자산 간 cosine 매칭 + MMR 다양성"                 │
│   • 3-tuple 매칭 (message · logic · content)               │
│   • 3 영역 분리 (proposal · methodology · case)            │
│   • Budget prefix 매칭                                     │
├─────────────────────────────────────────────────────────────┤
│  Layer 1 — ASSETS (자산 저장)            ✅ 현재 완성        │
│   "1,062 ContentAsset · 102 Pattern · 1,410 Budget"        │
└─────────────────────────────────────────────────────────────┘
```

### 현재 상태 (2026-05-26)

| Layer | Status | 핵심 자산 |
|---|---|---|
| Layer 1 | ✅ 완성 | WinningPattern 102 · ContentAsset 1,062 · BudgetItem 1,410 (144억원) |
| Layer 2 | ✅ 완성 | matchTuple 3 영역 분리, prefix 매칭 |
| Layer 3 | 🔄 진행 중 (W14) | Concept entity + AssetConcept 관계 (extraction 진행) |
| Layer 4 | ⏳ 설계됨 (W15-W20) | AssetUsage 활성화 + win-rate · time-decay · auto-merge |
| Layer 5 | ⏳ 설계됨 (W21-W23) | Gap 분석 · Dashboard · Concept Graph 시각화 |

---

## 3. Layer 3 — ONTOLOGY 상세

### 3.1 왜 온톨로지인가

현재 한계:
- ContentAsset 의 keyword 는 단순 문자열 ("액트프러너", "Actpreneur", "Act-Preneur" 가 별개)
- 매칭은 embedding 기반 → 의미 비슷하면 매칭되지만 **명시적 entity 연결 X**
- 자산 1 (ACTT 설명) 과 자산 2 (ACTT 실제 사용 사례) 가 "ACTT" 라는 동일 entity 로 묶여있지 않음

온톨로지 효과:
- "ACTT" 라는 Concept entity 가 있으면 → 자산 8건 · 패턴 3건 · 사용 12회 · win-rate 67% 자동 통계
- RFP 에 "ACTT" 등장 → 해당 Concept 의 모든 연결 자산 즉시 노출
- "액트프러너" 와 "Actpreneur" 가 같은 entity 의 alias → 두 표현 모두 같은 매칭

### 3.2 Schema (✅ W14 적용 완료)

```prisma
model Concept {
  id          String   @id @default(cuid())
  name        String   @unique // canonical name (예: "액트프러너")
  type        String   // 'methodology' | 'metric' | 'persona' | 'domain' |
                       // 'tool' | 'partnership' | 'framework' | 'event-type'
  description String?  @db.Text
  aliases     String[] // ["Actpreneur", "Act-Preneur", "액트프러너십"]
  embedding   Float[]  // 개념 vector

  // 계층
  parentId String?
  parent   Concept? @relation("ConceptHierarchy", ...)
  children Concept[] @relation("ConceptHierarchy")

  // 자동 통계 (Layer 4·5 가 갱신)
  assetCount   Int    @default(0)
  patternCount Int    @default(0)
  usageCount   Int    @default(0)
  winRate      Float?
  lastUsedAt   DateTime?

  assets   AssetConcept[]
  patterns PatternConcept[]
}

model AssetConcept {
  assetId   String
  conceptId String
  weight    Float   @default(1.0) // 자산에서 이 개념의 중심도
  isCore    Boolean @default(false) // 핵심 1~2개
  @@id([assetId, conceptId])
}

model PatternConcept { /* 동일 구조 */ }
```

### 3.3 Concept Type (8개)

| Type | 정의 | 예시 |
|---|---|---|
| **methodology** | 방법론·진단도구 | ACTT, AX 가이드북, 4Steps, 6Dimension, HEL Loop |
| **metric** | 평가 지표·기준 | 액트프러너십, 자립도, 만족도, 수료율 |
| **persona** | 사람·역할 | 액트프러너, 청년창업가, 예비창업가, 코치 |
| **domain** | 산업·영역 | 애그테크, 푸드테크, 핀테크, 소셜벤처, 로컬창업 |
| **tool** | 도구·기술 | AI, 노코드, 클로드코드, 커서AI, 랜딩페이지 |
| **partnership** | 발주처·파트너 | SK, CJ, 네이버, 하나금융, KAIST |
| **framework** | 프레임워크 | 린 캔버스, GEPXR, 5D, IMPACT 6단계 |
| **event-type** | 행사 유형 | 해커톤, 부트캠프, 아이디어톤, IR 피칭 |

### 3.4 자동 추출 흐름

```
ContentAsset (1,062) → batch 15개씩 → LLM 1 call
                                          ↓
                             Concept[] + AssetConcept[]
                                          ↓
                  정규화 (canonical name · aliases · embedding)
                                          ↓
                                  DB upsert
                                          ↓
                            기존 cache 보강 (다음 batch 의 정규화 hint)
```

**중요**: 첫 batch 는 cold start. 이후 batch 는 누적 cache 로 정규화 → "예창패" 가 두 번째 batch 에서 "예비창업패키지" 의 alias 로 자동 통합.

### 3.5 RFP → Concept 추론 (W15 — 다음 wave)

```
새 RFP "애그테크 청년 부트캠프"
  ↓ LLM Concept 추출
{ "애그테크" (domain), "청년창업가" (persona), "부트캠프" (event-type) }
  ↓ Concept ID 매핑
[ id_애그테크, id_청년창업가, id_부트캠프 ]
  ↓ AssetConcept join
연결된 ContentAsset: 25건 (애그테크 5 + 청년창업가 18 + 부트캠프 12, 중복 제외)
연결된 WinningPattern: 8건
  ↓ MMR 다양성
PM 에게 노출: top 5 자산 + top 3 패턴
```

→ embedding 매칭 보다 **명시적 entity 매칭**. 정확도 ↑, 설명 가능성 ↑.

---

## 4. Layer 4 — SELF-EVOLUTION 상세

### 4.1 핵심: AssetUsage 가 brain 의 심장

현재 AssetUsage 테이블 비어있음 (PM UI 미연동). Express UI 연동 시 PM 인용 이벤트가 brain 으로 흘러야 함.

**데이터 흐름**:
```
PM 이 Express 에서 자산 인용
  ↓
AssetUsage row 생성
  • assetId, projectId, sectionKey, channel, surface, createdAt
  ↓ (시간이 지남)
사업 진행 결과 (won/lost) 결정
  ↓
AssetUsage.wonProject 업데이트 (Project.isBidWon cascade)
  ↓
[Cron 매주] AssetUsage 집계
  ↓
ContentAsset.winRate · Concept.winRate 자동 갱신
  ↓
matchTuple 의 winRateBonus 가중치에 반영
```

### 4.2 Win-rate 계산 (Laplace smoothing)

```typescript
winRate = (wins + 1) / (total + 2)  // 신규 자산 보호
```

→ 처음 사용 시: 50% (중립)
→ 사용 ↑, 수주율 높음: 90% 까지 자동 상승
→ 사용 ↑, 수주율 낮음: 10% 까지 하강

### 4.3 Time-decay (자산 freshness)

```
ContentAsset.status:
  'stable' → (1년 미사용) → 'developing' → (2년 미사용) → 'archived'

자동 cron (월 1회):
  IF lastUsedAt < NOW() - INTERVAL '1 year'
  AND status = 'stable'
  THEN status = 'developing'
```

→ 오래된 자산은 자동 demote. 매칭 시 가중치 낮아짐.

### 4.4 Auto-merge (자산 중복 자동 발견)

```
[Cron 매주] ContentAsset 쌍별 embedding similarity
  WHERE similarity > 0.92
        AND assetType 동일
        AND created within 6mo (오래된 자산은 stable 가정)
  → 관리자 dashboard 에 "merge 제안" 알림
  → 승인 시 자동 merge (winner 정책 — usageCount 많은 것 keep)
```

### 4.5 Version evolution

```
ContentAsset.version (현재 default 1)

자산 업데이트 시:
  - 기존 row → status='archived', version=N
  - 신규 row → status='stable', version=N+1, parentId=기존 id
  - AssetUsage 는 그대로 (기존 v1 인용은 기록 유지)
```

→ 자산이 진화한 history 추적 가능. PM 이 "이 자산의 이전 버전" 볼 수 있음.

---

## 5. Layer 5 — META-COGNITION 상세

### 5.1 Gap 분석 — Brain 이 스스로 부족한 부분 진단

```
Brain 이 매주 cron 으로 self-check:

1) Channel × Type matrix
   B2G × methodology: 80 자산 ✓
   B2G × case:        45 자산 ✓
   B2B × methodology: 30 자산 ✓
   B2B × case:        8 자산  ⚠️ 부족
   renewal × *:       5 자산  ⚠️ 부족

2) Concept coverage
   "헬스케어" domain: 자산 2건, 패턴 0건  ⚠️ 신규 ingest 권장
   "글로벌" domain:  자산 4건, 패턴 1건   ⚠️ 신규 ingest 권장
   "ACTT" methodology: 자산 22건           ✓ 충분

3) Section coverage (제안서 7섹션)
   섹션 1 (배경)·2 (목표):    풍부
   섹션 5 (예산):              풍부
   섹션 6 (운영조직):          ⚠️ 자산 13건만
   섹션 7 (위기관리):          ⚠️ 자산 6건만

→ Dashboard: "운영조직 + 위기관리 + 헬스케어·글로벌 도메인 자산 ingest 권장"
```

### 5.2 Quality Dashboard — 자산 성과 추적

```
ContentAsset 별:
  사용 횟수 (AssetUsage count)
  수주 기여 (won 비율)
  매칭 노출 횟수 (matchTuple 에 top N 등장)
  PM 거절률 (rejectedByPm)

Concept 별:
  자산 수 / 패턴 수 / 누적 인용
  win-rate
  최근 30일 활성도

→ Brain Dashboard 의 핵심 지표
```

### 5.3 Trend 분석 — 시간 흐름의 자산 사용

```
3개월 단위 분석:
  - 어떤 Concept 의 사용이 ↑ (신규 트렌드)
  - 어떤 자산이 더 이상 인용 X (deprecated)
  - 어떤 channel 매칭 비중이 변동

→ "AI 마스터 코스" 자산 사용률 3월 5건 → 5월 23건 (↑↑)
→ "DT 액트프러너" 자산 사용률 ↓ → 유사 자산 ingest 권장
```

### 5.4 Recommendation Engine — Brain 의 자가 제안

```
매주 PM Dashboard 에 알림:
  "오늘의 brain insight"
  - "지난주 B2B 사업 수주율 60%. 그 중 80% 가 'CJ·하나금융' 패턴 인용"
  - "헬스케어 도메인 RFP 가 3건 들어왔는데 매칭 자산 0건. ingest 권장"
  - "ACTT 진단도구 인용 50건 누적, win-rate 78%. 핵심 IP 입증"
```

---

## 6. 프로덕트 형태 — Brain 의 UX

### 6.1 Brain Dashboard (관리자 UI)

```
┌──────────────────────────────────────────────────────────────┐
│  Brain Health (이번 주)                                       │
├──────────────────────────────────────────────────────────────┤
│  📚 Assets: 1,062 (proposal 653 / methodology 256 / case 153)│
│  🧠 Concepts: 142 (자동 추출, 8 type)                         │
│  🔗 Relations: 3,847 AssetConcept                            │
│  💰 Budgets: 1,410 항목 (144억원)                            │
│  🎯 Patterns: 102 unique (win 95 / pending 7)                │
│  📊 Usage (지난주): 27건 인용, 18건 수주 (66%)               │
│  ⚠️ Gap: 헬스케어·위기관리 자산 부족                          │
└──────────────────────────────────────────────────────────────┘

[ Concept Graph 보기 ]  [ Gap 상세 ]  [ Trend 차트 ]  [ Pending merge ]
```

### 6.2 Concept Graph (시각화 — D3.js)

```
        [액트프러너]
         /    |    \
      파생   기반    사용
       ↓     ↓      ↓
   [Act-7][ACTT] [20K 데이터]
              |
            검증
              ↓
          [DOGS]
        /   |   \
      한   영   일
      (다국어 자산)
```

PM 또는 brain 관리자가 마우스로 자유 탐색. "이 개념이 어떤 자산·패턴과 연결되어 있나?" 즉시 답.

### 6.3 PM 도구 (Express UI) — Brain 이 옆에 앉다

```
PM: [RFP PDF 업로드]
  ↓
Brain (3초 후):
  "이 RFP 는 '예비창업패키지 + 청년창업캠프 + 1박2일 해커톤' 패턴이에요.
   비슷한 사업 3건이 작년에 수주됐어요 (A.24.0058·A.24.0038·A.24.0047).
   인용 가능한 회사 IP 는 'ACTT (5단계 실행 루프)' 와 '20K 데이터' 가
   가장 강한 차별화에요.
   비슷한 사업 평균 예산은 1.5천만원 (인건비 32% / 운영비 28% / 강사료 14%).
   참고로, 작년 이 도메인의 결과보고서에서 '만족도 4.7/5' 가 평균이었어요."
```

→ Brain 의 4 영역 자동 통합 답변.

---

## 7. Wave Roadmap v4 (2026-05-26 — 다국어 제거)

> v4 변경: 사용자 결정 — "언어는 중요하지 않음. brain = 제안서·사업기획 핵심".
> 다국어 alignment wave 제거 (DOGS 한·영·일 통합은 별도 ad-hoc 작업으로).
> 결과: 20 wave → **19 wave** (W14~W32). 번호 1씩 당김 (W18~).

### Phase A: ONTOLOGY (Layer 3) — Wave 4개, ~1주

| Wave | 작업 | Depends | 전제 | 검증 기준 | Status |
|---|---|---|---|---|---|
| **W14** | Concept schema + 자동 추출 (1,062 자산) | — | DB 적재 완료 | Concept entity 200+, 95% asset 매핑 | ✅ (404 Concept, 97% mapped) |
| **W15** | matchTuple 에 concept 매칭 layer 추가 | W14 | Concept 100+ | RFP keyword → Concept → 자산 자동 | ✅ (애그테크 RFP +6 자산) |
| **W16** | WinningPattern → PatternConcept 자동 연결 | W14 | Pattern 102 | 모든 pattern 의 핵심 개념 자동 매핑 | 🔲 다음 |
| **W17** | Concept 간 관계 (RDF triple — co-occurrence) | W14·W16 | AssetConcept + PatternConcept | (ACTT)→(검증)→(20K 데이터) 자동 발견 | 🔲 |

### Phase B: SELF-EVOLUTION (Layer 4) — Wave 6개, ~2주

| Wave | 작업 | Depends | 전제 | 검증 기준 | Status |
|---|---|---|---|---|---|
| **W18** ⭐ | Express UI endpoint + AssetUsage 흐름 시작 | W15·Express 최소 endpoint | Express 의 자산 노출 | PM 인용 → AssetUsage row 자동 | 🔲 |
| **W19** | Win-rate auto-update cron (매주) | W18 | AssetUsage 데이터 흐름 (~2주 누적) | 자산별 winRate 자동 갱신 | 🔲 |
| **W20** | Time-decay + status auto-transition | W18 | lastUsedAt tracking | 1년 미사용 → 'developing' | 🔲 |
| **W21** | Auto-merge (similarity 0.92+, DOGS variants 통합) | W14 | Concept 변형 다수 | merge 제안 → admin 승인 흐름 | 🔲 |
| **W22** ⭐ | Concept 자가 진화 cron (신규 자산 자동 매핑) | W14 | 신규 자산 trigger | 24h 이내 AssetConcept 자동 생성 | 🔲 |
| **W23** | Asset freshness check + auto-reingest 알림 | W18·W20 | 자산 사용 history | 1년 미사용 + 같은 concept 활성 자산 있음 → 알림 | 🔲 |

### Phase C: META-COGNITION (Layer 5) — Wave 5개, ~2주

| Wave | 작업 | Depends | 전제 | 검증 기준 | Status |
|---|---|---|---|---|---|
| **W24** | Gap analyzer (channel × concept × section) | W14 | Concept 분포 | "헬스케어·위기관리 부족" 자동 보고 | 🔲 |
| **W25** ⭐ | Brain Dashboard UI (Next.js, /admin/brain) | W24 | Gap·Quality·Trend 데이터 | 통합 화면 1 페이지 | 🔲 |
| **W26** | Concept Graph 시각화 (D3.js) | W17·W25 | Relations · Dashboard | 마우스 탐색 가능 | 🔲 |
| **W27** ⭐ | Pattern outcome 사후 분석 (왜 졌나 자동 학습) | W18·W24 | 미수주 패턴 + 결과보고서 | 미수주 사업의 "missing assets" 자동 추천 | 🔲 |
| **W28** | RFP-Concept 자동 매핑 cron (Bizinfo) | W29·W24 | 외부 RFP source | 신규 도메인 자동 감지 + alert | 🔲 |

### Phase D: AUTO-INGEST (외부 자동화) — Wave 2개, ~1주

| Wave | 작업 | Depends | 전제 | 검증 기준 | Status |
|---|---|---|---|---|---|
| **W29** | 외부 자동 fetch (Bizinfo·SROI·정부 통계) | — | 외부 API 접근권 | 매일 신규 공고 fetch | 🔲 |
| **W30** | Drive watch + cron (신규 결과보고서 자동 ingest) | W18 | Drive notification | 24h 이내 자동 ingest | 🔲 |

### Phase E: PRODUCT (완성) — Wave 2개, ~1주

| Wave | 작업 | Depends | 전제 | 검증 기준 | Status |
|---|---|---|---|---|---|
| **W31** ⭐ | Express UI Brain 4+1 영역 통합 (full) | W15·W18·W25 | matchTuple + Dashboard | PM RFP 업로드 → 5초 내 통합 답변 | 🔲 |
| **W32** | Public API + 외부 노출 (Bizinfo 등 연동) | W31 | API 안정성 | 외부 시스템 사용 | 🔲 |

### 7.1 v3 → v4 매핑표 (다국어 제거)

| v4 새 # | v3 이전 # | 변경 |
|---|---|---|
| W14·W15·W16 | W14·W15·W16 | 변동 없음 |
| ~~v3 W17~~ | ~~다국어 alignment~~ | ❌ **제거** (언어 X, 제안서·사업기획 ○) |
| W17 | W18 | RDF triple — 번호 당김 |
| W18~W23 | W19~W24 | Phase B 번호 1씩 당김 |
| W24~W28 | W25~W29 | Phase C 번호 1씩 당김 |
| W29·W30 | W30·W31 | Phase D 번호 1씩 당김 |
| W31·W32 | W32·W33 | Phase E 번호 1씩 당김 |

총 wave: 20 → **19** (다국어 1 제거).

### 7.2 Critical Path (v4)

```
W14 ✅ → W15 ✅ → W16 (다음 — PatternConcept) → W17 (RDF triple)
                                                      ↓
                                             ┌────────┴────────┐
                                             ↓                 ↓
                                         W18 ⭐ (AssetUsage)  W21 (Auto-merge)
                                             ↓                 ↓
                       ┌──────┬──────┬───────┼──────┐         W22 ⭐ (자가진화)
                       ↓      ↓      ↓       ↓      ↓
                      W19    W20    W23     W30    W24
                     (Win)  (Decay)(Fresh)(Drive)(Gap)
                                                      ↓
                                                    W25 ⭐ Dashboard
                                                      ↓
                                                    W26 (Graph)
                                                      ↓
                                              ┌──────┴──────┐
                                              ↓             ↓
                                            W27 (사후)    W29 (Bizinfo)
                                                            ↓
                                                          W28 (RFP-Concept cron)
                                                            ↓
                                                          W31 ⭐ Express UI full
                                                            ↓
                                                          W32 (Public API)
```

### 7.3 Phase 별 의미

| Phase | 완성 의미 |
|---|---|
| **A (W14-W18)** | 온톨로지 완성 — 모든 자산·패턴이 entity graph 로 연결됨 |
| **B (W19-W24)** | 자가 진화 — 사용 데이터가 brain 의 quality 자동 학습 |
| **C (W25-W29)** | 자기 인식 — brain 이 자신의 부족·강점 자동 보고 |
| **D (W30-W31)** | 자가 ingest — 외부 데이터 자동 수집·통합 |
| **E (W32-W33)** | 프로덕트 완성 — PM 손에 통합 brain. 외부 노출 가능 |

---

### 7.1 Critical Path (Dependency Graph)

```
                         W14 ✅ (Concept 추출)
                         /  |  \
                       W15 W16  W29
                        |   |   /
                        |   W30
                        |   /
            ┌────────── W15 (Concept 매칭) ───┐
            ↓                                ↓
       W26-min (Express 자산                 W16 (PatternConcept)
        노출 endpoint)                         ↓
            ↓                                W21 (Gap 분석) ←──┐
       W17 ⭐ (AssetUsage 흐름 시작)               ↓             │
            ↓                                W22 ⭐ Dashboard   W32 (사후 분석)
       ┌──┼─────┐                              ↓
       ↓  ↓     ↓                            W23 (Graph 시각화)
      W18 W19  W28 🆕
      (Win) (Decay) (자가 진화)                     │
                                                    ↓
                                             W26 ⭐ Express UI 통합
                                                    ↓
                                              W24 (외부 fetch)
                                                    ↓
                                              W25 (Drive watch)
                                                    ↓
                                              W33 (RFP-Concept cron)
                                                    ↓
                                              W27 (Public API)
```

→ **Critical Path**: W14 → W15 → W17 → W18·W19·W28 → W21 → W22 → W26 (마지막 종착점)

**가장 큰 분기점**:
- W17 — Express UI 의 최소 endpoint (W26-min) 가 전제. 데이터 source 가 없으면 Layer 4 전체 의미 X
- W22 — Dashboard. "완성된 프로덕트 형태" 의 표현
- W26 — Express UI 통합. PM 가치 종착점

### 7.2 누락 wave 6개 (v2 신설) 의미

| Wave | 왜 v1 에서 누락됐나 | 왜 본질적인가 |
|---|---|---|
| **W28** Concept 자가 진화 cron | "한 번 batch 돌리면 끝" 으로 가정 | 신규 자산 ingest 시 ontology 가 자동 보강돼야 진짜 self-learning |
| **W29** 다국어 alignment | 단일 언어 가정 | DOGS 한·영·일 글로벌 확장 시 필수 |
| **W30** Concept 관계 (RDF triple) | Concept = node 만 생각 | brain 의 그래프는 노드 + 엣지. 엣지 없으면 단순 분류 |
| **W31** Asset freshness | W19 (time-decay) 와 비슷한 듯 다름 | W19 = passive 강등. W31 = active 알림 ("대체 자산 ingest 권장") |
| **W32** Pattern outcome 사후 분석 | "왜 수주" 만 학습 (W18) | "왜 졌나" 도 학습해야 진정한 meta-cognition |
| **W33** RFP-Concept 자동 매핑 | 수동 매칭 가정 | 외부 RFP 자동 ingest → 즉시 gap 보고 — 자가 ingest 의 핵심 |

→ 이 6개 wave 가 brain 의 진정한 self-learning + meta-cognition 의 핵심 메커니즘.

---

## 8. 자기 강화 루프 — End-to-End

```
새 RFP 업로드
  ↓
Brain 매칭 (4 영역: 패턴 · proposal · methodology · case · budget)
  ↓
PM 이 자산 선택·인용
  ↓
[AssetUsage] 기록  ← Layer 4 의 입구
  ↓
사업 진행 (1~6개월)
  ↓
결과 (won/lost)
  ↓
AssetUsage.wonProject 업데이트
  ↓
[Cron 매주]
  • ContentAsset.winRate 갱신
  • Concept.winRate · usageCount 갱신
  • Gap 분석 새 결과
  ↓
다음 RFP 의 매칭 가중치에 자동 반영
  ↓
신규 결과보고서 자동 ingest (Drive watch)
  ↓
새 Concept · 새 자산 자동 통합
  ↓
"오늘의 brain insight" Dashboard 알림
  ↓
PM 이 부족 자산 인지 → 신규 콘텐츠 R&D 의뢰
  ↓
ud Labs 가 자산 추가 → drive-asset-ingest 자동
  ↓
[루프]
```

→ **시간이 지날수록 brain 이 더 똑똑해지는 시스템**.

---

## 8.5 Deep Read 정책 (W14-update v2, 2026-05-26)

### 8.5.1 원칙

사용자 원문 (2026-05-26):
> "겉만 보지말고 세부 내용들을 잘 읽어야 나중에 제대로 된 톤과 context 들이 추출이 되지"
> "앞으로도 계속 문서들을 판단에서 조금이라도 중요해 보이는 문서들은 기준을 세워서 deep read 로 읽어줘"

→ Brain 의 모든 ingest 는 **Deep Read default**. 단순 요약 X, 디테일·예시·톤 보존.

### 8.5.2 자동 판단 기준 (`autoDetermineReadMode()`)

| 조건 (OR) | Mode |
|---|---|
| `assetType == 'methodology'` (방법론·IP) | **Deep** |
| `assetType == 'company'` (회사 메타) | **Deep** |
| `sourceTier == 'high'` (2026 최신 등) | **Deep** |
| `assetText.length ≥ 5,000자` | **Deep** |
| 파일명 키워드: 방법론·가이드·Manual·Session·OT·v1·v2·Textbook·체계·프레임워크·진단·설계서·기획 | **Deep** |
| 파일명 키워드: IMPACT·ACTT·DOGS·5D·GEPXR·Act-preneur | **Deep** |
| 위 조건 미해당 (짧은 case 등) | Standard |

### 8.5.3 Mode 별 spec

| 차원 | Deep (default) | Standard (간략) |
|---|---|---|
| chunks max | **15** | 5 |
| narrativeSnippet | **100~3,000자** | 50~1,500자 |
| maxTokens (LLM) | **32,768** | 16,384 |
| assetText slice | **30,000자** | 12,000자 |
| keyNumbers max | **25** | 15 |
| signaturePhrases max | **10** | 5 |
| keywords max | **25** | 15 |
| Prompt 강조 | 디테일 보존·원문 표현·슬라이드 단위 chunk | 핵심 정제 |

### 8.5.4 적용 ingester

- ✅ `local-folder-ingest.ts` (W14-update)
- ✅ `drive-asset-ingest.ts` (자동 적용 — extractAsset 호출)
- ✅ `sheet-result-report-ingest.ts` (별도 result-report-extractor 사용 — 지표·레슨 중심)
- ✅ `sheet-batch-ingest.ts` (extract-tuple 사용 — 제안서 3-tuple 별도)

→ extractAsset 호출하는 모든 ingester 가 자동으로 Deep Read 적용.

---

## 9. 비-Goals (Out of Scope)

- 인간 평가자 대체 X — brain 은 PM 의 조수, 결정자 X
- 다른 회사 의 데이터 학습 X — 언더독스 자산 한정 (private brain)
- 일반 LLM 의 chat 대체 X — 특정 매칭·추론에 특화
- 결과보고서 자동 생성 X — PM 이 작성, brain 은 인용 자산 제공

---

## 10. 성공 기준 (KPI)

| 영역 | 지표 | 목표 |
|---|---|---|
| **Ontology** | 자동 정규화율 (같은 개념 통합) | 90%+ |
| **Self-Evolution** | AssetUsage → win-rate 반영 시간 | 1주 이내 |
| **Meta-Cognition** | Gap 감지 → ingest 까지 lead time | 2주 이내 |
| **Matching** | PM 수락률 (제안 자산 중 인용된 비율) | 50%+ |
| **Business** | brain 사용 사업의 수주율 vs 미사용 | +20%p |

---

## 11. 결론

**현재 (2026-05-26)**: Layer 1·2·3 완성 — Concept 404 + AssetConcept 2,404 매핑.
**다음**: W15 (Concept 매칭) → W17 (AssetUsage) — Layer 4 시작.
**1~3개월 후**: Layer 4 + 5 — 자기 강화 + 자기 인식 = 진정한 brain.
**6개월 후**: Brain Product — Dashboard + 시각화 + 외부 자동 ingest 통합.

이 로드맵의 핵심은 **"자산 더 넣기" 가 아니라 "brain 이 스스로 진화하는 메커니즘 구축"**.

Brain 이 PM 보다 한 발 앞서서 "다음에 필요한 자산이 무엇인지" 알려주는 단계까지가 본 PRD 의 종착점.

---

## 12. 본질적 질문에 답 (사용자 의도 검증)

### Q1. "체계적 설계인가?"

✅ **Yes** — 5-Layer (Assets → Matching → Ontology → Self-Evolution → Meta-Cognition) 가 진정한 brain 의 본질 요소.
각 wave 가 어느 layer 에 속하고, 어떤 wave 가 전제·검증·결과인지 §7 의 critical path 에 명시.

### Q2. "스마트한 온톨로지 시스템에 꼭 필요한 방식인가?"

✅ **Yes** — v2 보강된 18개 wave 가 brain 의 모든 본질적 측면을 포착:
- Entity (W14·W29·W30)
- Relations (W30·W32)
- Self-learning (W17·W18·W28·W31)
- Meta-cognition (W21·W22·W32·W33)
- Auto-ingest (W24·W25·W28·W33)
- Product UX (W22·W23·W26·W27)

v1 에서 누락된 6개 (W28·W29·W30·W31·W32·W33) 가 진정한 self-learning 의 critical mechanism.

### Q3. "이게 최선인가?"

✅ **현재 알려진 최선** — 단, brain 은 진화하는 시스템이므로 v3·v4 가능. 다음 진화 단서:
- W17·W18 데이터 흐름 시작 후 → 실제 사용 패턴에 따라 priority 재조정
- W22 Dashboard 가 노출하는 gap 패턴 → 신규 wave 발견
- PM 피드백 → wave 우선순위 재배치

### Q4. "어떤 wave 가 진짜 self-learning 의 시작인가?"

→ **W18** (AssetUsage 흐름 시작, v4). 이 wave 전: brain = 정적 라이브러리. 이 wave 후: brain = 살아있는 유기체.
W18 안에 Express UI 의 최소 endpoint 포함 — 데이터 source 와 묶음.

### Q5. "어떤 wave 가 완성된 프로덕트 형태 인가?"

→ **W25** (Brain Dashboard, v4) — 자산·개념·gap·trend·quality 가 한 화면. ud Labs 가 brain 의 자기 인식을 마우스로 탐색.
+ **W31** (Express UI Brain 통합, v4) — PM 가치 종착점.

---

> **Companion Documents**:
> - [PRD-v11.0.md](PRD-v11.0.md) — 전체 제품 (Express + Deep + Sphere 2)
> - [docs/architecture/](docs/architecture/) — 아키텍처 9문서
> - [ROADMAP.md](ROADMAP.md) — Phase + Wave 체크리스트
