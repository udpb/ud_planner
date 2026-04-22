# 프로그램 프로파일 — 사업 스펙트럼 축 체계 v1.1

> **버전:** v1.1 (확정)
> **확정일:** 2026-04-20
> **확정 근거:** 사용자 Q1~Q12 답변 + 2024-11 교육 콘텐츠 분류 체계 엑셀 참조 + v1.0 사용자 피드백 ("4중지원체계 무슨 말인지 모르겠다")
> **연관:** [ADR-006](../decisions/006-program-profile.md) · [modules.md](./modules.md) · [data-contract.md](./data-contract.md) · [prisma/schema.prisma](../../prisma/schema.prisma)
> **이전:** v1.0 (2026-04-20, Part 6 Q1~Q12 확정) → v1.1 (축 8 재설계)

---

## 🆕 v1.1 변경 요약 (2026-04-20)

### 왜 재설계했나
v1.0 의 `supportStructure.mainType` 5 enum("4중지원체계·공모_심사_컨설팅·장인_교류·매칭_멘토링·커스텀") 은 PM 에게 **"무슨 말인지 모르겠다"** 는 피드백을 받았다. 용어가 사업 과업 구성을 드러내지 못하고 특수 사례(장인·매칭) 를 상위 enum 에 고정시켜 확장성이 낮았다.

### 무엇이 바뀌었나
1. **축 8 재설계** — `mainType` enum 제거. 대신 **과업 유형 6종 multi-select** (`tasks: ProjectTaskType[]`) 로 교체.
2. **과업 유형 6종** — 언더독스 실무 분해 기반:
   - `모객` · `심사_선발` · `교류_네트워킹` · `멘토링_코칭` · `컨설팅_산출물` · `행사_운영`
3. **RFP 자동 감지** — `parseRfp()` 프롬프트에 지시 추가, 응답에 `detectedTasks: ProjectTaskType[]` 포함. `step-rfp.tsx` 가 Panel 초기값에 자동 주입.
4. **fourLayerSupport: boolean 유지** — 언더독스 고유 자산 "4중 지원 체계" 는 제거하지 않고 독립 boolean 으로 유지. 설명은 UI 툴팁에 담긴다.
5. **유사도 가중치 재배분** — `tasks` 0.10 신규, `methodology` 0.25→0.22, `businessDomain`/`targetStage` 각각 0.15→0.13, `scale` 0.05→0.04, `primaryImpact` 0.05→0.03. 합 = 1.0 유지.
6. **Gate 3 새 경고** — `tasks-empty`: 과업이 비었을 때 "과업 이해도" 배점 감점 위험 경고.
7. **특수 사례 enum 상위 레벨에서 제거** — "장인"·"매칭"·"공모전" 같은 특수성은 이미 `methodology.primary` (로컬브랜드·글로컬·공모전설계·매칭) 에서 표현되므로 중복 제거.

### 마이그레이션 영향
- `normalizeProfile()` 이 v1.0 프로파일의 legacy `mainType` 필드를 **무시**하고 `tasks: []` 로 기본화. 버전을 자동으로 `1.1` 로 승격.
- 10+50 시드는 `tasks` 로 치환되어 재시드 시 자동 반영.
- UI: 핵심 축이 4개 → **5개** 로 (`발주처 · 대상 · 과업 유형 · 방법론 · 심사`).

---

## 🎯 이 문서가 해결한 것

언더독스 과업 스펙트럼이 넓어서 기존 `WinningPattern.channelType` 1축으로는 "B2G 청년창업 데모데이"와 "B2G 로컬상권 오프라인"을 같은 패턴으로 취급하던 문제. 사업의 성격을 **11개 축**으로 분해해서 AI 매칭·가이드 시스템이 "가까운 사례"를 정확히 찾을 수 있게 합니다.

---

## ⚡ v1.1 한눈 요약

- **축 11개 (+과업 유형 하위 축 1개)** — 대상 3축 · 규모 · 포맷 · 운영 · 지원구조(**과업 유형 multi-select** + 4중 지원 boolean) · 방법론 · 심사 · 발주처 · 임팩트 · 사후관리
- **엑셀 분류 기반** — 비즈니스 분야 19종 / 대상 7종 / 지역성 6종 / 교육 주제 13종 을 그대로 활용
- **자동 연동** — 중복 필드(예: formats.공모전 ↔ selection.공모전형)는 자동 동기화
- **RFP 자동 감지 (v1.1)** — `parseRfp()` 가 과업 유형 6종을 RFP 본문에서 추출해 Panel 초기값으로 주입
- **Q9 연속사업 특례** — `renewalContext` 필드가 **필수** (작년 레슨런 + 성과 + 개선영역)
- **Q10 복수 임팩트** — `primaryImpact` 배열 (최대 3개)

---

## 📋 목차

1. [Part 1. 축 맵 — 한 화면 요약](#part-1-축-맵)
2. [Part 2. 축별 상세 (11축)](#part-2-축별-상세)
3. [Part 3. 8케이스 회고 태깅](#part-3-8케이스-태깅)
4. [Part 4. UI 입력 플로우](#part-4-ui-입력-플로우)
5. [Part 5. 시스템 반영 방안](#part-5-시스템-반영-방안)
6. [Part 6. v0.1 Q&A 결과](#part-6-q-and-a-결과)

---

<a id="part-1-축-맵"></a>
## Part 1. 축 맵 — 한 화면 요약

| # | 축 | 타입 | 값 개수 | Q&A |
|---|---|---|---|---|
| **1** | `targetStage` 창업 단계 | enum | 6 | Q1 |
| **2** | `targetSegment.demographic` 대상 인구 | multi-enum | 7 | Q1, Q2 |
| **3** | `targetSegment.businessDomain` 비즈니스 분야 | multi-enum | 19 | Q2 |
| **4** | `targetSegment.geography` 지역성 | enum | 6 | Q2 |
| **5** | `scale` 사업 규모 | object | - | Q3 |
| **6** | `formats` 프로그램 포맷 | multi-enum | 8+ | Q4 (향후 확장) |
| **7** | `delivery` 운영 방식 | object | - | Q5 |
| **8** | `supportStructure` 지원 구조 (**v1.1 재설계**) | object | — | Q6 → v1.1 재설계 |
| **8a** | `supportStructure.tasks` 과업 유형 ⭐ (v1.1 신규, RFP 자동감지) | multi-enum | **6** | v1.1 |
| **8b** | `supportStructure.fourLayerSupport` 4중 지원 체계 | boolean | — | Q6 |
| **9** | `methodology` 방법론 ⭐ | enum | 9 | Q7 |
| **10** | `selection` 심사·선발 ⭐ | object | - | Q8 (자동 연동) |
| **11** | `channel` 발주처 + `renewalContext` | object | - | Q9 (renewal 필수 필드) |
| **12** | `primaryImpact` 주 임팩트 (복수) | multi-enum | 5+ | Q10 |
| **13** | `aftercare` 사후관리 | object | - | Q11 |

---

<a id="part-2-축별-상세"></a>
## Part 2. 축별 상세

### 🧑 축 1. 대상자 단계 `targetStage`

> 수혜자가 창업·사업 여정의 어느 단계에 있는가. **엑셀의 "창업 단계" 축 준용**.

```typescript
targetStage:
  | '예비창업_아이디어무'
  | '예비창업_아이디어유'
  | 'seed'           // 창업 0~1년
  | 'pre-A'          // 창업 1~3년
  | 'series-A이상'   // 성장 단계
  | '소상공인'        // 이미 운영 중
  | '비창업자'        // 상인·장인·임직원·디자이너 등 (Q1)
```

**Q1 반영:** `비창업자` 를 값으로 유지. 세분화는 `targetSegment.demographic` 태그로 흡수 (상인/장인/임직원/디자이너).

---

### 👥 축 2. 대상 인구 `targetSegment.demographic`

> 누구를 대상으로 하는가. **엑셀의 "대상" 축 준용 + 비창업자 세부 추가**.

```typescript
demographic: Array<
  | '무관'
  | '여성'
  | '청소년'
  | '대학생'
  | '시니어'
  | '임직원'
  | '상인'          // 신규 (로컬상권)
  | '장인'          // 신규 (공예·문화)
  | '디자이너'      // 신규 (공모전)
  | '일반소상공인'   // 신규
>
```

**Q1·Q2 반영:** 엑셀 6종 + 비창업 도메인 3종 추가.

---

### 🏢 축 3. 비즈니스 분야 `targetSegment.businessDomain`

> 어떤 산업·도메인인가. **엑셀 "비즈니스 분야" 19종 그대로**.

```typescript
businessDomain: Array<
  | 'ALL'
  | '식품/농업' | '문화/예술' | '사회/복지' | '여행/레저' | '교육'
  | '유통/커머스' | '제조/하드웨어' | 'IT/TECH' | '바이오/의료'
  | '환경/에너지' | '피트니스/스포츠' | '부동산/건설'
  | '모빌리티/교통' | '홈리빙/펫' | '인사/법률/비즈니스'
  | '금융/재무/보험' | '미디어/엔터테인먼트' | '핀테크' | '기타'
>
```

**Q2 반영:** 3축 세분화 (인구 · 도메인 · 지역). enum 고정. 자주 쓰이는 건 UI 자동완성 상위 노출.

---

### 🌍 축 4. 지역성 `targetSegment.geography`

> 사업 대상 지역 범위. **엑셀 "지역" 축 준용**.

```typescript
geography:
  | '일반'                  // 전국·지역 무관
  | '로컬'                  // 특정 지역
  | '글로벌_한국인바운드'   // 한국 들어오는 해외
  | '글로벌_공통'           // 언어 무관
  | '일본'
  | '인도'
```

---

### 💰 축 5. 사업 규모 `scale`

> **Q3 답변 반영: 1억 미만 / 1-3억 / 3-5억 / 5억 이상**

```typescript
scale: {
  budgetKrw: number,
  budgetTier: '1억_미만' | '1-3억' | '3-5억' | '5억_이상',  // 자동 계산
  participants: '20명_이하' | '20-50' | '50-100' | '100+',
  durationMonths: number,
}
```

---

### 🎪 축 6. 프로그램 포맷 `formats`

> 커리큘럼 외 이벤트·구성요소. **Q4: 현재 값 유지, 향후 확장.**

```typescript
formats: Array<
  | '데모데이' | 'IR' | '네트워킹' | '합숙'
  | '해외연수' | '박람회/전시' | '페스티벌/축제' | '공모전'
>
```

`공모전` 선택 시 `selection.style='공모전형'` 자동 동기화 (Q8).

---

### 💻 축 7. 운영 방식 `delivery`

> **Q5 반영:** LMS 필수 아니지만 사용 권장 (기본값 `true`).

```typescript
delivery: {
  mode: '온라인' | '오프라인' | '하이브리드',
  usesLMS: boolean,      // 기본값 true — 언더독스 기본 자산
  onlineRatio: number,   // 하이브리드일 때 0~100
  usesAICoach: boolean,  // EduBot 활용 여부 (신규, v1.0)
}
```

**v1.0 추가:** `usesAICoach` — EduBot(AI 챗봇) 활용 여부. 2024년말 분류에 없던 축.

---

### 🤝 축 8. 지원 구조 `supportStructure` (v1.1 재설계)

> **v1.1 재설계:** v1.0 `mainType` 5 enum 제거 → **과업 유형 6종 multi-select** + `fourLayerSupport` boolean 유지. "장인·매칭" 같은 특수 사례는 `methodology.primary` 로 흡수.

```typescript
supportStructure: {
  // 과업 유형 (v1.1 신규) — RFP 파싱에서 자동 감지
  tasks: Array<
    | '모객'             // 참여자 모집·홍보 — "모집 전략" 배점
    | '심사_선발'        // 공모·심사·선정 — "심사·선정 설계" 배점
    | '교류_네트워킹'    // 기수 내·외부 네트워킹 — "차별화 · 파트너 자산" 배점
    | '멘토링_코칭'      // 1:1·팀 코칭 — "수행 역량 · 4중 지원 증명" 배점
    | '컨설팅_산출물'    // deliverable (보고서·실물·디자인) — "수행 능력 · 산출물" 배점
    | '행사_운영'        // 데모데이·박람회·페스티벌 — "운영 역량·집객" 배점
  >,

  // 언더독스 고유 자산 — 제거하지 않고 독립 boolean 유지
  fourLayerSupport: boolean,           // 전문멘토 + 컨설턴트 풀 + 전담 코치 + 동료 네트워크

  coachingStyle: '1:1' | '팀코칭' | '혼합' | '해당없음',
  externalSpeakers: boolean,
  externalSpeakerCount: number,

  // 비창업 사업 보조 필드 (v1.0 부터 유지)
  nonStartupSupport?: {
    coordinationBody?: string,         // 상권강화기구 · 운영사무국 등
    domainPartners?: string[],         // 장인 네트워크 · 유통 MD 등
    matchingOperator?: boolean,        // 매칭형 사업의 운영자
  },
}
```

**v1.1 RFP 자동 감지 플로우:**
1. `parseRfp(text)` 프롬프트가 과업 유형 6 enum 을 요구 → `RfpParsed.detectedTasks: ProjectTaskType[]` 반환
2. `api/ai/parse-rfp` POST → 응답 body 에 `detectedTasks` 통과 (JSON 그대로 저장)
3. `step-rfp.tsx` 의 `mergeDetectedTasksIntoProfile()` 이 `programProfile.supportStructure.tasks` 가 비었을 때만 `detectedTasks` 를 주입 (PM 저장값 보존)
4. PM 이 ProgramProfilePanel 의 핵심 축 ③ 에서 최종 확인·보정

**Gate 3 경고 `tasks-empty` (v1.1):** `tasks` 배열이 비면 "과업 이해도" 배점(통상 15~25%) 감점 경고.

---

### 🧭 축 9. 방법론 `methodology` ⭐

> **Q7 반영: enum 세분화 + 장기 ASSET 전환 경로**

```typescript
methodology: {
  primary:
    | 'IMPACT'           // IMPACT 18모듈 (창업교육 기본)
    | '로컬브랜드'       // 상권강화기구 + 브랜딩 액션러닝
    | '글로컬'           // 지역 × 글로벌 교류 (안성형)
    | '공모전설계'       // 다단계 심사 + 사후유통 (한지·관광)
    | '매칭'             // 멘토-수혜자 매칭 (코오롱형)
    | '재창업'           // 실패 분석 + 재설계
    | '글로벌진출'       // Born Global (예비글로벌형)
    | '소상공인성장'     // 매장 리뉴얼 · 매출 개선
    | '커스텀',           // 위에 맞지 않는 고유 설계
  impactModulesUsed: string[],      // 실제 사용 IMPACT 모듈 코드
  customFrameworkName?: string,     // 커스텀일 때만
}
```

**설계 결정 (Q7):** enum 시작 + 커스텀 자유도는 `customFrameworkName` 문자열로. 방법론이 15개+로 늘거나 외부 파트너 방법론이 필요해지면 `MethodologyFramework` ASSET 테이블로 이관.

**시스템 영향:**
- `methodology.primary != IMPACT` 일 때 `static-content.ts:44` "IMPACT 미매핑 경고" **비활성화**
- 커리큘럼 AI 프롬프트 분기 (Part 5.3 참조)

---

### 🎯 축 10. 심사·선발 `selection` ⭐

> **Q8 반영: formats.공모전 과 자동 연동**

```typescript
selection: {
  style: '서류' | '서류+PT' | '서류+PT+심층면접'
       | '공모전형' | '선정형_비경쟁' | '대중심사_병행',
  stages: number,                    // 심사 단계 수
  competitionRatio: '낮음_1:2이하' | '중간_1:3-5' | '높음_1:6+' | '미공개',
  publicVoting: boolean,
  publicVotingWeight: number,        // 대중심사 가중치 %
  evaluatorCount: number,
}
```

**자동 연동 규칙 (Q8):**
- `formats` 에 `공모전` 포함 → `selection.style = '공모전형'` 자동 설정
- `selection.publicVoting = true` → `selection.style = '대중심사_병행'` 자동 설정
- UI 에서 어느 한쪽 수정 시 다른 쪽 즉시 동기화

---

### 🏛️ 축 11. 발주처 + 연속사업 컨텍스트 `channel` ⭐

> **Q9 반영: renewal 플래그 + renewalContext 필수 필드**

```typescript
channel: {
  type: 'B2G' | 'B2B',              // Q9: 두 값만 유지
  clientTier:
    | '중앙부처' | '광역지자체' | '기초지자체' | '공공기관'
    | '대기업' | '중견기업' | '중소기업' | '재단',
  isRenewal: boolean,                // Q9: renewal 플래그
  renewalContext?: RenewalContext,   // Q9: isRenewal=true 일 때 필수
}

// ⚠️ isRenewal=true 일 때 이 객체가 없으면 Gate 3 가 블로킹
interface RenewalContext {
  previousRoundNumber: number,       // 몇 기수째인가 (GS=8 예정)
  lastYearKPI: {                     // 작년 핵심 성과
    metric: string,
    target: number,
    actual: number,
    unit: string,
  }[],
  lastYearLessons: string,           // 작년 레슨런 (필수)
  aspectsToImprove: string[],        // 개선 영역 (필수, 최소 2개)
  aspectsToKeep: string[],           // 유지할 우수 요소
}
```

**설계 결정 (Q9):** 연속사업은 **작년 레슨런·성과가 없으면 제안서 작성 자체를 시작하지 못하게** 시스템이 블로킹. "처음 뵙는" 어조 방지 + 재계약 전용 평가 기준 대응.

---

### 🌟 축 12. 주 임팩트 `primaryImpact`

> **Q10 반영: 복수 선택**

```typescript
primaryImpact: Array<
  | '고용창출'
  | '매출/판로'
  | '투자유치'
  | '지역활성화'
  | '역량개발'
  | '글로벌확장'    // 신규 (안성·글로벌 케이스 반영)
  | '사회적가치'    // 신규 (프로보노·CSR 반영)
>  // 최소 1개, 최대 3개
```

---

### 🔄 축 13. 사후관리 `aftercare`

> **Q11 반영: tierCount 유지, 나중에 고도화**

```typescript
aftercare: {
  hasAftercare: boolean,
  scope: Array<
    | '투자연계' | 'alumni네트워크' | 'IR지원' | '해외진출'
    | '유통입점' | '진단지속' | '코치지속'
  >,
  tierCount: number,   // 한지 4단 사후관리 → 4
}
```

---

<a id="part-3-8케이스-태깅"></a>
## Part 3. 8케이스 회고 태깅 매트릭스 (v1.0 반영)

| 축 | NH 애그테크 | GS리테일 (8기) | 코오롱 프로보노 | 서촌 | 관광기념품 | 한지 | 안성 | 예비글로벌 |
|---|---|---|---|---|---|---|---|---|
| **targetStage** | 예비+seed | seed+pre-A | 비창업자 | 비창업자 | 일반 (기업) | 비창업자 | 비창업자 | 예비_아이디어유 |
| **demographic** | 무관 | 무관 | 임직원+소셜섹터 | 상인 | 기업 | 디자이너+장인 | 장인 | 청년+무관 |
| **businessDomain** | 식품/농업 | 유통/커머스 | ALL | 유통/커머스 | 제조/하드웨어+관광 | 문화/예술+디자인 | 문화/예술 | ALL |
| **geography** | 일반 | 일반 | 일반 | 로컬 | 일반→글로벌 | 일반→글로벌 | 로컬→글로벌 | 글로벌_공통 |
| **scale.tier** | 5억_이상 | 3-5억 | 1-3억 | 5억_이상 (5.39) | 5억_이상 (13.2) | 1억_미만 | 5억_이상 (6.5) | 추정 3-5억 |
| **formats** | 데모데이 | 네트워킹 | 네트워킹 | 네트워킹+축제 | 공모+박람회+해외연수 | 공모+전시 | 해외연수+페스티벌 | 해외연수+IR |
| **delivery** | 하이브 LMS AI | 하이브 LMS AI | 하이브 LMS | 오프 | 하이브 LMS | 오프 | 오프 | 하이브 LMS |
| **methodology** | **IMPACT** | **IMPACT+소상공인** | **매칭** | **로컬브랜드** | **공모전설계** | **공모전설계** | **글로컬** | **글로벌진출** |
| **selection** | 서류+PT | 서류+PT | 서류 | 선정형 | 공모전 3단 | 공모전+대중심사 | 선정형 | 서류+PT |
| **channel** | B2G/공공 | B2B/대기업 **renewal=true (8기)** | B2B/대기업 | B2G/기초 | B2G/공공 | B2G/공공 | B2G/기초 | B2G/중앙 |
| **primaryImpact** | 역량개발+매출 | 매출/판로+사회적가치 | 역량개발+사회적가치 | 지역활성화 | 매출/판로+글로벌 | 매출/판로 | 지역활성화+글로벌 | 투자유치+글로벌 |

### v1.0 태깅이 드러낸 것

1. **IMPACT 사용 3건 / 총 8건** (37.5%) — 기본값 가정이 현실과 불일치 확정
2. **비창업자 대상 5건** (62.5%) — 창업교육 중심 설계 편향 확정
3. **GS리테일 = renewal=true** — `renewalContext` 시스템 필수 적용 케이스
4. **글로벌 축 3건** (관광/안성/예비글로벌) — `geography` 분리의 실용성 확인
5. **공모전설계 2건** (관광/한지) — 방법론 enum 분리 정당성 확인

---

<a id="part-4-ui-입력-플로우"></a>
## Part 4. UI 입력 플로우 (요약)

### 3단계 입력

```
Step 1 RFP 파싱 → 🤖 AI 자동 프로파일 추론 → PM 교정
     ↓
프로파일 패널 (Step 1 우측)
  ┌ 핵심 4축 (항상 펼침)
  │  ① 발주처  [B2G/B2B] [clientTier] □isRenewal → (renewalContext 패널)
  │  ② 대상   [stage] [demographic 태그] [businessDomain 태그] [geography]
  │  ③ 방법론 (•)로컬브랜드 ( )IMPACT ... (•)커스텀 → customFrameworkName
  │  ④ 심사   [style] [stages] □publicVoting
  └ 접힌 세부 (7축): scale · formats · delivery · supportStructure · primaryImpact · aftercare
     ↓
유사 프로젝트 Top 3 자동 갱신 (프로파일 유사도 기반)
```

### 자동 연동 (Q8)

| 한쪽 변경 | 자동 반영 |
|---|---|
| `formats` 에 `공모전` 추가 | `selection.style = '공모전형'` |
| `selection.publicVoting = true` | `selection.style = '대중심사_병행'` |
| `methodology = IMPACT` | `methodology.impactModulesUsed` 입력 필드 활성화 |
| `methodology = 커스텀` | `customFrameworkName` 입력 필드 활성화 |
| `channel.isRenewal = true` | `renewalContext` 패널 자동 확장 + 필수 표시 |
| `budgetKrw` 입력 | `scale.budgetTier` 자동 계산 |

### 신뢰도 색상 (AI 추론 시)
- 🟢 RFP에 명시 · 🟡 추론 · 🔴 정보 부족 → PM 입력 필요

---

<a id="part-5-시스템-반영-방안"></a>
## Part 5. 시스템 반영 방안

### 5.1 DB 스키마

```prisma
model Project {
  programProfile   Json?   // ProgramProfile 객체
  renewalContext   Json?   // isRenewal=true 일 때
}

model WinningPattern {
  sourceProfile    Json?   // 추출 시점 프로파일 스냅샷
  profileVector    Json?   // 유사도 계산용 정규화 벡터
}

model ProfileTag {
  id        String @id @default(cuid())
  axis      String      // "businessDomain" | "demographic" | ...
  value     String
  useCount  Int    @default(1)
  @@unique([axis, value])
}
```

### 5.2 WinningPattern 매칭 로직

```typescript
// v1.1 재조정 — tasks(과업 유형) 신규 축 0.10 확보를 위해 methodology/businessDomain/
// targetStage 를 소폭 축소. scale · primaryImpact 도 약간 더 축소. 합 = 1.0 유지.
findWinningPatterns({
  sectionKey,
  profile: currentProject.programProfile,
  similarity: {
    methodology: 0.22,
    tasks: 0.10,          // v1.1 신규
    businessDomain: 0.13,
    targetStage: 0.13,
    channel: 0.10,
    formats: 0.10,
    selection: 0.08,
    geography: 0.07,
    scale: 0.04,
    primaryImpact: 0.03,
  },
  minSimilarity: 0.35,
  limit: 5,
})
```

### 5.3 커리큘럼 AI 프롬프트 분기

```typescript
const methodologyBlock = {
  IMPACT:       `IMPACT 18모듈 (I→M→P→A→C→T) 골격으로...`,
  로컬브랜드:   `상권강화기구 + 브랜딩 액션러닝 관점으로...`,
  글로컬:       `지역 × 글로벌 교류 구조로 안성 · 3국 연합...`,
  공모전설계:   `다단계 심사 + 사후 유통 연계...`,
  매칭:         `멘토-수혜자 페어링 + 공동 프로젝트...`,
  재창업:       `실패 분석 → 재설계 흐름...`,
  글로벌진출:   `Born Global 프레임 + 해외 진출 단계...`,
  소상공인성장: `매장 진단 → 리뉴얼 → 매출 개선...`,
  커스텀:       `${profile.customFrameworkName} 프레임으로...`,
}[profile.methodology.primary]
```

### 5.4 Gate 3 조건부 검증

```typescript
// IMPACT 미매핑 경고 → IMPACT 방법론일 때만 활성화
if (profile.methodology.primary === 'IMPACT') warnings.push('cur-03')

// 연속사업 블로킹 (Q9)
if (profile.channel.isRenewal && !profile.renewalContext) {
  blockers.push({
    code: 'renewal-context-missing',
    message: '연속사업은 작년 레슨런·성과·개선영역이 제안서 작성 전 필수입니다.',
  })
}

// 4중 지원 체계 경고 → 창업/소상공인 사업만
const is4LayerApplicable = [
  'IMPACT', '소상공인성장', '재창업', '글로벌진출'
].includes(profile.methodology.primary)
if (is4LayerApplicable && !profile.supportStructure.fourLayerSupport) {
  warnings.push('coach-01')
}
```

### 5.5 새 Gate 3 룰 (v1.0 추가)

| 룰 코드 | 조건 | 메시지 |
|---|---|---|
| `renewal-context-missing` | `isRenewal && !renewalContext` | (블로킹) 작년 레슨런·성과 필수 |
| `renewal-lessons-empty` | `renewalContext.lastYearLessons.length < 50` | (경고) 레슨런이 너무 짧음 |
| `renewal-improvement-missing` | `renewalContext.aspectsToImprove.length < 2` | (경고) 개선 영역 최소 2개 |
| `methodology-mismatch` | IMPACT 지정인데 targetStage=비창업자 | (경고) 방법론-대상 불일치 |
| `geography-global-no-support` | geography=글로벌_* 이지만 해외 파트너 미지정 | (경고) 글로벌 축에 국외 지원 구조 없음 |

---

<a id="part-6-q-and-a-결과"></a>
## Part 6. Q1~Q12 답변 결과

| Q | 사용자 답변 | v1.0 반영 |
|---|---|---|
| Q1 | 비창업자 유지 + targetSegment 흡수 | `비창업자` enum 유지, `demographic`에 상인/장인/디자이너 추가 |
| Q2 | 엑셀 기반 3축 세분화 | `demographic`(7) × `businessDomain`(19) × `geography`(6) |
| Q3 | 1억미만 / 1-3억 / 3-5억 / 5억이상 | `budgetTier` 4단계 확정 |
| Q4 | 나중에 추가 | 현재 8종 유지, v1.1 확장 |
| Q5 | 필수 아니지만 사용 권장 | `usesLMS: boolean` (기본값 `true`) |
| Q6 | 메인=창업/소상공인, 비창업 보조 필드 | `nonStartupSupport` 옵셔널 필드 추가 |
| Q7 | 커스텀 세분화 (+제 의견) | 9개 enum + `customFrameworkName` 자유도 |
| Q8 | 중복 모두 자동화 | `formats` ↔ `selection` 자동 동기화 매트릭스 |
| Q9 | renewal 플래그 + **작년 레슨런·성과 필수** | `isRenewal` + `renewalContext` 필수 · Gate 3 블로킹 |
| Q10 | 복수 선택 | `primaryImpact: Array` (최소 1, 최대 3) |
| Q11 | tierCount 충분, 나중에 고도화 | 현행 유지 |
| Q12 | 이 정도면 충분 | 11축 확정 |

### v1.0 과 엑셀(2024-11) 차이

| 항목 | 2024-11 엑셀 | v1.0 반영 |
|---|---|---|
| LMS | 없음 | `delivery.usesLMS` (권장) 추가 |
| AI 챗봇 (EduBot) | 없음 | `delivery.usesAICoach` 추가 |
| IMPACT 창업방법론 | 없음 | `methodology.primary = 'IMPACT'` + 18모듈 정식 축 |
| 비즈니스 분야 19종 | O | 그대로 `businessDomain` enum |
| 대상 6종 | O | `demographic` + 비창업 4종 확장 |
| 지역 6종 | O | 그대로 `geography` |

---

## 🔜 다음 단계

1. **ADR-006 기록** — 이 결정의 근거 · 대안 · 트레이드오프
2. **Prisma 스키마 마이그레이션** — `Project.programProfile`, `renewalContext`, `WinningPattern.sourceProfile`, `ProfileTag`
3. **pm-guide/resolve.ts 개편** — 프로파일 유사도 매칭 (Part 5.2)
4. **커리큘럼 AI 프롬프트 분기** (Part 5.3)
5. **Gate 3 룰 추가** (Part 5.5)
6. **Step 1 UI 프로파일 패널** (Part 4)
7. **8케이스 + 청년마을 + 재창업 프로파일 시드** — WinningPattern 매칭 데이터 초기 확보

예상 구현: **2~3일**. N2(태깅 선검증)는 이미 Part 3 로 완료 → 바로 N1 구현 착수 가능.

---

**마지막 업데이트:** 2026-04-20 (v1.0 확정)
