# 2026-04-24 — Phase G Asset Registry 착수

## 세션 맥락

Phase F(Impact Value Chain) 완료 직후. 사용자 "다음으로 진행해줘" → Claude 가 제시한 3 옵션(A 후속 TODO / B 브라우저 E2E / C Phase G)에 대해 사용자 "c로 가보자" 로 Phase G 착수 확정.

## 왜 Phase G 가 자연스러운 다음 단계인가

Phase F 완료 시점의 파이프라인은 "**왜**(Impact)·**어떻게**(Activity)·**얼마나**(Outcome/SROI)" 를 구조화했다. 하지만 **"뭐로"(Input)** 는 여전히 PM 기억·노션 뒤지기에 의존.

- UCA 코치 풀이 이 RFP 에 맞나? — PM 개인 판단
- IMPACT 6단계를 어느 섹션에? — PM 마다 다름
- Alumni 25,000명을 어떻게 인용할지? — 매번 새 작성
- SROI 프록시 DB 존재 사실조차 신입 PM 은 모름

CLAUDE.md 설계 철학 2번에 이미 적혀 있는 원칙:
> "**내부 자산은 자동으로 올라온다** — IMPACT 모듈·코치·SROI 프록시 등 PM이 찾아가지 않음"

Phase E 가 IMPACT·코치 일부만 처리했다면, Phase G 는 **모든 자산을 동일 3중 태그 스키마**로 통합한다.

## Q2 워크샵 대화의 영향

2026-04-23 Q2 워크샵 문서(udlabs Q2 기획) 검토 대화에서 이미 Phase G 설계 밑그림이 그려졌었다. 주요 포인트:

- **자산 인벤토리 18종 식별됨**: IMPACT 6단계 · UOR · Act Canvas · AI 솔로프러너 · AX Guidebook · UCA 풀 · Coach Finder · Coaching Log · Ops Workspace · LMS+AI봇 · Alumni Hub · 고객사 DB · SROI 프록시 · Benchmark · Before/After AI 프레임 · 5-Phase 루프 등
- **담당자 이름은 제외** (사용자 명시): 조직 운영 정보는 Registry 밖에 둠
- **시스템에 Q2 실행 계획을 과하게 반영하지 않음**: Registry 는 인벤토리만, 운영은 별도

사용자 원문:
> "여기에 담당자 이름이 지금 들어갈 필요는 없을 것 같아. 그리고 이건 2분기 우리 계획이니까 이 내용들이 너무 강하게 들어가기보다는 너가 어떤 프로덕트들과 asset이 있고, 나오고자 하는지를 인지하기 위해서 공유해준거야"

이 제약이 ADR-009 의 설계 원칙에 정식 반영됨 (UdAsset 스키마에 `owner`/`internalContact` 필드 없음).

## 핵심 설계 결정 (ADR-009)

1. **3중 태그 분류**
   - `applicableSections[]` — RFP 섹션 (ProposalSectionKey)
   - `valueChainStage` — Value Chain 단계 (ADR-008 직접 재사용)
   - `evidenceType` — 증거 유형 (quantitative · structural · case · methodology)

2. **저장 전략**: 코드 시드 먼저 → DB 이관은 안정화 후
   - `src/lib/asset-registry.ts` 에 `UdAsset[]` 상수
   - 프로젝트별 승인 상태만 DB (`Project.acceptedAssetIds Json?` 단일 필드)
   - 마이그레이션 1건, 스키마 비용 최소화

3. **점수 공식**
   ```
   score = 0.5 * profileSimilarity
         + 0.3 * keywordOverlap
         + 0.2 * sectionApplicability
   ```
   - profileSimilarity 는 Phase E 의 기존 함수 재사용
   - 0.7↑ 강한 매칭 / 0.5↑ 중간 / 0.3↑ 약한

4. **narrativeSnippet**: 각 자산이 "제안서에 이렇게 써라" 2~3 문장 초안 보유
   - PM 편집 가능 (복붙 방지 장치)
   - AI 프롬프트에 주입 시 "재작성 요구" 명시

## Wave 분해

- **G0** (이 세션) — 문서: ADR-009 · architecture/asset-registry.md · 이 journey · CLAUDE/ROADMAP 업데이트
- **G1** — 코어 타입 `src/lib/asset-registry.ts`
- **G2** — 스키마 판단 확정 + `Project.acceptedAssetIds` 마이그레이션
- **G3** — 시드 자산 15종 작성
- **G4** — `matchAssetsToRfp()` 점수 알고리즘
- **G5** — Step 1 매칭 자산 패널 UI
- **G6** — Step 6 제안서 AI 에 자산 narrativeSnippet 주입
- **G7** — 검증 + 메모리 + 완료

## Wave 진행 로그

- [x] G0 — 문서 (이 파일 포함) · 커밋 `9af914a`
- [x] G1 — 코어 타입 (UdAsset · manifest) · 커밋 `c157863` · typecheck 0
- [x] G2 — Project.acceptedAssetIds 컬럼 + PipelineContext 슬라이스 · 커밋 `833819f`
- [x] G3 — 시드 자산 15종 (methodology 3 · content 3 · product 4 · human 1 · data 3 · framework 1) · 커밋 `4947254`
- [x] G4 — matchAssetsToRfp() 점수 알고리즘 (profileSim 0.5 + keyword 0.3 + section 0.2) · 커밋 `a489880`
- [x] G5 — Step 1 매칭 자산 패널 + POST /api/projects/[id]/assets · 커밋 `a2c8d8a`
- [x] G6 — Step 6 proposal-ai.ts 자산 주입 (formatAcceptedAssets · SECTION_NO_TO_KEY) · 커밋 `e9ad4ac`
- [x] G7 — 검증·메모리·완료 (이 세션) — 전체 typecheck 0 errors

## Phase G 완료 요약

**7 커밋 + 1 마이그레이션 · typecheck 0 errors**. 브라우저 E2E 검증은 다음 세션에.

핵심 구현:
1. 자산 레지스트리 (`src/lib/asset-registry.ts`) — UdAsset · 3중 태그 · 15종 시드 · matchAssetsToRfp · formatAcceptedAssets
2. 자산 모듈 manifest (`src/modules/asset-registry/manifest.ts`) — layer='asset'
3. DB 컬럼 Project.acceptedAssetIds JSON (마이그레이션 1건)
4. Step 1 Output 탭에 매칭 자산 패널 (섹션별 그룹 · 승인 토글)
5. Step 6 proposal-ai 프롬프트에 자산 블록 자동 주입
6. 소프트 마커 `<!-- asset:id -->` 추적 체계

남긴 후속 TODO:
- MatchAssetsParams 에 evalStrategy 옵션 확장 (현재는 RfpParsed 만 받으므로 섹션 점수 0.5 기본)
- ProgramProfile.methodology.primary 유니온 확장 시 'AI 솔로프러너' fit 축 추가 재검토
- 자산 수가 30+ 에 도달하면 DB 테이블(Asset + AssetVersion) 로 이관 검토
- /assets 관리자 페이지 (자산 CRUD UI) — 필요 시

## Phase F 대비 예상 차이점

| 측면 | Phase F | Phase G |
|---|---|---|
| 핵심 | 의미 레이어 정렬 | 자산 레이어 올림 |
| 변경 규모 | UI 구조 재배치 (tabs/diagram/loop gate) | 신규 모듈 + 시드 + 매칭 엔진 |
| DB 변경 | 0건 | 1건 (`acceptedAssetIds`) |
| AI 영향 | 프롬프트 변경 작음 | Step 6 제안서 AI 프롬프트 확장 |
| PM 경험 변화 | "내가 어느 단계에 있는지 보임" | "내 자산이 자동으로 섹션에 꽂힘" |

## 원칙 재확인

ADR-009 는 다음 원칙들이 실제로 구현되었는지 검증하는 시험대:

- **feedback_first_principle** (제1원칙 — RFP 설득력 + 차별화): 자산이 자동 제시되면 "언더독스 차별화" 가 PM 의 기억에 의존하지 않음.
- **feedback_gatekeeping** (게이트마다 설계 재검토): G0 에서 시드 vs DB 판단, G2 에서 재확인 — 두 번의 게이트.
- **CLAUDE.md 2번** (내부 자산 자동 올림): 이 원칙의 **첫 물리적 구현**.
