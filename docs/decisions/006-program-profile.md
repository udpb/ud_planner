# ADR-006: ProgramProfile 축 체계 도입

**Status**: Accepted
**Date**: 2026-04-20
**Deciders**: 사용자(udpb) + AI 공동기획자
**Supersedes**: 기존 WinningPattern 3축 (sectionKey × channelType × outcome) 만으로 사업 스펙트럼을 매칭하던 방식

---

## Context

Smoke Test 에서 Step 2 커리큘럼 AI 생성 품질이 낮게 나옴. 근본 원인 조사 결과:

1. **WinningPattern 축 부족** — `channelType` (B2G/B2B/renewal) 1축으로는 "B2G 청년창업 데모데이"와 "B2G 로컬상권 오프라인 5개월"을 같은 패턴으로 취급
2. **IMPACT 편향** — `static-content.ts` 에 "IMPACT 모듈 미매핑 = 실수" 가 하드코딩되어 있어 IMPACT 를 쓰지 않는 사업(8케이스 중 5건)에도 잘못된 경고
3. **사업 유형 스펙트럼 누락** — 데모데이 / 네트워킹 / 외부연사 / 온오프라인 / LMS / 공모전 / 심사 / 사후관리 등 핵심 변수가 모델링 안 됨

2024-11 에 교육 콘텐츠 분류 체계 스프린트(엑셀) 가 있었고, 비즈니스 분야 19종 / 대상 6종 / 지역 6종 등 풍부한 분류 체계가 설계되어 있음. 이를 ProgramProfile 의 하위 필드로 재사용.

---

## Decision

**사업 단위 프로파일 축 체계 `ProgramProfile` 을 도입한다.**

- **11개 핵심 축** — 대상 3축(단계·인구·분야) · 지역 · 규모 · 포맷 · 운영 · 지원구조 · 방법론 · 심사 · 발주처 · 임팩트 · 사후관리
- **핵심 원칙**: 특정 축의 절대값이 아니라 **축 조합의 유사도**로 WinningPattern 검색
- **방법론은 enum으로 시작** — 9개 값(IMPACT, 로컬브랜드, 글로컬, 공모전설계, 매칭, 재창업, 글로벌진출, 소상공인성장, 커스텀). 방법론이 15개+ 로 늘거나 외부 파트너 방법론 수용이 필요하면 ASSET 테이블로 이관
- **연속사업(renewal)은 `renewalContext` 필수** — 작년 레슨런·성과·개선영역이 없으면 Gate 3 가 블로킹
- **자동 연동 매트릭스** — `formats.공모전` ↔ `selection.공모전형` 등 논리적 종속 필드 자동 동기화
- **primaryImpact 복수 선택** — 단일 사업이 다차원 임팩트를 동시 추구 (예: 안성 = 지역활성화 + 글로벌확장)

상세 스펙: [docs/architecture/program-profile.md](../architecture/program-profile.md) v1.0

---

## Considered Alternatives

### 대안 1. 현행 유지 (WinningPattern 3축만 사용)
- **장점**: 개발 비용 0
- **단점**: Smoke Test 실패 원인이 해결되지 않음. 신규 사업 유형마다 패턴 왜곡.
- **거절 이유**: 근본 원인 해결 불가.

### 대안 2. 방법론을 ASSET 테이블로 (처음부터)
- **장점**: 관리자가 방법론 추가 가능. 무한 확장.
- **단점**: 초기 설계 복잡도 증가. 실제 방법론 종류가 10개 미만으로 예측되는 현 시점에선 과설계.
- **거절 이유**: enum 으로 시작해도 향후 ASSET 이관 경로가 열려 있음. YAGNI.

### 대안 3. 2024-11 엑셀 분류를 그대로 사용
- **장점**: 기존 자산 활용
- **단점**: 엑셀은 **교육 모듈(콘텐츠)** 단위 분류. ProgramProfile 은 **사업(프로젝트)** 단위. 스케일이 다름. 또한 엑셀에 LMS / AI챗봇 / IMPACT 방법론이 없음.
- **거절 이유**: 엑셀 분류를 하위 축(`targetSegment.businessDomain` 등) 으로 흡수하되 ProgramProfile 자체는 상위 구조로 신설.

### 대안 4. 단일 임팩트 선택 (primaryImpact)
- **장점**: 모델 단순
- **단점**: 실제 사업은 다차원 임팩트 — 안성=지역+글로벌, 관광=매출+수출
- **거절 이유**: 사용자 Q10 답변 + 케이스 검증 결과 복수 선택이 현실과 일치.

---

## Consequences

### Positive

- **Smoke Test 품질 개선 경로 확보** — 방법론 분기 + 프로파일 유사도 매칭으로 AI 프롬프트가 맥락에 맞춰 조정됨
- **IMPACT 편향 제거** — `methodology != IMPACT` 일 때 IMPACT 관련 경고·강제 비활성화
- **연속사업 품질 강제** — `renewalContext` 블로킹 룰로 "처음 뵙는" 어조 방지, 작년 성과 연결 필수
- **가이드북 재구성 근거** — Ch.10 발주처 3카드 → 축 기반 다차원 카드로 재편 가능
- **2024-11 엑셀 자산 재사용** — 비즈니스 분야 19종 등 이미 설계된 분류 체계가 하위 필드로 들어감
- **케이스북 데이터 일관성** — 모든 케이스가 동일 축으로 태깅되어 검색·비교 용이

### Negative / Risks

- **기존 WinningPattern 레코드 마이그레이션 필요** — `sourceProfile` 필드를 수동 채워야 함 (초기 8케이스 + 추가 시드)
- **UI 복잡도 증가** — Step 1에 13개 축 입력 필드. 4+7 접기/펼치기 전략으로 완화하지만 학습 비용 존재
- **enum 변경 시 마이그레이션** — 방법론 enum 값이 늘어날 때마다 Prisma 마이그레이션 + 코드 수정. ASSET 이관 시점 판단 필요
- **AI 자동 추론 품질 의존** — RFP 텍스트에서 프로파일 축을 자동 채우는 AI 가 부정확하면 PM 이 매번 교정 부담

### Neutral

- **Gate 3 룰이 조건부로 복잡해짐** — `methodology.primary` 에 따라 활성화되는 룰이 달라짐. 룰 매트릭스를 ADR 에 고정.

---

## Implementation

1. **Prisma 스키마 추가** — `Project.programProfile Json?`, `Project.renewalContext Json?`, `WinningPattern.sourceProfile Json?`, `ProfileTag` 모델
2. **TypeScript 타입 정의** — `src/lib/program-profile.ts` — 11축 인터페이스 + 자동 연동 헬퍼
3. **pm-guide/resolve.ts 개편** — 축 가중치 기반 유사도 매칭 (Part 5.2)
4. **AI 프롬프트 분기** — `src/lib/curriculum-ai.ts`, `src/lib/proposal-ai.ts` 에 methodology 분기 블록 추가 (Part 5.3)
5. **Gate 3 룰 확장** — `src/lib/proposal-rules.ts` 에 v1.0 룰 5종 추가 (Part 5.5)
6. **Step 1 UI 프로파일 패널** — 4+7 접기/펼치기, 자동 연동, 신뢰도 색상 (Part 4)
7. **초기 시드** — 8케이스 + 청년마을 + 재창업 프로파일 수동 태깅 → WinningPattern.sourceProfile 에 투입

예상 구현: **2~3일** (Phase E 일부로 진행)

---

## References

- [docs/architecture/program-profile.md](../architecture/program-profile.md) v1.0
- [ADR-001 스텝 순서](./001-pipeline-reorder.md)
- [ADR-002 Module Manifest](./002-module-manifest-pattern.md)
- [ADR-003 Ingestion](./003-ingestion-pipeline.md)
- [ADR-005 가이드북 시스템 분리](./005-guidebook-system-separation.md)
- 2024-11 교육 콘텐츠 재정비 스프린트 엑셀 (사용자 첨부, Downloads/)
- Q1~Q12 답변 세션 (2026-04-20)
