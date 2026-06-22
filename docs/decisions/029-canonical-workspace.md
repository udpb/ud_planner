# ADR-029: 단일 정본 워크스페이스 — 프로그램 기획 중심 3단계 통합

**Status:** Accepted (2026-06-22, 사용자 확정)
**Date:** 2026-06-22
**Deciders:** 사용자 (방향·"덕지덕지 금지") + 메인 세션
**Supersedes (진입/네비 패러다임 한정):** ADR-011(Express 단일흐름)·ADR-013(Express 2.0 진입)·ADR-015(Wave V 통합)·ADR-018(StageShell). — 이 ADR들의 *엔진·자동진단 결정*은 유지, *진입점·네비 패러다임*만 본 ADR로 대체.

## Context

제품이 파편화됐다 — **경쟁하는 진입점·패러다임이 7개 공존**: Express 단독 라우트 · Deep `?step=` 6스텝 · Wave V StageShell 5단계(ADR-015/018, 절반만 완성) · program-design(BR-3b) · impact-forecast · brain · v2. 전부 *제안서 중심*이고 서로 UX 언어가 다르다.

방향 전환 (사용자, 2026-06):
- 스코프: **제안서 고도화 → 프로그램 기획 고도화.** + impact-measurement **볼트인**(쓰기+공식 리포트 임베드).
- 사용자 지시 (2026-06-22): *"가장 깔끔하게 한 번에 제대로. 덕지덕지 안 되게. 일관된 기획·결과물, 불필요한 기능이 헷갈리지 않게."*

**안전 조건**: production = `master` 이고 작업 브랜치는 미머지(HANDOFF 확인) → **운영 사용자 무손상**. 브랜치에서 과감히 통합·제거 가능 + 롤백 자유. **플래그로 병존시킬 이유 없음 — 지금이 정리 적기.**

**보존할 자산**: 자동 지능 ~20종([[reference-udplanner-feature-map]]) = 제품의 초능력. 헷갈리게 하는 건 *경쟁 쉘/라우트*이지 엔진이 아니다.

## Decision

**단일 정본 워크스페이스 `/projects/[id]` = 3단계. 패러다임 플래그 없음 — 이게 제품이다.**

```
/projects/[id]   (유일한 워크스페이스)
  ① RFP 분석   ②  프로그램 설계 (spine)   ③ 임팩트 (리포트 임베드)
  ▸ 하류 출력: 제안서 생성 · 덱(parked)
  ▸ 인-워크스페이스 도구: brain 매치 · 자산 검색
```

### 단계 매핑 + 엔진 노출 (각 단계에 자동지능이 붙음)
| 단계 | 내용 | 노출되는 엔진(재사용) | 재사용 컴포넌트 |
|---|---|---|---|
| **① RFP 분석** | RFP 파싱·확인, 토대잡기(목표·선례·의도) | 채널 자동감지 · Brain 5영역 매칭 · 자산 자동매칭 | StageS1 / StepRfp |
| **② 프로그램 설계** ⭐ spine | 운영유형·회차·코칭·흐름 결정 + 기획요소 조립 | program-design 브레인(D0~D8 게이트·결정로그·타임라인) · **코치풀 추천(coach-finder)** · 자산 인용 · 진단/선발/연계 · 예산 자동시드 | **P2 설계 캔버스** |
| **③ 임팩트** | forecast 렌즈 + 공식 리포트 | impact forecast(Wave M) + impact-measurement 핸드오프 | **P1 볼트인** |

### 제거 (덕지덕지 원인)
- **Express 단독 라우트 패러다임** (`/projects/[id]/express` 진입점) — 1차본 생성 엔진은 하류 "제안서 출력"으로 흡수.
- **Deep `?step=` 6스텝 분리 네비** — 단계는 워크스페이스 stage/하류로 흡수.
- **v2 StageShell 5단계** (ADR-015/018, 절반 통합) — 3단계가 올바른 통합으로 대체. StageLayout(아코디언 기질)만 재사용.
- **별도 라우트**: program-design·impact-forecast·brain → 워크스페이스 stage/도구로 흡수.

### 강등 (하류 옵션 — 경쟁 경로 아님)
- **제안서 생성**(Express engine·proposal-ai) = 설계 완료 후 "제안서 출력" 액션. 워크스페이스의 산출, 별도 진입점 아님.
- **덱** = 출력 포맷 (parked, ADR-027 대기).

### 엔진 보존 (재구현 0)
`src/lib/*`의 자동지능(coaches·express engine·impact·program-design·budget·retrieval·inference·research·curriculum-ai·proposal-ai)은 **전부 유지**. 바뀌는 건 진입/네비(쉘)뿐. 제안서 엔진도 하류 액션으로 살림.

## Consequences

### Positive
- **단일 IA** — 진입점 1개, 흐름 1줄(RFP→설계→임팩트→출력). 헷갈림 제거.
- **일관된 기획·결과물** — 한 워크스페이스, 한 디자인 언어(킷).
- 엔진 그대로 — 자동지능 손실 0.

### Negative / Trade-offs
- 큰 통합 작업: 기존 라우트 컴포넌트 제거·이전, 제안서 워크플로 재배치.
- Wave V(015/018) StageShell 5단계 작업 일부 폐기(StageLayout만 재사용).
- 한 아크로 해야 함(둘 다 살려두면 다시 덕지덕지).

### 왜 지금 안전
production=master 미반영 → 운영 무손상. 브랜치 통합 + 롤백 자유.

## 마이그레이션 (한 아크 — 둘 다 살려두기 금지)
1. **3단계 워크스페이스 `/projects/[id]` 빌드** — StageLayout 재사용 + ①StageS1 ②P2 캔버스 ③P1 볼트인 + 3단계 stage-mapping.
2. **같은 패스에서 경쟁 라우트 제거/리다이렉트** — express·v2·program-design·impact-forecast·brain 라우트 → 워크스페이스로 흡수 또는 redirect.
3. **제안서 생성 = 하류 액션 재배치** ("제안서 출력" 버튼 → Express engine 호출).
4. **brain·자산 = 인-워크스페이스 패널.**
5. **E2E 단일 흐름 검증** — 신규 프로젝트 → RFP → 설계(코치·자산·진단 자동) → 임팩트(리포트) → 제안서 출력. 다른 진입점 0.

## References
- 관련/대체: ADR-011·013·015·018 (진입 패러다임) · ADR-019(workstream)·021(생성엔진)·028(program-design grammar)
- 기능 지도: [[reference-udplanner-feature-map]] · 정본 로직: docs/UD-Brain-CurriculumDesignLogic-v1.2.html
- 빌드 산출: P1(impact 볼트인)·P2(설계 캔버스) = 본 워크스페이스의 ③·② 단계
