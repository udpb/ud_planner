# D2 Brief: ChannelPreset — B2G/B2B/재계약 3종 DB 시드 + 소비 경로

## 🎯 Mission

Phase D0 이 생성한 `ChannelPreset` 테이블에 **3개 표준 row 시드** + planning-direction.ts 의 하드코딩 CHANNEL_TONE_PROMPT 를 DB 조회로 전환하는 helper 함수.

## 📋 Context

- 현재 `src/lib/planning-direction.ts` 에 `CHANNEL_TONE_PROMPT` 하드코딩 3종 (B2G/B2B/renewal)
- ADR-005: ChannelPreset DB 가 1차 소스, 가이드북 Ch.10 이 참조. 하드코딩은 fallback.
- 가이드북 Ch.12 카드 3종의 **상세 필드** (평가위원 프로필·커리큘럼 이론 비율 상한·예산 톤·제안서 구조) 를 DB 시드로

## ✅ Prerequisites

1. D0 완료 (ChannelPreset 스키마)
2. Phase B B1 `src/lib/planning-direction.ts` 존재
3. 가이드북 Ch.10 / Ch.12 내용 이미 공유됨 (이 브리프에 아래 포함)

## 📖 Read

1. `docs/decisions/005-guidebook-system-separation.md`
2. `src/lib/planning-direction.ts` §CHANNEL_TONE_PROMPT
3. `src/lib/prisma.ts`
4. 아래 "시드 데이터 원문" — 가이드북 Ch.12 를 정제한 내용

## 🎯 Scope

### ✅ CAN
- `prisma/seed-channel-presets.ts` (신규)
- `src/lib/channel-presets.ts` (신규 — query helper)
- `src/lib/planning-direction.ts` 일부 수정 (**예외 허용** — 기존 CHANNEL_TONE_PROMPT 는 유지하되 옆에 DB 조회 + fallback 경로 추가)
- `package.json` scripts 에 `db:seed:channel-presets` 추가 (**예외 허용**)

### ❌ MUST NOT
- schema.prisma 수정 (D0 결과만 소비)
- 다른 lib 파일
- UI 파일
- 새 의존성

## 🛠 Tasks

### Step 1: 시드 스크립트

`prisma/seed-channel-presets.ts` — 3개 row upsert:

```typescript
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const presets = [
  { code: 'B2G', ... },   // 아래 시드 데이터 원문
  { code: 'B2B', ... },
  { code: 'renewal', ... },
]

async function main() {
  for (const p of presets) {
    await prisma.channelPreset.upsert({
      where: { code: p.code },
      update: p,
      create: p,
    })
  }
}
main().finally(() => prisma.$disconnect())
```

### Step 2: Query Helper

`src/lib/channel-presets.ts`:

```typescript
export async function getChannelPreset(code: string): Promise<ChannelPresetDto | null>
export async function listChannelPresets(): Promise<ChannelPresetDto[]>
// DTO 는 DB 모델을 포함하되 Json 필드(keyMessages/avoidMessages) 는 string[] 로 파싱
```

### Step 3: planning-direction.ts 에 fallback 조회

기존 `CHANNEL_TONE_PROMPT` **삭제하지 말 것** (fallback 용도). 신규 함수 추가:

```typescript
export async function resolveChannelTone(channel: PlanningChannel): Promise<string> {
  try {
    const preset = await getChannelPreset(channel)
    if (preset) return formatToneFromPreset(preset)
  } catch {}
  return CHANNEL_TONE_PROMPT[channel]  // fallback
}
```

**기존 `CHANNEL_TONE_PROMPT` 참조 코드는 건드리지 말 것** — 점진 전환. C1 (curriculum-ai) / C3 (proposal-ai) 가 나중에 resolveChannelTone 으로 migrate.

### Step 4: package.json scripts

```json
"db:seed:channel-presets": "npx tsx prisma/seed-channel-presets.ts"
```

### Step 5: 검증

```bash
npm run typecheck
npm run build
```

## 📝 시드 데이터 원문 (가이드북 Ch.12 기반)

### B2G (정부·공공기관)
```
code: "B2G"
displayName: "정부·공공기관"
description: "중앙부처·지자체·공공기관 발주. 정부업무평가 대응 필수."
keyMessages: [
  "정부업무평가 대응 가능",
  "수료율 95% 이상 보장",
  "정량 KPI 중심 성과 측정",
  "정책 연계·체계적 운영"
]
avoidMessages: [
  "너무 혁신적인 표현 (위험 부담으로 읽힘)",
  "과도한 매출·ROI 용어",
  "민간 비즈니스 중심 언어"
]
tone: "선언형 + 정책 언어 + 정량 포화. 안정감·체계성 강조."
evaluatorProfile: "공무원 + 외부 전문가. 안정성·수행 능력·실적 중시. 작성 실수에 엄격."
theoryMaxRatio: 0.3
actionWeekMinCount: 2
budgetTone: "직접비 비율 높게(70%+), 마진 보수적으로(10~15%)."
directCostMinRatio: 0.7
proposalStructure: "정책배경 → 실적증명 → 체계적 계획 → 리스크 관리 → 정량 성과"
```

### B2B (기업·재단)
```
code: "B2B"
displayName: "기업·재단"
description: "대기업·그룹사 CSR/ESG · 민간 재단 발주."
keyMessages: [
  "매출·ROI 연계 성과",
  "속도와 실행력",
  "유연한 커스터마이징",
  "비즈니스 임팩트 직접 연결"
]
avoidMessages: [
  "정부업무평가 같은 공공 용어",
  "너무 체계적·관료적 표현",
  "정치적 함의 있는 표현"
]
tone: "결과 지향 + ROI 언어. 빠른 실행·측정 가능한 효과."
evaluatorProfile: "실무 담당자 + 경영진. 결과·ROI·속도 중시. 실행력 검증에 엄격."
theoryMaxRatio: 0.2
actionWeekMinCount: 3
budgetTone: "ROI 대비 효율성 피력. 마진은 유연."
directCostMinRatio: 0.6
proposalStructure: "ROI 라이즈 → 차별화 포인트 → 속도감 있는 실행 계획 → 측정 가능한 효과"
```

### Renewal (재계약·연속 사업)
```
code: "renewal"
displayName: "재계약·연속 사업"
description: "이전 수행 사업의 확장·연속. 신뢰 자산 최대 활용."
keyMessages: [
  "작년 대비 성장·개선점",
  "데이터 기반 개선 제안",
  "신뢰 관계 누적",
  "연속성 있는 성과 추적"
]
avoidMessages: [
  "처음 만나는 고객 같은 어조",
  "기본 소개 반복",
  "작년 성과 언급 누락"
]
tone: "신뢰 기반 + 개선 지향. 숫자로 작년 대비 증명."
evaluatorProfile: "이전 프로젝트 경험 있는 담당자 포함. 실질 성과·개선 노력 중시."
theoryMaxRatio: null  // 기존 구조 유지가 우선
actionWeekMinCount: null
budgetTone: "작년 대비 합리성. 단가 인상 근거 명시."
directCostMinRatio: null
proposalStructure: "작년 성과 리뷰 → 개선 포인트 → 이번 시즌 업그레이드 계획 → 신규 KPI"
```

## ✔️ Definition of Done

- [ ] `prisma/seed-channel-presets.ts` 작성
- [ ] `npm run db:seed:channel-presets` 실행 → 3개 row upsert 확인
- [ ] `src/lib/channel-presets.ts` query helper export
- [ ] `resolveChannelTone()` fallback 패턴 구현
- [ ] 기존 CHANNEL_TONE_PROMPT 무수정 (단순 공존)
- [ ] typecheck · build 통과

## 📤 Return Format

표준. 특히:
- 시드 row 3개 생성 확인 (DB 조회 결과)
- planning-direction.ts 변경분 요약

## 🚫 Do NOT

- 가이드북 Ch.12 원문을 영어로 번역 (한글 그대로)
- C1 / C3 의 기존 CHANNEL_TONE_PROMPT 사용처를 이번에 migrate (점진, 별도 작업)
- 4번째 preset 임의 추가 (3종만)
- 시드를 API 로 노출 (DB 직접 쓰기)

## 🏁 Final

ChannelPreset 은 **데이터**. planning-direction 의 프롬프트 빌더가 점진적으로 이걸 쓸 것. 이번엔 데이터만 깔아두기.
