# ADR-008: Impact Value Chain (5단계) + SROI = Outcome 수렴점

- 일자: 2026-04-23
- 상태: Accepted
- 선행: [ADR-001 파이프라인 재순서](001-pipeline-reorder.md) · [ADR-006 ProgramProfile](006-program-profile.md) · [ADR-007 스텝 차별화 리서치](007-step-differentiated-research-flow.md)
- 후속: Phase F — Impact Value Chain Wave

## 결정

파이프라인 전체의 논리 골격을 **Impact Value Chain 5단계** 로 정식화한다. 이 5단계는 UI 스텝 순서와 별개의 **의미 레이어**다.

```
  ① Impact  →  ② Input  →  ③ Output  →  ④ Activity  →  ⑤ Outcome
  (의도)        (자원)       (산출물/RFP)   (커리큘럼)       (SROI)
     ▲                                                      │
     └──────── 루프: SROI 축 3방향 얼라인 검증 ──────────────┘
```

- **1→5 순방향**: 사업 설계 초안의 논리 경로 (왜 → 뭐로 → 뭘 낼지 → 어떻게 → 얼마나)
- **루프**: ⑤ Outcome (SROI 숫자) 을 축으로 ① Impact / ② Input / ④ Activity 3방향 얼라인 검증

**핵심 정의: ⑤ Outcome = SROI Forecast.** 정량 기대효과의 최종 형태가 SROI 비율(예: 1 : 3.2)이고, 이 숫자 하나에 Impact 의도 / Input 자원 / Activity 실행이 전부 녹아들어간다. SROI 는 **수렴점이자 루프의 출발점**.

## 배경

### Phase E 이후 드러난 구조적 모순

Phase E 완료(2026-04-21) 시점에 다음이 관찰됐다:

1. **리서치 분배의 비대칭**: `RESEARCH_REQUESTS_BY_STEP.impact` 에 3개 요청이 몰려 있었는데, 이 중 2개(`imp-outcome-indicators`, `imp-diagnostic-tools`)는 **Step 5 에 도달하기 전에 이미 필요한 정보** 였다. PM 은 Step 1 에서 "기대효과 배점" 대비 지표를 뽑아야 하고, Step 2 에서 커리큘럼에 사전·사후 진단을 박아넣어야 한다.

2. **Step 4 "예산 + SROI" 의 논리적 혼재**: 예산은 ② Input, SROI는 ⑤ Outcome. 논리 단계가 다른 두 개가 한 스텝에 뭉쳐 있어 PM 이 "여기서 뭘 해야 하는지" 혼선.

3. **"루프" 개념의 추상성**: "데이터는 위에서 아래로 흐른다" (CLAUDE.md 철학 1) 는 단방향 선언만 있고, 역류 검증 구조가 불명확.

### 사용자가 제시한 프레임 (2026-04-23 대화)

사용자가 "구조적 설계를 할 때 생각하는 것" 으로 다음 5단계 + 루프 모델을 제시:
1. **impact** — 사업의 의도 + before & after 분석
2. **input** — 예산·기관 자산·우리 에셋
3. **output** — 산출물 예상 + RFP
4. **activity** — 커리큘럼·코칭
5. **outcome** — 구체적 정량 기대효과

그 다음 "루프를 돌리면서 싱크가 얼라인 되어서 논리 구조가 클리어한지" 검증 + "결과물이 시각적으로도 직관적으로 깔끔하게 떨어지는 느낌".

이어서 **"outcome 은 SROI 로 나올 거고"** 라는 한 문장 통찰이 나왔고, 이로써 ⑤ Outcome 의 정체가 SROI 로 확정됐다. SROI 가 ② Input 과 ⑤ Outcome 의 **비율** 이라는 정의 자체가 루프의 물리적 실체를 제공한다.

## 대안 비교

### 대안 A (채택): 5단계 Value Chain 정식화 + Step 4·5 재구성

- 의미 레이어(`valueChainStage`) 를 PipelineContext 메타에 추가
- Step 4 → **"예산 설계"** 로 개칭 (② Input 만)
- Step 5 → **"임팩트 + SROI Forecast"** 로 재구성 (⑤ Outcome 수렴)
- 리서치 재분배 (2 이동 + 1 신규)
- pm-guide 상단에 Value Chain 다이어그램 상시 가시화
- Step 1 에 ① Impact / ② Input / ③ Output 3 탭
- 루프 Gate = SROI 숫자 축 3방향 얼라인 카드

### 대안 B: 미니멀 — 리서치만 재배치

- 리서치 2 이동만 하고 구조는 그대로
- 탈락 사유: 구조적 모순(Step 4 예산/SROI 혼재) 은 남음. PM 혼선 재발.

### 대안 C: Step 4·5 아예 합치기 (`Step 4: Input & Outcome`)

- 예산·SROI 한 스텝에 유지하되 논리 단계 명시
- 탈락 사유: "한 스텝에 두 논리 단계" 가 본질 문제였는데 이름만 바꾸는 것. PM 에게는 동일.

## 결과 (기대 효과)

1. **PM 인지 부하 감소** — 각 스텝이 어느 논리 단계인지 명확. "지금 뭘 해야 하지?" 질문 소멸.
2. **SROI 정확도 상승** — Step 1·2 에서 씨앗(지표·진단도구) 을 뿌려두므로 Step 5 에서 SROI 계산 재료가 준비됨.
3. **루프 검증 자동화** — SROI 숫자가 나오는 순간 3방향 얼라인 체크가 트리거됨. 불일치 시 해당 스텝 복귀 CTA.
4. **수주 언어 일관성** — 제안서에서 "왜(Impact) → 뭐로(Input) → 어떻게(Activity) → 얼마나(Outcome/SROI)" 가 자연스럽게 이어짐.

## 리스크 + 대응

| 리스크 | 대응 |
|---|---|
| Step 4·5 UI 변경이 기존 프로젝트 데이터에 영향 | SROI 슬라이스는 PipelineContext 레벨에서 이동 — DB 스키마 변경 최소화. UI 라우팅만 교체. |
| 루프 Gate 가 PM 에게 차단처럼 보일 수 있음 | Gate 는 경고·CTA만, **블록하지 않음**. 무시 옵션 + 재생성 CTA. |
| 5단계 라벨이 기존 PM 에게 생소 | pm-guide 상단 다이어그램 + 리서치 카드 단계 뱃지로 반복 노출 → 2~3 프로젝트 내 학습. |

## 구현 스코프 (Phase F Impact Value Chain Wave)

- Wave 0 — 문서 (ADR-008 · value-chain.md 스펙 · journey · CLAUDE/ROADMAP 반영)
- Wave 1 — `src/lib/value-chain.ts` + PipelineContext 메타
- Wave 2 — 스키마 점검 · (필요시) SROI 슬라이스 분리
- Wave 3 — 리서치 재분배 (이동 2 · 신규 1 · 단계 뱃지)
- Wave 4 — Value Chain 다이어그램 컴포넌트 + pm-guide 통합
- Wave 5 — Step 4 개칭 + SROI UI Step 5 이동
- Wave 6 — Step 1 에 ①/②/③ 3 탭
- Wave 7 — 루프 Gate (SROI 축 3방향 얼라인)
- Wave 8 — typecheck · 메모리 · 완료 기록

상세: [docs/architecture/value-chain.md](../architecture/value-chain.md)

## 연결된 규칙 (유지)

- ADR-001 스텝 순서 (rfp → curriculum → coaches → budget → impact → proposal) — **유지**. 라벨만 재해석.
- ADR-006 ProgramProfile 11축 — **유지**. Value Chain 은 프로파일과 직교하는 **공정 레이어**.
- ADR-007 스텝 차별화 리서치 — **갱신**. 리서치가 이제 valueChainStage 태그를 갖는다.

## 히스토리

- 2026-04-23 — 사용자 대화에서 5단계 + 루프 프레임 제시 + "outcome = SROI" 확정 → ADR 작성
