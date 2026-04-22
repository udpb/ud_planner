# Phase E pm-guide 시뮬레이션 리포트 — 3 시나리오 E2E 검증

**일자**: 2026-04-21
**관련 Phase**: Phase E (pm-guide · ProgramProfile 유사도 매칭)
**방법**: DB 없이 `CASE_SEEDS` 10건을 메모리 로드 → 3개 신규 RFP 시나리오에 대해
`profileSimilarity()` 산출·재정렬·Top 5 추출
**실행**: `npx tsx scripts/simulate-pm-guide.ts`

## 1. 시나리오별 Top 5 결과

### Scenario A — 강릉 중심 상권 활성화 (로컬브랜드, 4억, B2G 기초지자체)

| Rank | Case | Score | 주요 기여 축 |
|------|------|-------|-------------|
| 1 | 2025 종로구 서촌 로컬브랜드 상권강화 | **0.983** | method·bizDomain·stage·channel·formats·selection·geo·impact 전 축 100% |
| 2 | 2026 청년마을 만들기 | 0.768 | method 100% · stage 100% · formats 100% · selection 100% · geo 100% |
| 3 | 2025 안성문화장 글로컬 | 0.413 | stage 100% · channel 100% · selection 100% |
| 4 | 2025 한지 공모전 | 0.243 | stage 100% · channel 60% |
| 5 | 코오롱 프로보노 | 0.233 | stage 100% · formats 50% |

**제1원칙 평가**: Top 1·2 가 PM 직관(서촌·청년마을)과 완벽 일치. Top 3 글로컬(안성)
은 "비창업자 + 기초지자체" 축으로 합리적. Top 4·5 는 0.35 임계값 미달 → 패널에서
자동 탈락(상위 3건만 표시됨). 임계값이 시그널 노이즈를 잘 분리.

### Scenario B — 전통 매듭 공예 디자인 공모전 (공모전설계, 1.5억, B2G 공공기관)

| Rank | Case | Score | 주요 기여 축 |
|------|------|-------|-------------|
| 1 | 2025 한지 디자인 공모전 | **1.000** | 전 축 100% (완전 일치) |
| 2 | 2025 관광기념품 공모전+박람회 | 0.508 | method 100% · channel 100% · formats 67% |
| 3 | 2025 안성문화장 글로컬 | 0.402 | bizDomain 100% · stage 100% · channel 60% |
| 4 | 2026 청년마을 | 0.302 | stage 100% · bizDomain 50% |
| 5 | 코오롱 프로보노 | 0.270 | stage 100% · geo 100% |

**제1원칙 평가**: 완벽. PM 직관 1·2 위가 정확히 Top 1·2. 점수 1.000 은 프로파일 축이
서로 거의 동일함을 보여주는 신호(대중심사 10% vs 20% 차이는 축 인코딩에 없어서
동점 처리됨 — 정량 필드 확장 여지).

### Scenario C — 경기창조경제 예비창업 5기 (IMPACT, 4억, B2G 공공기관)

| Rank | Case | Score | 주요 기여 축 |
|------|------|-------|-------------|
| 1 | 2025 NH 애그테크 | **0.800** | method 100% · stage 100% · channel 100% · formats 100% · selection 100% · geo 100% |
| 2 | 재창업 특화 교육 | 0.600 | bizDomain 100% · channel 100% · formats 100% · selection 100% · geo 100% · scale 100% · impact 100% |
| 3 | 2025 예비창업 글로벌진출 | 0.532 | bizDomain 100% · stage 100% · selection 100% · scale 100% |
| 4 | GS리테일 8기 (재계약) | 0.483 | method 100% · selection 100% · geo 100% · scale 100% |
| 5 | 코오롱 프로보노 | 0.245 | bizDomain 50% · formats 50% · geo 100% |

**제1원칙 평가**: Top 1 NH 일치. 그러나 주목할 **미스매치 리스크** — Top 2 "재창업"
이 methodology 가 다름에도 ‘bizDomain=ALL · impact 일치 · scale 일치’ 의 소규모 가점
누적만으로 0.6 을 받음. PM 이 "예비창업" RFP 를 읽으며 "재창업 레퍼런스가 왜 2위?"
로 혼란 가능. methodology 축 가중치(0.25) 가 체계 내 최대지만, 나머지 축 합이 0.75
라서 methodology 가 다를 때도 높은 점수가 나올 수 있는 구조적 약점 확인.

## 2. PROFILE_SIMILARITY_WEIGHTS 튜닝 소견

- **methodology 0.25** — 방향성은 맞음. 단, 시나리오 C 처럼 `methodology` 가 다른
  후보가 Top 2 에 진입하는 케이스가 관측됨. → **가중치를 0.30~0.35 로 올리고**
  나머지 미세 축(scale, selection)을 소폭 낮추면 "방법론 같은 사례 > 방법론 다른 사례"
  구분이 더 선명해짐.
- **geography 0.07** — 시나리오 A 처럼 `로컬` 고정이 결정적일 때 힘이 약함.
  서촌·청년마을 외 글로벌 사례가 3위로 치고 올라온 원인. 상향 후보.
- **scale 0.05 tierProximity** — 1-3억 과 5억이상이 맞닿는 케이스에서 가점이 과하게
  누적. 다른 핵심 축이 0점이면 scale 0점으로 간주하는 penalty 고려.

## 3. UI 렌더 경로 감사 (코드만 읽어서)

`resolvePmGuide(stepKey='rfp', context)` 반환 형태:
- `winningReferences: WinningPatternRecord[]` — **similarity 필드 포함** (Phase E)
- `evaluatorPerspective`, `commonMistakes`, `udStrengthTips` — 프로파일 기반 필터링됨

`WinningReferencesCard` 가 PM 에게 보여주는 항목(현재):
- `sourceProject` (프로젝트명)
- `sourceClient`, `techEvalScore` (선택)
- `snippet` (3줄 line-clamp)
- `whyItWorks` (Action Orange 컬러)
- `tags` (상위 4개)

### 발견한 갭 (우선순위 표시)

- **[P1] similarity 점수가 UI 에 전혀 노출되지 않음** — `WinningPatternRecord.similarity`
  가 Phase E 에 추가됐지만 카드에서 렌더 안 함. PM 은 "왜 이게 1위인가?" 를 직접
  추론해야 함. 제1원칙 "왜 이 케이스가 내 RFP 와 비슷한가?" 에 대답 불가.
- **[P1] 축별 일치 이유(match reason) 표시 없음** — "같은 방법론(로컬브랜드) + 같은
  발주처 티어(기초지자체)" 같은 한 줄 이유가 PM 이해에 결정적인데 미노출.
- **[P2] whyItWorks 가 line-clamp 없이 전체 렌더 되어 긴 텍스트(300자+)는 카드 시각
  균형 붕괴** — snippet 은 `line-clamp-3` 인데 whyItWorks 는 clamp 없음.
- **[P2] "어떤 배점 축에서 이긴 사례인가" 가 메타데이터로 안 보임** — whyItWorks 본문
  을 읽어야 알 수 있음. `scoringImpact` 같은 구조화 필드 필요.
- **[P3] 3건 이하일 때(임계값 미달 시) 왜 적은지 설명 없음** — "프로파일 유사도
  0.35 미만 제외" 같은 메타 문구가 있으면 PM 이 "왜 5건이 아닌가" 의문 해결.

## 4. 권장 다음 액션

- **[P1] WinningReferencesCard 에 similarity 뱃지 + match-reason 라인 추가**
  — Phase E 본연의 가치가 UI 에 닿지 않고 있음. `similarity.toFixed(0) * 100` %
  뱃지 + "같은 방법론(로컬브랜드)·같은 발주처(기초지자체)" 1행. 가장 투자 대비
  효과 큰 개선.
- **[P2] resolvePmGuide 에서 matchReasons 필드 생성·리턴** — 축별 기여도 Top 2~3
  을 자연어 라벨(`'같은 방법론(로컬브랜드)'`, `'같은 발주처 티어(기초지자체)'`)로
  변환해 내려보냄.
- **[P2] PROFILE_SIMILARITY_WEIGHTS 튜닝 실험** — methodology 0.25 → 0.30,
  geography 0.07 → 0.08, scale 0.05 → 0.03. 재창업이 IMPACT Top 2 에 오르는 이슈
  완화 목적. 10 케이스 × 3 시나리오 회귀 테스트 유지.
- **[P3] whyItWorks 도 line-clamp-3 처리 + "더보기" 토글** — 카드 시각 균형 유지.

## 5. 허용된 최소 수정

- `prisma/seed-program-profiles.ts` 의 `CASE_SEEDS` / `CaseSeedInput` 를 `export` 로
  노출(시뮬레이션용). `main()` 은 `isEntrypoint` 가드로 감싸 import 시 DB 연결 시도
  방지. 로직 변경 없음.

## 6. 품질 게이트

- 시뮬레이션 실제 실행 — 본 리포트 §1 의 점수·표는 tsx 출력과 동일
- `npx tsc --noEmit` — exit=0 (clean)
- `resolve.ts` · `winning-patterns.ts` · `program-profile.ts` · `panel.tsx` 미수정
