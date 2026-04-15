# 품질 검증 체계 (Quality Gates)

> **나(AI 공동기획자)의 핵심 책임.** 사용자가 기능 개발자로 나를 쓰지 않는 이유는, 내가 품질을 보증하는 사람이 되어야 하기 때문이다. 이 문서는 "내가 어떻게 품질을 높이고 검증된 결과를 줄 것인가"의 구체적 장치다.

## 0. 품질의 정의 (이 프로젝트 한정)

**좋은 산출물 = 수주 가능한 제안 + 신입 PM도 언더독스 수준으로 만들 수 있는 제안**

→ 품질 = ①논리·컨셉의 구조적 정합성 ②언더독스 자산의 정확한 주입 ③평가위원 관점의 충족 ④축적 가능성(다음 기획이 이 산출물로 더 나아지는가)

## 1. 4계층 검증 (Gate 1 → Gate 4)

```
Gate 1: 구조/계약 검증 (빌드 타임)          ← 빠르고 무자비
Gate 2: 룰 엔진 검증 (생성 직후)             ← 결정론적 규칙
Gate 3: AI 검증 (생성 직후)                  ← 패턴·정합성·시뮬레이션
Gate 4: PM·Admin 승인 (운영)                 ← 최종 판단
```

### Gate 1 — 구조/계약 검증 (자동, 빌드 타임)

| 체크 | 구현 |
|------|------|
| TypeScript 타입 통과 | `npm run typecheck` CI |
| 모듈이 manifest에 없는 slice에 접근하지 않음 | ESLint 커스텀 룰 (Phase F) |
| Prisma 스키마 ↔ PipelineContext 타입 일치 | 타입 제네레이터 + 단위 테스트 |
| Next.js 빌드 성공 | `npm run build` CI |

**실패 시:** 머지 차단.

### Gate 2 — 룰 엔진 검증 (결정론적)

**커리큘럼 룰 (`src/lib/curriculum-rules.ts` 기존 활용):**
- R-001 이론 30% 초과 → BLOCK
- R-002 Action Week 필수 → BLOCK
- R-003 이론 3연속 → WARN
- R-004 코칭 직전 워크숍 → SUGGEST

**예산 룰 (신규, `budget-rules.ts`):**
- 직접비 비율 < 70% → WARN (B2G)
- 마진 < 10% → WARN
- 총액 > RFP 예산 → BLOCK
- 코치 사례비 평균이 시장가 ±20% 벗어남 → SUGGEST

**임팩트 룰 (신규, `impact-rules.ts`):**
- Activity가 커리큘럼 세션과 1:1 대응되지 않음 → WARN
- Outcome에 SROI 프록시 매핑 없음 → SUGGEST
- 측정도구 미지정 Outcome → WARN

**제안서 룰:**
- 7개 섹션 모두 생성됨 → BLOCK (미완)
- `ChannelPreset.avoidMessages` 포함 → WARN
- 키 메시지(Strategy.derivedKeyMessages) 미반영 섹션 → SUGGEST

**실패 시:** BLOCK은 저장 거부, WARN은 배지 표시, SUGGEST는 사이드 제안.

### Gate 3 — AI 검증 (정성적)

**3a. 당선 패턴 대조**
생성물을 관련 `WinningPattern[]`과 비교 → 유사도 점수 + 차이 분석.
```
입력: 생성된 제안서 섹션
자산: WinningPattern (같은 섹션·같은 발주처 타입)
출력:
  - 패턴 일치도 0~100
  - 부족한 요소 (예: "정량 KPI 언급 없음")
  - 강화 제안
```

**3b. 평가위원 시뮬레이션** (Phase D4)
```
입력: 생성된 제안서 전체 + RFP.evalCriteria + ChannelPreset.evaluatorProfile
프롬프트: "당신은 이 발주처의 평가위원입니다. 다음 기준으로 채점하세요..."
출력: 항목별 점수 + 감점 사유 + 질문 예상 리스트
```

**3c. 심사위원 질문 방어 체크** (evaluator-question 자산 활용)
```
입력: 생성된 제안서 섹션별
자산: 과거 심사위원 질문 DB
출력: "이 질문이 나올 확률 높음 — 현재 제안서에서 방어 약함"
```

**3d. 논리 체인 검증 (가장 중요)**
```
입력: RFP 목표 → 제안컨셉 → 핵심포인트 → 커리큘럼 → Activity → Outcome → Impact
프롬프트: "각 단계가 이전 단계의 논리적 귀결인지 판단. 끊기는 지점 지적"
출력: 논리 체인 점수 + 끊긴 지점
```

**실패 시:** 사용자에게 리포트, 재생성 옵션 제공. 자동 블록 ❌ (AI 판단이므로 PM이 최종).

### Gate 4 — PM·Admin 승인 (운영)

- **PM 확정:** 각 슬라이스에 `confirmedAt` — PM이 "이대로 다음 스텝 진행" 선언
- **Admin 승인:** Ingestion 추출물이 자산에 반영되기 전 필수
- **Admin 승인:** Planning Agent가 학습한 패턴이 프롬프트에 반영되기 전 필수

## 2. 품질 측정 지표 (장기 추적)

| 지표 | 측정 방법 | 목표 |
|------|----------|------|
| 수주율 | 완료 Project의 `won` 필드 | 점진 상승 |
| 신입 PM vs 시니어 PM 산출물 품질 gap | Gate 3 점수 비교 | 축소 |
| 재생성 횟수 | Project별 proposal section 생성 count | 감소 |
| Ingestion 승인률 | 승인/(승인+거부) | 상승 = AI 추출 품질 개선 |
| 자산 재사용률 | WinningPattern 참조 count / 생성 count | 상승 |
| 평가 시뮬 점수 vs 실제 점수 | 수주 후 실제 점수표 입력 필요 | 상관계수 > 0.6 |

**구현:** `QualityMetric` 테이블에 스냅샷 저장 → Admin 대시보드.

## 3. 내(AI 공동기획자)가 매일 하는 일

### 에이전트 결과 받을 때마다
- [ ] manifest의 reads/writes 준수했는가
- [ ] 계약된 타입과 일치하는가
- [ ] 룰 엔진 통과했는가
- [ ] AI 검증 (Gate 3) 중 해당 부분 돌려봤는가
- [ ] journey에 기록할 시행착오 있는가

### 주기적으로 (사용자 트리거 시)
- [ ] 수집된 수주/탈락 결과와 Gate 3 시뮬 점수 비교 → 프롬프트 튜닝 제안
- [ ] Ingestion 거부된 항목들 패턴 → AI 추출 프롬프트 개선 제안
- [ ] WinningPattern 중 참조 0인 것 → 태깅 문제인지 패턴 자체 문제인지 분석
- [ ] 신규 ADR 필요한 결정이 journey에 쌓였는지 확인

## 4. 품질 개선을 위한 정보 수집 요청 (사용자에게)

내가 품질을 높이려면 사용자에게 다음을 주기적으로 요청해야 한다. 요청은 가볍게, 자료 드롭 한 번으로 끝나게 설계됨 (→ Ingestion 파이프라인).

| 시점 | 요청 | 주입 경로 |
|------|------|----------|
| 신규 수주 발생 시 | 수주 제안서 PDF + 점수표 | `proposal-ingest` → WinningPattern |
| 탈락 발생 시 | 탈락 제안서 + 가능하면 사유 | `proposal-ingest` (outcome=lost) |
| 발표/심사 직후 | 심사위원 질문 메모 | `evaluator-question-ingest` |
| 프로젝트 완료 시 | 실제 만족도·수료율·이탈률 | `SatisfactionLog` |
| 분기 1회 | 수주 팀장 인터뷰 | `strategy-interview-ingest` |
| 신규 발주처 타입 등장 시 | 그 타입 이해 메모 | `ChannelPreset` 수동 생성 |

**역할:** 나는 이 요청을 "언제 · 어떤 형태로" 할지 사용자에게 상기시키는 리마인더 역할도 한다.

## 5. 게이트 강도 조절 원칙

- **Phase A~C (지금):** Gate 1, Gate 2만 강제. Gate 3는 옵션.
- **Phase D~E:** Gate 3 통합 (평가 시뮬, 패턴 대조).
- **Phase F 이후:** Gate 1~4 전면 가동.
- 초기에 Gate 3까지 강제하면 개발 속도 저하 + AI 비용 폭증 → 기능이 안정되고 나서 올린다.

## 6. 품질 검증 결과 → 사용자에게 보고하는 포맷

에이전트 작업이 끝날 때 내가 사용자에게 주는 보고는 다음 형식을 따른다:

```
[모듈명] <작업 요약>

✅ Gate 1: 통과 (타입·빌드·계약)
✅ Gate 2: 통과 (룰 엔진 통과, WARN 0)
⚠️ Gate 3: 부분 통과
   - 당선 패턴 대조: 72점 (부족: 정량 KPI 언급 약함)
   - 평가 시뮬: 78점 예상
   - 논리 체인: 1곳 끊김 — Step 1 키 메시지가 Step 4에 반영 안 됨
🟡 권장 조치:
   - [ ] proposal Step 2-C 섹션에 정량 KPI 2개 추가
   - [ ] budget.sroiForecast를 proposal Section VI에 주입

파일 변경: <list>
다음 스텝: <제안>
```

사용자가 이 포맷을 보고 즉시 결정할 수 있어야 한다.

---

**연관 문서:** [modules.md](./modules.md) (manifest.quality 필드) · [data-contract.md](./data-contract.md) (confirmedAt·version) · [ingestion.md](./ingestion.md) (ExtractedItem 승인 루프)
