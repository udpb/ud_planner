# ADR-009: UD Asset Registry + RFP 자동 매핑

- 일자: 2026-04-24
- 상태: Accepted
- 선행: [ADR-006 ProgramProfile v1.1](006-program-profile.md) · [ADR-007 스텝 차별화 리서치](007-step-differentiated-research-flow.md) · [ADR-008 Impact Value Chain](008-impact-value-chain.md)
- 후속: Phase G — Asset Registry Wave

## 결정

언더독스가 보유·개발 중인 **자산(asset)을 단일 레지스트리에 등록**하고, RFP 가 들어오는 순간 **자동으로 적재적소에 꽂히는** 매핑 체계를 도입한다. 자산은 3중 태그(RFP 섹션 · Value Chain 단계 · 증거 유형)로 분류하고, `ProgramProfile` 11축 유사도 + RFP 파싱 결과로 점수화하여 PM 에게 투입 후보로 제시한다.

**핵심 정의**

- **Asset**: UD 가 제안서·실행에서 반복 재사용할 수 있는 자원. 방법론·콘텐츠·프로덕트·데이터·프레임워크의 5 카테고리.
- **3중 태그**:
  - `applicableSections[]` — 어느 RFP 섹션(`ProposalSectionKey`)에 들어갈 수 있는가
  - `valueChainStage` — 어느 Value Chain 단계(ADR-008)에 속하는가
  - `evidenceType` — 어떤 증거 유형(quantitative · structural · case · methodology)으로 작동하는가
- **narrativeSnippet**: 제안서에 실제 삽입될 2~3 문장 초안. 각 자산이 스스로 "이 자산을 제안서에 쓸 때 이렇게 말한다" 를 갖고 있음.

## 배경

### Phase F 완료 시점에서 드러난 공백

Phase F(Impact Value Chain) 까지 완료된 시점의 파이프라인은 "**왜**(Impact) → **어떻게**(Activity) → **얼마나**(Outcome/SROI)" 를 구조화했다. 그러나 **"뭐로"(Input)** 는 여전히 PM 개인의 기억·노션 뒤지기·전화 돌리기에 의존한다.

구체 사례:
- "이 RFP 에 UCA 코치 풀이 들어가야 하나?" — PM 이 기억해서 찾아야 함
- "IMPACT 6단계를 어느 섹션에 쓸지" — PM 마다 다른 배치
- "Alumni 25,000명 데이터를 어떻게 인용할지" — 매 프로젝트 새로 작성
- "SROI 프록시 DB 가 있다" 는 정보조차 신입 PM 은 모름

즉 **자산은 많지만 RFP 앞에서 쉽게 안 꺼내진다**. 이게 제1원칙(feedback_first_principle) 의 "언더독스 차별화" 가 실제로 구현되지 못하는 구조적 원인.

### 설계 원칙 (CLAUDE.md) 과의 정합

이미 설계 철학 2번에 적혀 있음:
> "**내부 자산은 자동으로 올라온다** — IMPACT 모듈·코치·SROI 프록시 등 PM이 찾아가지 않음"

Asset Registry 는 이 원칙의 **물리적 구현체**다. Phase E 가 IMPACT 모듈·코치 일부만 커버했다면, Phase G 는 **모든 자산을 동일 구조로** 올린다.

### 조직 맥락 고려

Q2 워크샵 문서(2026-04 udlabs 기획) 에서 자산 정리가 내부적으로 진행 중이라는 사실이 확인됐다. 즉:
- Asset Registry 스키마를 **지금 먼저 확정**하면 조직 내부 자산 정리 결과물이 곧바로 시스템에 주입 가능한 형태로 수렴
- 담당자·운영 체계 같은 조직 내부 정보는 **Registry 밖에 둔다** (UI·RFP 출력에는 나가지 않음)

## 대안 비교

### 대안 A (채택): 코드 기반 Registry (TypeScript 시드) + 3중 태그 + 점수 매칭

- `src/lib/asset-registry.ts` 에 `UdAsset[]` 상수로 시작
- 자산이 안정화되면 Prisma 테이블로 마이그레이션 (Phase G4+ 판단)
- 3중 태그 분류
- `matchAssetsToRfp(rfp, profile)` 헬퍼 — 점수 0~1 반환
- Step 1 RFP 파싱 직후 UI 에 후보 패널
- Step 6 제안서 생성 시 승인된 자산의 narrativeSnippet 자동 주입

### 대안 B: 바로 DB 테이블 (Prisma Asset 모델)

- 장점: 런타임 CRUD 가능, 관리 페이지 쉬움
- 단점: 마이그레이션 필요, 스키마 굳히는 비용이 지금은 이름 (자산이 매일 바뀌는 단계)
- 탈락: **"스키마가 먼저 안정되고 나서 DB 로"** 의 반대 순서는 비용만 높음

### 대안 C: 노션 통합 (현재 운영 중인 곳)

- 장점: PM 들이 이미 쓰는 곳
- 단점: API 불안정, 3중 태그 강제 어려움, Ops Workspace 와 왕복 비용
- 탈락: 노션은 **원본 기록** 으로 유지하되, Registry 는 **런타임 인덱스** 로 분리. 동기화는 별도 ingestion 으로.

## 결과 (기대 효과)

1. **신입 PM 도 자산을 잊지 않는다** — RFP 파싱 직후 "이 자산이 이 섹션에 들어가면 좋겠다" 가 자동 제시됨
2. **수주 언어 일관성** — 각 자산의 narrativeSnippet 이 여러 제안서에서 통일된 톤으로 출현 → 브랜드 축적
3. **자산 활용률 측정 가능** — 어느 자산이 몇 번 제안서에 실렸는지 추적 → 다음 자산 투자 우선순위 근거
4. **Q2 워크샵 대비 속도** — 조직 내 자산 정리 결과가 도착하자마자 스키마에 부어 넣을 수 있음
5. **Value Chain 과 직교** — 각 자산이 어느 논리 단계(⑤ Outcome 중심인지 ④ Activity 성격인지)를 가진 것이 명시되므로, Phase F 의 다이어그램·루프 Gate 와 자연스럽게 연결

## 리스크 + 대응

| 리스크 | 대응 |
|---|---|
| 자산 목록이 자주 변경되어 레지스트리가 빨리 낡음 | 코드 시드로 시작 → 주 단위 갱신 허용 → 안정화 후 DB 이관 |
| narrativeSnippet 이 제안서에 그대로 복붙되어 "우리 이 회사 제안서 다 똑같네" 인상 | Snippet 은 **초안**이며 PM 편집 필수. AI 프롬프트가 "이 자산을 다른 표현으로 재작성" 옵션 제공 |
| 매칭 점수가 엉뚱한 자산을 상위로 밀어낼 위험 | 점수 임계 아래면 "매칭 약함" 라벨. PM 이 보고 제외 가능. `matchReasons[]` 로 근거 표시 |
| 담당자·내부 운영 정보가 레지스트리에 섞이면 사용자가 원하지 않는 정보 노출 | `UdAsset` 스키마에 `owner`/`internalContact` 필드 **두지 않음**. 운영은 다른 체계. |

## 구현 스코프 (Phase G Wave)

상세: [docs/architecture/asset-registry.md](../architecture/asset-registry.md)

- **G0** — 문서 (이 ADR + architecture spec + journey + CLAUDE/ROADMAP)
- **G1** — 코어 타입 `src/lib/asset-registry.ts` (UdAsset · AssetCategory · EvidenceType · 매칭 계약)
- **G2** — 스키마 판단 (DB 테이블 vs 시드 — G0 에서 이미 시드 채택, G2 에서 재확인 + 시드 파일 구조)
- **G3** — 시드 자산 ~15종 (방법론 3 · 콘텐츠 3 · 프로덕트 4 · 데이터 3 · 프레임워크 2)
- **G4** — `matchAssetsToRfp(rfp, profile)` 헬퍼 + 점수 알고리즘
- **G5** — Step 1 매칭 자산 패널 UI (섹션별 그룹 · 단계 뱃지 · 증거 유형 뱃지)
- **G6** — Step 6 제안서 생성 시 승인된 자산의 narrativeSnippet 주입
- **G7** — 검증 · 메모리 · 완료 기록

## 연결된 규칙 (유지 · 강화)

- **ADR-002 Module Manifest**: Asset Registry 는 새 모듈(`asset-registry`) 로 manifest.ts 보유. `reads: programProfile · rfp`, `writes: 없음 (자산 자체는 읽기 전용)`.
- **ADR-006 ProgramProfile**: 매칭 점수의 주축은 11축 유사도. 자산에 `programProfileFit?: Partial<ProgramProfile>` 태그.
- **ADR-007 스텝 차별화 리서치**: 리서치가 PM 에게 던지는 "외부 질문" 이라면, Asset Registry 는 "내부 답변". 쌍으로 작동.
- **ADR-008 Impact Value Chain**: 자산의 `valueChainStage` 는 Phase F 의 `ValueChainStage` 유니온 그대로 재사용.

## 히스토리

- 2026-04-23 — Q2 워크샵 대화에서 자산 → RFP 매핑 필요성 구체화 ([journey/2026-04-23-impact-value-chain-adoption.md](../journey/2026-04-23-impact-value-chain-adoption.md) 참조)
- 2026-04-24 — Phase F 완료 직후 Phase G 착수, ADR-009 작성
