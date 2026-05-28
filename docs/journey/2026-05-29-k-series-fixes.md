# K-series Fixes — 데이터 결함 + 진단 + PM 워크플로 (2026-05-29)

**Branch**: `fix/k-series-1-3-5`
**기간**: 1세션 (compact 직후)
**목적**: 직전 세션 정리 보고서 (`2026-05-29-phase-jklmgh-quality-orchestration.md`) 에서 발견된
검수 부실 · 데이터 결함 · 미구현 영역 7건 해결.

---

## 1. K-series 완료 매트릭스

| # | 작업 | 상태 | 효과 |
|---|---|---|---|
| K1 | inferBudget 평균 계산 fix | ✅ | 인건비 9.6% → 20.5% (실 평균 일치) |
| K2 | originalQuote 마이그레이션 | ✅ | 1,211/1,765 자산 (68.6%) 채움 |
| K3 | 자산 매칭 점수 진단 + 강화 | ✅ | max 0.55 → 0.65 / medium+ 12 → 80건 (6.7x) |
| K4 | deep-research 출처 안전망 | ✅ | lowConfidence 자료 분리 표시 |
| K5 | signatureNumbers object 처리 | ✅ | 6건 추출 (이전 0건) |
| K6 | track-record 5건 사업 검수 | ✅ | 매칭 로직 정상 — fix 불필요 |
| K7 | PM 워크플로 입력 (schema+API+prompt) | ✅ | UI 별도 (다음 PR) |

---

## 2. K1 — inferBudget 평균 계산 fix

### 문제
- 시뮬 인건비 9.6% vs 실 DB 평균 ~22% (2배 차이)
- 합계가 ~114% → 잔액 음수를 인건비(가장 큰 비목)에 부담시킴

### Root Cause
```ts
// 이전: 카테고리가 존재하는 사업만 평균
for (const [proj, catMap] of projectCategorySum) {
  for (const [cat, amt] of catMap) {  // ← catMap 의 카테고리만
    categoryRatios.get(cat)!.push(amt / projTotal)
  }
}
// 결과: 강사료 평균 16.97% (48건만) — 강사료 없는 19건 무시 → 평균 왜곡
```

### Fix
```ts
// 모든 사업 × 모든 STANDARD_CATEGORIES, 카테고리 없으면 0 (zero-imputation)
for (const proj of similarProjects) {
  projectCategorySum.set(proj, new Map(STANDARD_CATEGORIES.map((c) => [c, 0])))
}
// + 평균 후 정규화 → 자연 합계 100%
```

### 검증 (scripts/test-infer-budget.ts)
- 65M B2G 사업 (±40% pool 16건)
- 결과: 인건비 20.5% / 강사료 13.4% / 운영비 31.4% / 간접비 34.6% (합 99.9%)
- DB SQL 직접 평균과 일치 ✓

---

## 3. K2 — originalQuote 마이그레이션 (휴리스틱)

### 문제
- ContentAsset 1,765건 중 sourceReferences.originalQuote 채워진 자산 **0건**
- J1 작업 시 schema 만 추가하고 데이터 마이그레이션 미이행

### 구현
- **`src/lib/express/extract-quote.ts`** — 휴리스틱 점수 기반 1 문장 추출
  - 정량 수치 +2 (max 4)
  - 강한 동사 (견인·달성·완성 등) +1 (max 2)
  - UD 시그니처 (액트프러너·IMPACT 6단계 등) +2 (max 4)
  - 회피 어휘 (다양한·노력 등) -2 each
  - 길이 30~150자 +1
  - 점수 ≥ 3 인 문장만 추출
- **`scripts/migrate-quotes.ts`** — 일괄 마이그레이션 CLI

### 결과
- 1,211/1,765 (68.6%) 추출 성공
- 평균 점수 4.22
- 554 건 (31.4%) 점수 미달 — 짧거나 회피 어휘 다수

### 한계 (정직 인정)
narrativeSnippet 은 이미 LLM 재구성 → 이 추출은 "LLM voice 중 가장 강한 문장".
진짜 originalQuote 은 원본 PDF/PPT 재읽기 필요 (별도 cron + Drive API).
이 K2 는 stopgap — `originalQuoteSource: 'heuristic'` 표시로 추후 재처리 가능.

---

## 4. K3 — 자산 매칭 점수 진단

### 진단
- DB ContentAsset 1,765 중 programProfileFit 채워진 자산 **0건**
- `partialProfileMatch` 항상 0.5 (neutral) → max score 0.45 cap
- 가중치 profile=0.5 가 항상 0.25 contribute → 실 점수 신호 약화

### Fix (가중치 그대로 — keyword 신호 강화)
1. **Saturating keyword score**: 3+ 매칭 = 1.0 (precision 만 쓰면 keywords 많은 자산이 불리)
2. **Snippet semantic match**: RFP keywords 가 asset.narrativeSnippet 에 출현하면 +0.1 each (max +0.3)

### 검증 (scripts/test-asset-matching.ts)
- 200건 asset · 15개 현실적 RFP keyword
- max 0.55 → 0.65 (+18%)
- top10 평균 0.530 → 0.650 (+23%)
- **medium+ (≥0.5) 자산 12건 → 80건 (6.7x 증가)** ⭐

### 장기 작업
programProfileFit 데이터 마이그레이션 — 자산당 LLM 1회 호출로 11축 추론.
~$50-100 token 비용 추정. 별도 PR.

---

## 5. K4 — deep-research 출처 안전망

### 진단
- deep-research 함수에 lowConfidence flag 존재
- 하지만 formatResearchForPrompt 가 trusted/lowConf 구분 안 함
- LLM 본문에 저신뢰 자료가 그대로 인용될 위험

### Fix
- formatResearchForPrompt 가 ✓ 신뢰 vs ⚠ 저신뢰 분리 표시
- 저신뢰 자료: "본문 인용 금지 · PM 검증 후 사용" 명시

### 검증 (scripts/test-deep-research.ts)
- 성균관대 GTM RFP → 5건 evidence + domainInsight 출력
- 출처: 중기부 창업기업실태조사 · 한국무역협회 · 창업진흥원 등 (실 기관)
- LLM 이 모두 trusted 마크 — fact-check (URL 실 존재) 은 별도 작업

---

## 6. K5 — signatureNumbers object 처리

### 문제
- WinningPattern.tonePatterns.signatureNumbers DB 형식: `[{value, context}, ...]`
- 기존 코드: `typeof x === 'string'` filter → 모두 제외
- LLM 에 시그니처 수치 전달 안 됨

### Fix
- `extractNumber()` 헬퍼 — string OR `{value, context}` 모두 처리
- context 있으면 `"value (context)"` 으로 합쳐 prompt 풍부화

### 검증
- B2G GTM 시나리오: 6건 추출
- 예: `"261명 (전국 지역 단위 액션코치 보유)"`, `"80% (실습 비중)"`

---

## 7. K6 — track-record 5건 사업 검수

### 결론: 매칭 로직 정상 — fix 불필요
- 성균관대 GTM RFP 시뮬:
  - `2025 예비창업패키지 글로벌 진출 프로그램` ✓ 적합
  - `재창업 특화 교육 사업` ⚠ 다른 angle 이지만 관련
  - `A.24.0015 임팩트솔루션테이블` ✓ 운영 실적
  - `A.24.0016 KAC 청소년 창업` ✓ 동일 대상층

매칭 알고리즘:
- 키워드 in sourceProject +0.2 / in snippet +0.1
- proposal-background sectionKey +0.1
- techEvalScore > 80 +0.1

→ 합리적 점수 분포.

---

## 8. K7 — PM 워크플로 (schema + API + prompt)

### 새 schema (src/lib/express/schema.ts)
```ts
PmInputsSchema = z.object({
  callNotes: z.array(PmInputCallNoteSchema).max(5),     // 통화/미팅 노트
  assignedCoaches: z.array(...).max(10),                 // 전담 코치 명단
  evaluators: z.array(...).max(10),                      // 평가위원 정보
  freeNotes: z.string().max(2000),                       // 자유 메모
})
ExpressDraftSchema { ..., pmInputs: PmInputsSchema.optional() }
```

### 새 API (src/app/api/express/pm-inputs/route.ts)
- POST `/api/express/pm-inputs` — 부분 업데이트 (전체 draft 안 보냄)
- 권한 확인 + zod 검증 + expressDraft 의 pmInputs 만 patch

### prompt 통합 (produce-ultimate-draft.ts)
- `formatPmInputs()` 가 통화/코치/평가위원 정보를 prompt 형식으로 포맷
- 모든 sections.* 슬롯에 주입
- 안내: "LLM 단독으로 모르는 정보. 본문에 적극 반영"

### 검증
- schema 정상/이상 case 모두 PASS
- 출력 (557 chars) 에 통화 2건 · 코치 3명 · 평가위원 2명 모두 포함

### 남은 작업 (별도 PR)
- PM 입력 UI 컴포넌트 (DraftEnrichmentEditor 패턴 참고)
- Express S2/S3 패널에 통합

---

## 9. 사용자 핵심 피드백 학습

### 직전 세션 (compact 전)
> "에이전트들이 제대로 다 했는지 검수 했어?"

→ 검수 부실 인정 + 즉시 SQL 직접 검수 시작 → K1/K3 발견.

### 이번 세션
- 모든 K 작업마다 **DB SQL 직접 검수** + **테스트 스크립트 PASS 검증**
- 점수에 매몰되지 않고 데이터 결함의 root cause 추적
- K3 의 첫 시도 (가중치 변경) → 검증에서 backfire → 더 좋은 방법 (saturating score) 으로 재시도

---

## 10. 커밋 시퀀스

| # | 커밋 | 내용 |
|---|---|---|
| 1 | caf27e8 | K1·K3·K5 — 데이터 결함 fix |
| 2 | fc8a2d4 | K2 — originalQuote 휴리스틱 마이그레이션 (1,211/1,765, 68.6%) |
| 3 | 4450c28 | K4·K7 — deep-research 안전망 + PM inputs 통합 |

---

## 11. 다음 세션 후보 작업

- **PM Inputs UI 컴포넌트** — DraftEnrichmentEditor 패턴 참고, S2/S3 패널에 통합
- **programProfileFit 데이터 마이그레이션** — 자산당 LLM 1회로 11축 추론
- **originalQuote 진짜 voice 마이그레이션** — 원본 PDF/PPT 재읽기 cron
- **deep-research fact-check** — URL 실 존재 확인 (web search 통합)
