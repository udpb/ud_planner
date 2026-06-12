# ADR-028: 프로그램 설계 문법 — 운영 변수 16축 추출 스키마 + JSON-first 파이프라인

**Status:** Accepted
**Date:** 2026-06-12
**Deciders:** 사용자 (방향·VOD 분류 v5.4 공급) + 메인 세션
**Scope:** Brain 학습 레이어 (WinningProposalDoc 코퍼스 재추출) · 커리큘럼/프로그램 설계 생성 품질

> 번호 주의: ADR-027 은 덱 터미널 모듈(ADR-026 supersede)용으로 예약됨 — 본 ADR 은 028.

## Context

브레인이 "대상에 따라 프로그램 설계가 어떻게 달라지는가"에 답하지 못한다. 자산(WinningPattern 102 · ContentAsset 1,765 · **WinningProposalDoc 148건 원문**)은 충분하지만:

1. **교육 운영 구조가 1급 데이터가 아니다** — 사전학습·온/오프 비율·회차 리듬·코칭 구조·코호트·성과공유회/데모데이가 notes 텍스트·boolean·라벨로 흩어져 있어 "수주한 B2G 청년 사업의 평균 코칭 회수" 같은 질문에 답할 수 없다.
2. **WinningPattern 은 텍스트 스니펫(2,000자 cap) 단위** — 운영 구조의 정량 비교 불가.
3. 사용자가 VOD 학습 콘텐츠 재분류 체계(**강의 분류 가이드 v5.4** — 전달형식 7종 / 콘텐츠유형 4종 / 난이도 5 / 청중 2기준 / 비즈니스단계 10 / 강의영역 6 / 유효성 3)를 완성 — 사전학습 슬롯이 "VOD 있음/없음"이 아니라 **어떤 VOD를 어느 회차에**까지 내려갈 토대가 생김.
4. 사용자 결정 (2026-06-12): "아주 구체적이고 탄탄한 프로그램 설계가 핵심. 한 번에 제대로 추출할 수 있도록 필요한 모든 요소를 고려해 추가 추출 진행."

코퍼스 실측 (2026-06-12, 로컬 DB):
- WinningProposalDoc **148건** · 총 186만 자 (avg 12.6k / p50 7.9k / max 63k)
- 채널: B2G 113 · B2B 12 · null 22 · renewal 1 / 연도: 2022~2025
- 파싱: pdf-parse 133 · vision-ocr 13 · unsupported 2 · lowText 3
- ⚠️ **won 148 / lost 0 — 패배 케이스 0건.** "패배가 규칙의 절반" 원칙상 중대 공백.

## Options Considered

### Option A — Prisma 신규 모델(ProgramDesignPattern·DesignRule)로 바로 DB 저장
- 장점: 쿼리·조인 용이, Brain Layer 1 과 즉시 통합.
- 단점: **로컬 DB migration 보류 중(drift, CLAUDE.md 명시)** — 스키마 변경이 차단됨. 스키마가 1~2 이터레이션 안에 바뀔 가능성 높은 시기에 마이그레이션 2회 위험.
- 기각 이유: 지금은 추출 품질 검증이 우선. 저장소 동결은 스키마 안정 후.

### Option B — JSON-first: `data/program-design/` 파일 산출 → 검증 후 DB 이관 (채택)
- 장점: 마이그레이션 불요(보류 정책 준수) · diff 리뷰 가능(git) · 스키마 이터레이션 자유 · 스팟체크 쉬움.
- 단점: 생성기 소비 전 이관 단계 1회 필요 (후속 DATA 브리프).
- 채택 이유: "가변은 데이터, 안정은 ADR 동결" 원칙. 축 **이름·구조**는 본 ADR 로 동결하되 저장소는 검증 후 이관.

### Option C — 12축 최소 스키마로 우선 추출
- 기각: 사용자가 "한 번에 제대로, 모든 요소"를 명시. 재추출 비용(148건 × LLM)보다 누락 축 재작업 비용이 더 큼.

## Decision

### 1. 추출 단위 = WinningProposalDoc 1건 → ProgramDesignPattern JSON 1건

### 2. 스키마 = Layer A 스냅샷 + Layer B 운영 16축 + 콘텐츠 믹스 + 회차 시퀀스 + 메타

**Layer A — profileSnapshot** (ProgramProfile 11축 부분집합 추정): targetStage · demographic[] · businessDomain[] · geography · channel(+null 보정) · clientTier · scale{budgetKrw, participants, durationMonths} · methodologySignals[]

**Layer B — operatingFormat 16축** (키 이름 동결, enum 값은 데이터 레이어에서 가변):

| # | 축 | 핵심 필드 |
|---|---|---|
| 1 | preLearning | types(없음/LMS_VOD/사전진단/사전과제), diagnostics(DOGS/ACTT/5D), hours |
| 2 | deliveryMode | mode(온/오프/하이브리드), onlineRatio, syncType(실시간/VOD/혼합) |
| 3 | cadence | totalSessions, rhythm(주1회/주2회/격주/집중캠프/혼합), campDays |
| 4 | sessionLength | hoursPerSession, timeOfDay(주간/저녁/주말/종일) |
| 5 | theoryPracticeRatio | lecturePct, practicePct, basis(명시/추정) |
| 6 | coaching | types(1:1/팀전담/그룹/온라인후속), totalRounds, hoursPerRound, coachToTeamRatio, pairing |
| 7 | cohortStructure | isCohort, teamBased, teamSize, tracks, peerDevices(동료리뷰/커뮤니티/네트워킹) |
| 8 | milestoneEvents | [{type(중간공유회/데모데이/IR/네트워킹/박람회/해커톤/경진대회), timing(초반/중반/종반)}] |
| 9 | selectionFunnel | stages, methods(서류/PT/면접/진단), competitionRatio, midDropGate |
| 10 | actionWeek | count, placement |
| 11 | deliverables | 사업계획서/IR덱/MVP/프로토타입/브랜드/매출실적/기타[] |
| 12 | incentives | types(사업화지원금/시제품비/상금/후속연계), amounts |
| 13 | faculty | types(전담코치/외부전문가/연사/동문코치), headcount, dedicatedPm |
| 14 | venue | types(고정교육장/현장방문/합숙시설/온라인/지역거점)[] |
| 15 | assessment | completionCriteria(출석률/과제/결과물/발표), attendanceThreshold |
| 16 | aftercare | types(없음/alumni/후속보육/투자연계/온라인코칭), duration |

**확장 레이어** (VOD 분류 v5.4 정합):
- **contentMix** — deliveryFormats(강연/경험담/인터뷰·대담/워크숍·실습/데모·시연/패널) · contentTypes(이론·개념/사례·경험/실무·도구/트렌드·인사이트) · difficultyArc(단일/상승/혼합). v5.4 의 "전달 형식 ⊥ 콘텐츠 유형" 2축 독립 원칙을 커리큘럼 레벨로 승격.
- **sessions[]** — 추출 가능 시 회차 시퀀스 [{no, title, hours, format, isTheory, isCoaching, isEvent}]. 불가 시 빈 배열 (강제 생성 금지).
- **validity** — {status: 상시유효/점검필요/폐기후보, reason}. v5.4 유효성 개념 차용: 시기 의존 운영 모델(코로나 비대면 강제 등)은 패턴 학습에서 디스카운트.
- **kpiTargets[]** — 수료율·만족도 등 제안서가 약속한 정량 목표.
- **intensity** — totalEducationHours · totalWeeks (파생 계산).

**메타 (전 축 공통)**:
- **evidence** — 축별 원문 인용(≤200자)·근거 없는 값 금지.
- **confidence** — 축별 0~1. 원문에 없으면 **null + confidence 0** (v5.4 "[파악 불가]" 의 JSON 등가물 — 추측 채움 금지).
- extractionMeta — model · charCount · parseBy · lowText · extractedAt.

### 3. 파이프라인
- 모델: **plumbing 티어(Flash)** — 구조화 추출 (ADR-022 라우팅). `invokeAi` 단일 진입점 + responseSchema.
- 스크립트: `scripts/extract-design-patterns.ts` (148건, 동시성 제한 + 429 백오프 — QUAL-THROTTLE 패턴 재사용).
- 산출: `data/program-design/extracted/<docId>.json` + `_aggregate.json`(세그먼트별 집계) + `_run-report.json`.
- 타입·zod: `src/lib/program-design/operating-format.ts` (이 파일의 키 구조가 본 ADR 동결 대상).

### 4. VOD 콘텐츠 레이어 접점
강의 분류 v5.4 의 분류 축(청중_경험수준 × 청중_사업형태 × 비즈니스단계 × 강의영역 × 난이도 × 유효성)은 **preLearning 슬롯의 콘텐츠 해석 공간**이다. 설계 문법이 "사전학습 = LMS VOD 2시간"을 권장하면, VOD 분류가 "이 대상·단계에 어떤 영상"을 답한다. VOD 분류 데이터의 DB 이관·매칭 로직은 후속(아래 Follow-ups).

## Consequences

### Positive
- "B2G 청년 사업 코칭 회수 분포" 류 질문에 처음으로 정량 답변 가능 → Design Rule(P4) 발행 토대.
- 근거(evidence)·신뢰도 동반 추출 → 사람 스팟체크 비용 최소화.
- v5.4 와 어휘 정합 → 사전학습 슬롯이 콘텐츠 추천까지 연결될 기반.

### Negative / Trade-offs
- **패배 케이스 0건** — 현 코퍼스로는 "당선작의 공통 구조"만 학습되고 당락 변별력은 학습 불가. 패배 제안서 수급은 사용자 액션 필요.
- OCR 13건·lowText 3건·unsupported 2건은 추출 품질 저하 예상 — confidence 로 표시하고 버리지 않음.
- JSON-first 라 생성기 소비 전 DB 이관 1단계 추가.
- 키 이름 변경은 본 ADR supersede 필요 (enum 값 추가는 자유).

### Follow-ups
- [x] P3: `_aggregate.json` 기반 가설 매트릭스 검증 리포트 (지지/기각/데이터부족) — 완료 (2026-06-12, `_p3-hypothesis-report.md` + 설계 로직 v1.2)
- [ ] P4: DesignRule draft 발행 + 검수 UI (별도 브리프)
- [ ] DATA 브리프: 스키마 안정 후 ProgramDesignPattern·DesignRule DB 이관 (migration 보류 해제 시)
- [ ] VOD 분류 v5.4 실데이터(시트) 인테이크 — **사전 구조 설계 선행** (사용자가 1,000+ VOD 분류 진행 중, 완료 시 수령)
- [ ] ~~패배 제안서 수급 (사용자) → 재추출 증분 실행~~ **철회 (추록 1)**
- [ ] channel null 22건 — 추출된 profileSnapshot 으로 보정 역기입 검토
- [ ] 결과보고서 학습 — 시트의 결과보고서 링크 열을 learn-winning-fulltext 파이프라인으로 수집, docType='result-report' 구분 (추록 2)

## 추록 (Amendments)

### 추록 1 — 패배 케이스 학습 철회 (사용자 결정, 2026-06-12)
패배 제안서는 학습하지 않는다. 사유(사용자): 당락에는 프로그램 설계 외 변수(심사위원 성향·발표자 역량·가격점수·가산점·유사사업 수행실적)가 너무 많아 **잘못된 기준이 잡힐 위험**이 더 크다. 본 ADR 의 "당락 변별 학습" 목표는 폐기 — 코퍼스는 "이긴 설계의 문법" 학습용으로 충분하며 그것이 의도된 범위다.

### 추록 2 — 제안서 = 실행 구조로 간주 + 결과보고서 보강 (사용자 결정, 2026-06-12)
"약속 vs 실현 갭" 학습은 불필요 — **약속은 다 이행한다고 본다** (제안서의 운영 구조 = 실제 운영 구조). 보강 축은 결과보고서: 실행된 구조 + 실측 성과(수료율·만족도·산출)를 담으므로 동일 16축 스키마로 추출하되 `extractionMeta.docType='result-report'` 로 구분하고, kpiTargets 는 "목표"가 아니라 "실적"으로 해석한다. 주요 유형별 결과보고서 중심 증분 학습.

## References
- 관련 ADR: ADR-008 (Value Chain) · ADR-009 (Asset Registry) · ADR-019 (Workstream) · ADR-022 (모델 정책)
- 관련 문서: [docs/UD-Brain-ProgramDesignGrammar-v0.2.html](../UD-Brain-ProgramDesignGrammar-v0.2.html) (설계안) · 강의 분류 가이드 v5.4 (사용자 공급, `C:\Users\USER\Downloads\lecture_classification_v5_4.html`)
- 브리프: `.claude/agent-briefs/BR-1-design-pattern-extraction.md`
