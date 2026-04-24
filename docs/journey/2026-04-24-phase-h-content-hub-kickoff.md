# 2026-04-24 (오후) — Phase H Content Hub 착수

## 세션 맥락

Phase G Asset Registry(v1) 완료 직후 같은 날. 사용자 질문:

> "계속 교육 콘텐츠는 늘어날건데 이걸 담을 수 있도록 세팅이 되어 있을까?"

Claude 가 현재 4 개 층(L1 프로젝트 커리큘럼 · L2 표준 모듈 · L3 상품 내부 · L4 Asset Registry)의 확장 한계 5 개를 진단. 사용자의 3 답변(Q1=D 전층 / Q2=담당자 1명 / Q3=원본 외부·링크만)이 **DB 이관 + 담당자 UI + 계층 구조 + 경량화** 라는 설계를 자동 도출.

## 사용자 원문 인용

> Q1. D야
> Q2. 콘텐츠 담당자가 1명 있어
> Q3. 별도로 두고, 핵심 내용만 알고 있으면 될 것 같아.

이 3 문장이 ADR-010 의 4 개 결정(DB 이관·1단 계층·담당자 UI·원본 저장 안 함)의 근거.

## 왜 "Content Hub" 이라는 별칭

Phase G 가 "Asset Registry v1" 이었다면 Phase H 는 v2. 하지만 v1 과 구별되는 **성격 변화**가 있음:

- v1 은 "제안서 자산 인덱스" (엔지니어 관점)
- v2 는 "콘텐츠 담당자가 운영하는 허브" (운영자 관점)

따라서 ADR 에서는 "Content Hub" 로 이름 부여. 내부 타입(`UdAsset`)과 매칭 엔진 이름은 그대로 유지(`asset-registry.ts`, `matchAssetsToRfp`). 개념과 구현의 연속성 확보.

## 핵심 결정 (ADR-010)

1. **DB 테이블 `ContentAsset`** 신설 — 기존 UD_ASSETS 코드 시드 대체
2. **1 단 계층** — `parentId` 로 상품 → 세션/주차/챕터 (2 단 이상은 과잉)
3. **담당자 UI `/admin/content-hub`** — 엔지니어 PR 병목 제거
4. **원본 파일 저장 안 함** — `sourceReferences` 로 URL 만 (LMS·노션·드라이브)
5. **단순 version number** — 별도 AssetVersion 테이블은 과잉

## 타협·기각한 것

- **N 단 계층 (Program → Track → Session → Material)** 기각 — Q3 에 반함
- **별도 AssetVersion 이력 테이블** 기각 — 단일 담당자에겐 과잉
- **승인 워크플로우** 기각 — 담당자 1명
- **원본 파일 업로드** 기각 — Q3
- **과거 제안서가 어느 버전 자산을 썼는지 추적** → v3 로 미룸 (지금은 현재 version 만)

## Wave 분해 (6개)

- **H0** (이 세션) — ADR-010 · content-hub.md · journey · CLAUDE/ROADMAP
- **H1** — Prisma ContentAsset + 마이그레이션 + UD_ASSETS 15종 DB 시드 (`prisma/seed-content-assets.ts`)
- **H2** — `asset-registry.ts` 리팩터 (코드 시드 → DB 조회) + 호출부 async 전환
- **H3** — `/admin/content-hub` 관리자 UI (테이블·필터·CRUD 폼·부모 선택)
- **H4** — 계층 매칭 + MatchedAssetsPanel 부모-자식 렌더
- **H5** — 계층 시드 예시 2건 (AI 솔로 Week 1~3 · AX Guidebook Ch 1~2)
- **H6** — typecheck · MEMORY · journey 완료 · ROADMAP Phase I 로 "안정화+배포" 이동

## Wave 진행 로그 (실시간 갱신)

- [x] H0 — 문서 (이 파일 포함)
- [ ] H1 — ContentAsset + 마이그레이션 + DB 시드
- [ ] H2 — asset-registry 리팩터 + async 전환
- [ ] H3 — /admin/content-hub UI
- [ ] H4 — 계층 매칭 + 패널 확장
- [ ] H5 — 계층 시드 예시
- [ ] H6 — 검증·메모리·완료

## Phase G 와의 관계

이번 Phase H 는 Phase G 의 **저장소 교체 + UI 추가** 이다. 다음은 그대로 유지:

- `UdAsset` 타입 계약 (3 중 태그 + narrativeSnippet + keyNumbers + Value Chain 연결)
- `matchAssetsToRfp()` 시그니처 + 점수 공식 (0.5·0.3·0.2)
- `formatAcceptedAssets()` AI 프롬프트 포맷
- `MatchedAssetsPanel` UI 기본 구조
- `POST /api/projects/[id]/assets` API

리팩터는 "외피만 바꾸고 본체는 유지" 가 원칙. 이게 Phase G → H 를 빠르게 만드는 이유.

## 원칙 재확인

- **feedback_gatekeeping** — 사용자의 한 질문("담을 수 있나?")이 2 번째 설계 게이트 작동. 3 대안 제시 후 사용자 결정으로 범위 확정.
- **CLAUDE.md 2번** (내부 자산 자동 올림) — v1 에서 구조를 만들었다면 v2 에서 운영이 실제로 돌아가는 채널을 연다.
- **"모든 과정들 기록 잘해주고"** (2026-04-23 사용자 지시) — 이 journey 가 해당 원칙의 연속.
