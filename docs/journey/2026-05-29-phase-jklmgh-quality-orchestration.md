# Phase J~L · M · G · H · I · J(voice) — Quality Orchestration 정리

**기간**: 2026-05-27 ~ 2026-05-29 (3일)
**목적**: 청년마을 PDF · guidebook · Brain DB 학습을 *진짜 와닿는 1차본* 으로 연결.
**결론**: 코드·schema 다 만들었지만 **검수 부실** + **DB 마이그레이션 미이행** + **inferBudget 계산 결함** → 다음 compact 후 K 시리즈 (data migration · 검수 fix) 진행 예정.

---

## 1. 머지된 PR 시퀀스 (총 13개)

| # | PR | 작업 | 효과 |
|---|---|---|---|
| 37 | brain-phase-j-message-hierarchy | schema 확장 (`messageHierarchy` + `sectionMeta` + 11-lens) | schema 만 |
| 38 | brain-phase-k-proposal-patterns | 12 패턴 seed (청년마을·guidebook·Pyramid·SCQA·MECE·STAR) | dead code (활성화 PR#41) |
| 39 | brain-phase-l-render-hierarchy | render-markdown 에 One Page One Thesis + MECE 검출 | 출력에 반영 |
| 40 | brain-phase-l-quality-fixes | Inspector 11-lens 정합성 (enum + 채널 가중치) + V8 검증 | 검증만 |
| 41 | brain-phase-m-llm-wireup | extractor 화이트리스트 + slot-guide 에 hierarchy/sectionMeta 생성 지시 | wire-up |
| 42 | phase-m-final-3guardrails | 빌드 + 실 LLM + E2E + DraftEnrichmentEditor 편집 UI | UI 가드 |
| 43 | phase-m-f5-stage-override | `?stage=Sn` URL override + launch.json (preview MCP) | 검증용 |
| 44 | phase-g1-asset-self-service | 파일 업로드 + 자동 텍스트 추출 (`/api/content-hub/extract-file`) | self-service |
| 45 | phase-g2-reasoning-trace | `SourceTrace` schema + `ReasoningTooltip` (⊕ 클릭 시 자산·패턴) | 신뢰도 trace |
| 46 | test-real-2025-won-rfp | A.25.0050 성균관대 GTM 풀 시뮬 (단순 키워드 일치 12/12) | mock data |
| 47 | phase-h-quality-orchestration | `produceUltimateDraft` 통합 — H1~H6 (clientContext · risks · coherence · inspect) | 통합 orchestration |
| 48 | phase-i-auto-fill | 자동 채움 3종 (sections.7 track-record · sections.5 inferBudget · deep-research) | section 채움 |
| 49 | phase-j-voice-preservation | originalQuote schema + ToneProfile + Pyramid prompt + MAX_TEXT_LEN 200K | voice 보존 |

---

## 2. 생긴 신규 모듈 (src/lib/express)

| 파일 | 역할 | 작동 검증 |
|---|---|---|
| `client-context.ts` | 발주처 unique vocab/KPI/likelyQuestions 1 LLM | ✅ 검증 |
| `tone-patterns.ts` | WinningPattern.tonePatterns → ToneProfile | ✅ DB 92건 활용 검증 |
| `track-record.ts` | sections.7 — WinningPattern 102 + case ContentAsset 153 매칭 | ⚠ 검수 안 함 |
| `infer-budget.ts` | sections.5 — ProposalBudgetItem 1,410 평균 비목 | ❌ 평균 계산 결함 (인건비 9.6% vs 실 21.9%) |
| `deep-research.ts` | 외부 자료 5건 + domainInsight | ⚠ hallucination 검수 안 함 |
| `produce-risks.ts` | 평가위원 risks 4~6건 능동 답변 | ✅ 검증 |
| `coherence-pass.ts` | 7-section narrative arc 보강 | ✅ 검증 |
| `produce-ultimate-draft.ts` | 위 모두 orchestrate (18 LLM / ~6분) | ✅ 흐름 검증 |

## 3. UI 컴포넌트 (src/components/express)

- `DraftEnrichmentEditor.tsx` — hierarchy/sectionMeta 인라인 편집 + debounced 자동 저장
- `ReasoningTooltip.tsx` — ⊕ 아이콘 → 자산·패턴·reasoning 펼침

## 4. 새 API routes

- `POST /api/content-hub/extract-file` — multipart 파일 → 텍스트 추출 (pdf-parse·officeparser·utf8)

## 5. 검수 스크립트 (scripts/)

| 스크립트 | 목적 |
|---|---|
| `test-phase-l-quality.ts` | render-markdown 단위 17 assert |
| `test-phase-l-edge-cases.ts` | 28 edge case (legacy compat 등) |
| `test-phase-l-youth-village-pattern.ts` | 청년마을 패턴 재현 25 assert |
| `test-phase-l-patterns-integrity.ts` | 12 패턴 라이브러리 142 assert |
| `test-phase-l-full-sim.ts` | 계원예대 mock 시뮬 34 assert |
| `test-phase-l-inspector-11lens.ts` | Inspector schema 57 assert |
| `test-phase-m-wireup.ts` | extractor wire-up 30 assert |
| `test-phase-m-real-llm.ts` | 실 Gemini 1회 호출 |
| `test-phase-m-e2e.ts` | E2E 9턴 시뮬 |
| `test-phase-g2-source-trace.ts` | sourceTrace 생성 검증 |
| `test-real-2025-won-rfp.ts` | A.25.0050 단순 키워드 12/12 |
| `test-ultimate-draft.ts` | produceUltimateDraft 풀 시뮬 |
| `test-tone-profile.ts` | buildToneProfile DB 활용 검수 |

---

## 6. 진짜 작동 확인된 것 (검증 ✓)

### J2 ToneProfile — DB 92건 활용
- WinningPattern.tonePatterns 92/102 채워져 있고 실제 활용됨
- 시뮬 .md 본문 검증:
  - 회피 어휘 ("다양한"·"최선을 다하여"·"노력하겠습니다") **0건**
  - 종결 표현 (견인 11 · 완성 8 · 달성 4 · 확보 4) 35회 사용

### H1 clientContext
- 성균관대 unique vocab 정확 추출: `킹고(KINGO) · 산학일체 · 딥테크 · BM 고도화 · 시장 견인(Market Pull)`
- likelyQuestions 3건 평가위원 의문 정확

### H4 produceRisks
- 5건 critical 1 + major 3 + minor 1 균형 검증

### Express UI 완성
- DraftEnrichmentEditor 인라인 편집 + 자동 저장 (debounced 1s) → DB → .md 재출력 모두 작동
- ReasoningTooltip ⊕ 클릭 시 자산 ID · 패턴 ID · reasoning 표시

---

## 7. ❌ 검수 실패 영역 (정직 인정)

### J1 originalQuote — DB 마이그레이션 안 됨
- ContentAsset 1,765건 중 `sourceReferences` 의 `originalQuote` 박힌 건 **0건**
- 시뮬에서 「」 인용 보이지만 사실 LLM 이 `narrativeSnippet` 을 「」 로 감싼 흉내
- **fix 필요**: 기존 1,765건 마이그레이션 cron (LLM 호출로 원본 발췌)

### I2 inferBudget — 평균 계산이 틀림
- 시뮬 인건비 9.6% vs 실 DB 평균 21.9% (**2배 차이**)
- `slice(0, 10)` 후 category normalize → 분모/분자 부정확
- 시뮬 6,500만원 사업 예산이 *비현실적인 분배*
- **fix 필요**: 평균 로직 재설계 (각 사업의 비목 비율 normalize 후 평균)

### signatureNumbers 빈 출력
- buildToneProfile 의 string filter 가 `{value, context}` object 형식 제외
- DB 에 시그니처 수치 풍부한데 LLM 에 안 전달
- **fix 필요**: object 형식도 추출

---

## 8. ⚠ 검수 안 한 영역 (즉시 필요)

| 영역 | 검수 필요 사항 |
|---|---|
| 자산 매칭 점수 max 0.43 | medium 임계 (0.5) 미달 — 자산 풀의 GTM 도메인 자산 약함? embedding 문제? |
| `deep-research` 출처 정확도 | hallucination 없이 정확한지 별도 LLM verify 필요 |
| `track-record` 5건 사업 | 진짜 유사 사업인지 (인용된 "예비창업패키지 창업씨앗공방" 등 적합도) |
| 본문 voice 진짜 voice 인지 | LLM 톤이면서 「」 형식 흉내내는 것 아닌지 어휘 비교 |

---

## 9. 다음 작업 (K 시리즈 — compact 후 진행)

### 우선순위 ★★★

**K1: inferBudget 평균 계산 fix**
- 각 사업의 비목 비율 정규화 (분모는 그 사업의 인건비/강사료/... 가 있는 경우만)
- 또는 직접 SQL 평균 계산 후 LLM에 전달
- 검증: 시뮬 결과 vs 실 DB 평균 일치 확인

**K2: originalQuote 마이그레이션 cron**
- ContentAsset 1,765건 → 각 자산의 원본 PDF/text 다시 읽어서 LLM 호출로 originalQuote 추출
- `sourceReferences.originalQuote` 채움
- 토큰 비용: 자산당 1 LLM × 1,765건 = ~$50-100 추정
- 또는 narrativeSnippet 에서 강력한 1 문장 자동 추출 (LLM 재호출 없이) — 더 싸지만 voice 약함

### 우선순위 ★★

**K3: 자산 매칭 점수 진단**
- max 0.43 의 원인:
  - 자산 풀에 GTM 도메인 narrativeSnippet 부족?
  - embedding 모델 / cosine 결과 약함?
  - keyword 매칭 가중치 부적절?
- SQL 로 자산별 점수 분포 확인 + scoreAssetForSection 로직 검수

**K4: deep-research 정확도 검수**
- 시뮬에서 "통계청 2023.12" 같은 출처가 실제 존재하는지 verify
- 별도 LLM 또는 web search 로 hallucination 검출
- 신뢰도 낮으면 prompt 에 lowConfidence flag 강제

### 우선순위 ★

**K5: signatureNumbers object 처리** (buildToneProfile fix)
**K6: track-record 5건 사업 검수** (적합도)
**K7: PM 워크플로** — 발주처 통화 결과·전담 코치 명단·평가위원 정보 입력 흐름 (가장 큰 효과지만 UI 큼)

---

## 10. 학습된 본질적 한계 (사용자가 정확히 지적)

### 사용자 1차 의심 (5/29)
> "프롬프팅으로 해결될 문제일까? 청크가 단어 중심이라 맥락·voice 못 잡는 거 아냐?"

### 진단 결과
- 청킹은 의미 단위 (슬라이드/섹션) OK
- 매칭은 하이브리드 (embedding + logicGraph + BM25) OK
- **그러나** `narrativeSnippet` 이 LLM 재생성이라 **원본 voice 평탄화**

### 사용자 2차 의심 (5/29)
> "에이전트들이 제대로 다 했는지 검수 했어?"

### 솔직 답
- **안 했음**. Inspector 점수 + .md 양만 보고 작동으로 착각
- DB 실 데이터 비교, LLM 응답 정확도, 계산 정확도 안 함
- 검수 결과 → 위 7~8 영역 결함 발견

### 진짜 본질 (LLM/prompt 한계)
1. **원본 voice 보존**: DB 마이그레이션 필요 (K2)
2. **계산 정확성**: SQL 검수 필요 (K1)
3. **진짜 디테일** (전담 코치 실명 등): LLM 못 만듦, **PM input** 필수 (K7)

---

## 11. 현재 상태 — 사용자가 "와닿지 않음" 평가한 이유 정리

시뮬 .md 가 갖고 있는 것 vs 부족한 것:

| 갖고 있음 | 부족 |
|---|---|
| Pyramid 구조 (결론 → 근거 → so-what) | 결정적 한 방 (전담 코치 실명 같은 디테일) |
| 발주처 어휘 (KINGO · BM 고도화) | 발주처 평가위원 구성·과거 사업 KPI |
| 자산 「」 인용 | 자산이 진짜 originalQuote 가 아닌 LLM 톤 |
| 인용 자산 5+건 | 매칭 점수 max 0.43 — 도메인 적합도 약함 |
| 정량 KPI 3건 | 측정 방법·시점·시장 평균 대비 약함 |
| 예산 비목 4분류 | 비율 부정확 (인건비 9.6% vs 실 21.9%) |
| Risks 5건 | PM 의 진짜 통화 결과 미반영 |
| Inspector 11-lens | 점수보다 실제 quality 가 더 중요 |

---

## 12. 정리 작업 commits

- 이 문서: `docs/journey/2026-05-29-phase-jklmgh-quality-orchestration.md`
- 모든 tmp `.tmp-*.md` 삭제
- 검수 스크립트 13개는 `scripts/` 유지 (다음 K 작업 검증 시 활용)

다음 세션 (compact 후):
1. 이 문서를 먼저 읽고
2. K1 inferBudget fix 부터 시작
3. K2 originalQuote 마이그레이션
4. 각 단계마다 SQL 직접 검수
