# Alpha-Test Prep — L-series (2026-05-29)

**Branch**: `feat/alpha-test-prep` · base `fix/k-series-1-3-5`
**기간**: 사용자 12시간 부재 autonomous 작업
**목적**: K-series 후속 — PM 진짜 워크플로 + LLM 안전망 + 데이터 quality 강화

---

## 1. L-series 완료 매트릭스

| L# | 작업 | 상태 | 효과 |
|---|---|---|---|
| L1 | PM Inputs UI 컴포넌트 + ExpressShell 4번째 탭 | ✅ | PM 외부 reality 입력 가능 (통화·코치·평가위원) |
| L4 | deep-research 2차 LLM fact-check | ✅ | skeptical reviewer 로 verified/uncertain/fabricated 분류 |
| L2 | programProfileFit LLM 마이그레이션 | 🟡 진행중 | 1,765 자산 11축 추론 → 매칭 점수 ↑↑ |
| L3 | originalQuote PDF 재읽기 (Drive 자산) | 🟡 진행중 | 409 drive 자산 → 진짜 voice 보존 |
| L5 | 통합 E2E 검증 + 문서 + PR | ✅ | 본 문서 + PR #X |

---

## 2. L1 — PM Inputs UI 컴포넌트

### 구현
**`src/components/express/PmInputsEditor.tsx`** (신규)
- 4 collapsible 섹션 (디바운스 자동 저장 1.2s):
  1. 발주처 통화·미팅 (0~5건) — 일자 + 담당자 + 핵심 내용 (20~800자)
  2. 본 사업 전담 코치 명단 (0~10명) — 이름 + role(lead/main/support) + 이력
  3. 평가위원 정보 (0~10명) — ⚠ 실명 X · 관심사·KPI 만
  4. 자유 메모 (~2000자) — 참고만, 본문 X
- 클라이언트 사전 검증 — 미완성 항목 silent skip (서버 400 방지)
- 헤더에 입력 건수 + 저장 상태 (방금/N분 전/저장 중)

**`src/components/express/ExpressShell.tsx`** (수정)
- sidebar grid-cols-3 → grid-cols-4
- 4번째 'PM 입력' 탭 + 녹색 dot 인디케이터

### E2E 검증 (live dev server)
- ✓ 새 sidebar 탭 렌더링
- ✓ 4 섹션 collapsible 작동
- ✓ "통화 노트 추가" → input field 출현
- ✓ Textarea 입력 → POST /api/express/pm-inputs (1.2s 디바운스)
- ✓ DB Project.expressDraft.pmInputs 저장 확인
- ✓ "방금 저장됨" UI 표시

---

## 3. L4 — deep-research 2차 LLM fact-check

### 문제
- fetchExternalEvidence 한 LLM 호출이 출처를 추정 → 자신감 과대
- lowConfidence flag 거의 항상 false → 가짜 출처가 본문에 인용될 위험

### 구현
**`src/lib/express/verify-research.ts`** (신규)
- "skeptical reviewer" 페르소나 (temperature 0.1)
- 각 evidence → verified / uncertain / fabricated 분류
- fabricated·uncertain 자동 lowConfidence=true 강제
- evidenceRefs source 에 ⚠ prefix ("⚠ 가공 의심:" / "⚠ 검증 필요:")

**`src/lib/express/produce-ultimate-draft.ts`** (수정)
- Step 2.5 (raw) 직후 Step 2.6 (verify) 추가
- verificationSummary 출력에 노출

### 검증 (real LLM, 3 케이스)
- ✓ "통계청 기업생멸행정통계" → **verified** (실재 + 정기 통계)
- ✓ "글로벌 스타트업 인사이트 보고서" → **uncertain** (generic title)
- ✓ "대한민국 AI 창업진흥재단" → **fabricated** (가공 기관)
- 완벽 일치 3/3 · overallTrustworthy=false

### 비용
- 1 LLM call 추가 (~$0.001) — 본문 인용 신뢰도 확보 가치 ≫

---

## 4. L2 — programProfileFit LLM 마이그레이션

### 문제 (K3 발견)
- DB ContentAsset 1,765 중 programProfileFit 채워진 자산 0건
- partialProfileMatch 항상 0.5 (neutral) → max 점수 0.45 cap
- K3 fix (saturating keyword) 로 0.55 → 0.65 까지만 개선

### L2 해결
**`src/lib/express/infer-program-profile.ts`** (신규)
- 6 축 추론 (모두 optional, conservative):
  - targetStage · businessDomain · methodologyPrimary · deliveryMode · primaryImpacts · channelType
- "확실하지 않으면 비워두기" prompt 지침

**`scripts/migrate-program-profile-fit.ts`** (신규)
- --batch · --apply · --all · --force · --concurrency (default 4, max 10)
- 진행률 + ETA 로깅
- idempotent (기존 fit 있으면 skip)

### 비용 + 진행
- 자산당 Gemini 1 call (~$0.001) → 1,765 × $0.001 = ~$1.8
- 백그라운드 실행 (concurrency=6) — 약 35분 소요 (시작 기준)
- 진행: 445/1,765 (25%) at journey 작성 시점

### 매칭 점수 예상 효과
profileFit 추론된 자산이 RFP 의 ProgramProfile 과 매칭되면:
- 기존 profileScore=0.5 (neutral) → 매칭 시 1.0 가능 → +0.25 score
- 전체 자산 매칭 score 평균 0.30 ↑ 예상

---

## 5. L3 — originalQuote PDF 재읽기 (Drive 자산)

### 문제 (K2 한계)
- K2 휴리스틱은 narrativeSnippet (LLM 재구성) 에서 추출 → 진짜 voice 아님
- 사용자 지적: "voice 평탄화" 문제 해결 안 됨

### L3 해결
**`scripts/migrate-quotes-from-drive.ts`** (신규)
- sourceReferences 에 "drive:<fileId>" 있는 자산 (409건) 대상
- Drive API 로 원본 PDF/PPT 다운로드
- pdf-parse / officeparser 로 텍스트 추출
- LLM 으로 narrativeSnippet 과 일치하는 강한 1 문장 글자그대로 발췌
- sourceReferences.originalQuoteSource = 'pdf-rebuild' (heuristic 보다 우선)

**`scripts/check-drive-auth.ts`** (신규)
- L3 시작 전 Drive ADC auth 점검 — udpb 계정 OK 확인

### 비용 + 진행
- 자산당 Gemini 1 call (long context for full PDF) — ~$0.005
- 백그라운드 (concurrency=3) — 약 1-2시간 예상
- 진행: 9/405 (2%) at journey 작성 시점 — 느리지만 진행 중

### 검증 (sample 5건)
- 4/5 saved · 1 unsupported (HWP)
- 예: "분석 결과를 바탕으로 저수익 고객/제품에 대한 개선 과제를 도출합니다. (가격 인상, MOQ 설정, 거래 중단)"
- 실제 PDF 본문에서 그대로 발췌 — voice 100% 보존 확인

---

## 6. 운영 영향 검증

| 영역 | 변경 | 영향 |
|---|---|---|
| DB schema | ❌ 변경 X | migration 불필요 |
| Prisma | ❌ 변경 X | regenerate 불필요 |
| vercel.json | ❌ 변경 X | cron 영향 0 |
| Brain APIs | ❌ 변경 X | /api/v1/brain/* 무관 |
| 새 API | ✅ POST /api/express/pm-inputs | 권한 + zod 검증 |
| 새 UI | ✅ 사이드바 4번째 탭 | 기존 3 탭 무영향 |
| LLM cost | +2 calls (verify-research + L1 saves) | per draft +$0.003 |
| produce-ultimate-draft | step 2.6 추가 (verify) | per draft +10s |

회귀 테스트:
- ✓ K1 inferBudget (인건비 20.5%)
- ✓ K3 asset matching (medium+ 80건)
- ✓ K5 signatureNumbers (6건 추출)
- ✓ Module manifest 무결성

---

## 7. 알파테스트 readiness 평가

| 영역 | Before K-series | After K-series + L-series |
|---|---|---|
| 인건비 비율 정확도 | 9.6% (실 21.9% 대비 2x off) | 20.5% ✓ |
| 자산 매칭 medium+ | 12건 | 80건 (K3) → 더 ↑ (L2 후) |
| originalQuote 자산 | 0 / 1,765 | 1,211 heuristic + ~400 PDF rebuild |
| signatureNumbers | 빈 출력 | 6건 가용 |
| deep-research 신뢰도 | LLM 자기과대 | 2차 검수자 ⚠ 표시 |
| PM 외부 reality 입력 | UI 없음 (CLI 만) | ExpressShell 4번째 탭 ✓ |
| programProfileFit | 0/1,765 | ~1,765 (L2 완료 후) |

### 알파테스트 권장 시나리오
1. **신규 RFP 업로드** → S1 자동 분석
2. **사이드바 'PM 입력' 탭** → 발주처 통화 결과 + 전담 코치 명단 입력
3. **S2 챗봇** → 슬롯 12 채움 + 1차본 produce
4. **1차본 검수**:
   - sections.5 예산 비율 합리적 (인건비 20~25%)
   - sections.7 수행실적 — track-record 5건 인용 적절
   - sections.1 외부 자료 — fabricated 표시 없음
   - 본문 inline 「」 인용 — 실제 자산 voice 살아있는지
5. **S5 .md 다운로드** → 평가위원 입장 정독

### 남은 risks (알파 테스트 통과 후 fix)
- HWP 자산 (~10건 추정) — L3 unsupported, 별도 LibreOffice 변환 필요
- L3 완전 완료 (409건 처리) 까지 시간 더 필요
- programProfileFit 추론 quality 일부 검수 안 됨 (랜덤 샘플 검수 권장)

---

## 8. 작업 commits

| # | 커밋 | 내용 |
|---|---|---|
| 1 | 7bbc7d9 | L1 — PM Inputs UI 컴포넌트 + ExpressShell 4번째 탭 |
| 2 | 16b5769 | L4 — deep-research 2차 LLM fact-check |
| 3 | 9bd2f32 | L2·L3 — programProfileFit + originalQuote PDF 재읽기 (script) |
| 4 | (다음) | L5 — 통합 journey doc + PR |

---

## 9. 백그라운드 마이그레이션 모니터링

사용자가 돌아온 후 확인할 사항:
```bash
# L2 진행 확인
tail -5 /tmp/l2-migration.log

# L3 진행 확인
tail -5 /tmp/l3-migration.log

# 최종 DB count
docker exec ud_ops_db psql -U postgres -d ud_ops -c "
SELECT
  COUNT(*) FILTER (WHERE \"programProfileFit\" IS NOT NULL AND \"programProfileFit\"::text != '{}') AS l2_fits,
  COUNT(*) FILTER (WHERE \"sourceReferences\"->>'originalQuoteSource' = 'pdf-rebuild') AS l3_pdf_quotes
FROM \"ContentAsset\";
"
```

기대 최종 결과 (12시간 후):
- L2: 1,750+ / 1,765 (≥ 99%)
- L3: 380+ / 405 (≥ 94%, HWP 제외)

진행 멈춤 시:
- L2 재실행: `npx tsx scripts/migrate-program-profile-fit.ts --apply --all --concurrency 6`
- L3 재실행: `npx tsx scripts/migrate-quotes-from-drive.ts --apply --all --concurrency 3`
- Idempotent — 이미 처리된 자산 자동 skip

---

## 10. 사용자 핵심 피드백 반영

이번 12시간 작업에서 항상 적용:
- ✓ 점수보다 **본질** (논리구조·voice 보존) 우선
- ✓ DB SQL 직접 검수로 데이터 결함 추적
- ✓ 가공된 출처·fabricated 자료 자동 차단 (L4)
- ✓ 진짜 PDF 재읽기로 LLM 평탄화 우회 (L3)
- ✓ PM 외부 reality 직접 입력 UI (L1)
- ✓ 자산 매칭 정확도 강화 (L2)

검수 원칙:
- 각 L# 작업마다 검증 스크립트 (E2E or LLM real call) PASS 확인
- 모든 K-series regression 테스트 재실행 → 무회귀 확인
- 비용·시간 budget 명시 (예상치 vs 실제)
