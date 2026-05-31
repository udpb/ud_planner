# 글로서리 — 용어/스키마 단일 진실 원천 (SSoT)

> ud-ops 제안서 자동화의 모든 용어·스키마 명칭의 단일 출처. 코드 · 문서 · 브리프 · 사용자 가시 라벨이 여기에 정렬한다.
> 최초 작성: 2026-06-01 (ADR-020 부트스트랩). 기존 코드/문서에서 역추출한 1차본 — 사용자 검토 후 확정.

## 작성/변경 룰
1. **추가** — 신규 용어는 출처(코드 경로/ADR) + 코드/문서 사용처 + 한국어 라벨 동시 등록.
2. **변경** — 의미 변경은 **ADR 필요**. 기존 항목 `~~취소선~~` + 신규 + `Supersedes: <날짜/ADR>`.
3. **삭제** — 무성 삭제 금지. ADR-deprecate → 유예 → 제거.
4. **alias** — 의미 동일한 유입 유사어는 표준어 옆 `alias:` 표기. **코드는 표준어만**.
5. **약자 충돌** — namespace 분리 (예: `Phase-M` vs `Wave-M-Impact`).
> 신 자료(RFP·당선제안서·외부 책) 흡수 시: 핵심 용어 추출 → 본 글로서리 대조 → 충돌 시 STOP → ADR → 갱신 → 코드 일괄 정리.

---

## §1. 제품 · 트랙

| 용어 | 의미 | 출처 |
|---|---|---|
| **Express Track** | 메인 트랙. RFP → 30~45분 → "당선 가능한 기획 1차본". 단일 화면 챗봇 + 슬롯필링. | ADR-011 |
| **Deep Track** | 보조 트랙. 6스텝 정밀 파이프라인 (RFP→커리큘럼→코치→예산→임팩트+SROI→제안서). | ADR-001 |
| **Brain** | 지식 서브시스템. 자산·당선제안서 학습 → concept 그래프·당선패턴·RAG → 생성에 투입. | PRD-Brain |
| **Workstream (과업)** | 프로젝트를 구성하는 타입된 과업 단위. 1급 레이어로 승격 예정. | ADR-019 (Proposed) |

## §2. 과업유형 (Workstream Type) — ADR-019

ProgramProfile 6종(각 RFP 배점 1:1)을 골격으로 승격. 확장 후보 포함.

| 과업유형 | 연결 RFP 배점 | 비고 |
|---|---|---|
| 모객 | 모집 전략 | ProgramProfile 축9 |
| 심사_선발 | 심사·선정 설계 | |
| 교류_네트워킹 | 차별화(파트너·동문) | |
| 멘토링_코칭 | 수행역량(4중 지원) | 코치는 이 과업의 디테일 |
| 컨설팅_산출물 | 수행능력(산출물) | |
| 행사_운영 | 운영역량·집객 실적 | |
| (확장) 교육·특강연사·장소 | TBD | ADR-019 확정 시 |

## §3. 제안서 구조 (Express schema)

| 용어 | 의미 |
|---|---|
| **7섹션** | ①제안 배경 및 목적 ②추진 전략 및 방법론 ③교육 커리큘럼 ④운영 체계 및 코치진 ⑤예산 및 경제성 ⑥기대 성과 및 임팩트 ⑦수행 역량 및 실적 (`src/lib/express/schema.ts`) |
| **keyMessages** | 핵심 메시지 (현재 최대 3, ADR-019 시 3~5). string[] |
| **messageHierarchy** | 키메시지당 뒷받침 디테일 (3-3 hierarchy). keyMessages 진화 버전 |
| **narrativeSnippet** | 자산이 섹션 초안에 자동 박히는 1줄 인용 (자동 인용) |
| **sectionKey** | 자산→섹션 매핑 키 (`proposal-background` 등 → '1'~'7') |

## §4. 채널 (Channel)

| 코드 | 의미 |
|---|---|
| **B2G** | 정부·공공 발주 |
| **B2B** | 기업 발주 |
| **renewal** | 갱신/재계약 |
> Inspector 가중치·사이드바·진단 lens 만 채널별 분기. 슬롯 12개는 공통 (ADR-013).

## §5. Value Chain · SROI (ADR-008)

`① Impact(의도·Before/After) → ② Input(자원) → ③ Output(RFP/산출물) → ④ Activity(커리큘럼·코칭) → ⑤ Outcome(SROI)`. **⑤ Outcome = SROI Forecast = 루프 수렴점.** 각 UI 스텝은 `valueChainStage` 태그.

## §6. 자산 · Content Hub (ADR-009·010)

| 용어 | 의미 |
|---|---|
| **ContentAsset** | 자산 단일 레지스트리 (DB). 3중 태그(카테고리·섹션·Value Chain). |
| **AssetUsage** | 자산 사용 추적. |
| **Content Hub** | `/admin/content-hub` 담당자 UI + 1단 계층(상품→세션/주차/챕터). |

## §7. Brain · RAG

| 용어 | 의미 |
|---|---|
| **WinningProposalDoc / Chunk** | 당선 제안서 풀텍스트(148건) + 섹션 청크(2048) + 임베딩. `sourceFileId @unique`(멱등). |
| **WinningPattern** | 당선 3-tuple(message/logicGraph + 벡터). |
| **Concept / ConceptRelation** | concept 그래프 (8 유형 + 공기 강도). |
| **RAG 검색** | `winning-reference.ts` — 의미검색으로 당선 언어 회수. |
| **embedding** | ⚠️ **실제 3072 dim** (`gemini-embedding-001`). 코드 일부 주석 "768"은 오류 — 정정 대상. |

## §8. AI

| 용어 | 의미 |
|---|---|
| **invokeAi** | 단일 진입점 (`src/lib/ai-fallback.ts`). provider/model 중립. eslint 가 우회 차단. |
| **모델 정책 (ADR-022·023)** | **Gemini 단일화**(Claude 제거). 2-tier: 품질-결정=**Pro `gemini-3.1-pro-preview`** / plumbing=**Flash `gemini-3.5-flash`**(~2.5× 빠름). 폴백=intra-Gemini(Pro→pro-latest→Flash). 라우팅 표=`ai/config.ts`(가변). thinking 모델→`thinkingConfig`·maxOutputTokens 크게. |
| **SDK** | ⚠️ 현 `@google/generative-ai`(EOL·아카이브, 2025-11-30) → **`@google/genai`(GA) 마이그레이션 예정**(ADR-023, AI-1). 네이티브 `responseSchema` 구조화출력 채택. |
| **safeParseJson** | JSON 복구 헬퍼 (`src/lib/ai/parser.ts`). 모든 JSON 파싱은 이걸로. |

## §9. ⚠️ 명명체계 충돌 정리 (가장 중요)

ud-ops 는 명명 체계를 3번 바꿔서 충돌이 심함. **약어 사용 시 항상 풀네임 병기.**

| 체계 | 범위 | 예 |
|---|---|---|
| **Phase A~L** | 원본 12 Phase (파이프라인 + Express base) | ADR-001~011 |
| **Phase M** | Express 2.0 (ADR-013) — ⚠️ **Wave M-Impact 와 다름** | |
| **Wave U/V/W** | UX/통합/톤 (ADR-014/015/017) | Wave V = ADR-015 = ux-v2 branches = ADR-018 |
| **Wave M-Impact** | Impact embed — ⚠️ Phase M 과 완전히 다른 영역 | |
| **Brain Waves W14~W32** | Brain Sphere-2 레이어 — ⚠️ **"Wave W"(ADR-017)와 완전히 다름** | PRD-Brain |
| **alpha-test K~P** | 알파 prep 시리즈 (K3·P9~P12 등) | journey 2026-05-29~31 |

**최악 충돌**: `Wave W`(ADR-017 톤/패턴) ≠ `Brain W-series Waves`(레이어). 둘 다 "W".

## §10. TBD (확정 대기)

| 잠정 | 확정 시점 | 비고 |
|---|---|---|
| 과업유형 최종 enum | ADR-019 Accepted | 6종 + 확장 후보 |
| 단일 제안서 생성 엔진 명칭 | ADR(후속) | 현재 3엔진 표류 (produce-ultimate-draft / proposal-ai / proposal-section) |
> ⚠️ 위 확정 전까지 코드에 유사어 동시 도입 금지.

---

## §11. 자주 충돌하는 유사어 (예방)
- `과업` = workstream (NOT task/job 혼용 금지)
- `섹션` = 제안서 7섹션 (NOT stage/step)
- `스텝` = Deep 6스텝 (NOT stage)
- `stage` = Wave V 5 Stage UI (S1~S5) — Deep 스텝과 구분
- `자산` = ContentAsset (NOT material/resource 혼용)

## 변경 이력
- **2026-06-01** — 1차본 작성 (ADR-020). 기존 코드/문서 역추출. 사용자 검토 후 §본문 확정 예정.
