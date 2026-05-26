# Brain Runbook — 운영 가이드

언더독스 Brain (Sphere 2 — AI 두뇌) 운영 가이드. 19 Wave 모두 가동 후 일상 운영 방법.

## 0. 즉시 가동 체크리스트 (Day 0)

```bash
# 1. 필수 env (Vercel 환경변수 또는 .env)
CRON_SECRET=$(openssl rand -base64 32)              # Vercel Cron 인증
BRAIN_PUBLIC_API_TOKEN=$(openssl rand -hex 32)      # /api/v1/brain/* Bearer

# 2. (옵션) Drive watch — W30
DRIVE_WATCH_FOLDERS="1D_njCi1iOVMh4rHFcWxLErm-TPRTweqU,1LmzpJMIdH-..."

# 3. (옵션) Slack 알림
SLACK_FRESHNESS_WEBHOOK="https://hooks.slack.com/services/..."

# 4. Vercel 배포 — vercel.json crons 자동 등록
vercel deploy --prod
```

배포 후 `https://ud-planner.vercel.app/admin/brain` 접속 → 통계 확인.

---

## 1. Brain 5-Layer 구조

```
Layer 1 (Assets)         ContentAsset 1,765 + WinningPattern 102 + AssetUsage
Layer 2 (Matching)       matchTuple (BM25 + cosine + MMR + Concept)
Layer 3 (Ontology)       Concept 630 + AssetConcept 4,111 + ConceptRelation 100
Layer 4 (Self-Evolution) W18~W23 — AssetUsage 흐름 + winrate + decay + 자가진화
Layer 5 (Meta-Cognition) W24~W28 — Gap + Dashboard + Graph + 사후분석 + RFP cron
```

---

## 2. Cron 일정 (vercel.json 등록 완료)

| Cron | path | schedule (UTC) | KST | 의미 |
|---|---|---|---|---|
| **W22 자가진화** | `/api/cron/brain/concept-evolution` | `0 21 * * *` | 매일 06:00 | 미매핑 자산 → AssetConcept 자동 (max 30/run) |
| **W28 RFP-Concept** | `/api/cron/brain/rfp-concept` | `0 22 * * *` | 매일 07:00 | 24h 신규 Project → Concept 매핑 + 신규 도메인 alert |
| **W19 winrate** | `/api/cron/brain/winrate` | `0 0 * * 1` | 매주 월 09:00 | AssetUsage 집계 → ContentAsset.winRate Laplace + decay |
| **W20 status decay** | `/api/cron/brain/status-transition` | `0 0 1 * *` | 매월 1일 09:00 | 1년 미사용 → developing, 2년 → archived |
| **W23 freshness v2** | `/api/cron/brain/freshness-v2` | `30 0 1 * *` | 매월 1일 09:30 | 대체 가능 자산 alert |
| **Wave N5 freshness** | `/api/cron/asset-freshness` | `0 0 1 * *` | 매월 1일 09:00 | 묵음/aging 알림 (기존) |

**수동 트리거**:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://ud-planner.vercel.app/api/cron/brain/concept-evolution
```

---

## 3. Public API

```bash
# Stats
curl -H "Authorization: Bearer $BRAIN_PUBLIC_API_TOKEN" \
  https://ud-planner.vercel.app/api/v1/brain/stats

# Concepts
curl -H "Authorization: Bearer $BRAIN_PUBLIC_API_TOKEN" \
  "https://ud-planner.vercel.app/api/v1/brain/concepts?type=methodology&limit=20&withRelations=true"

# Match RFP
curl -X POST \
  -H "Authorization: Bearer $BRAIN_PUBLIC_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rfp":{"text":"..."},"channel":"B2G","limit":5}' \
  https://ud-planner.vercel.app/api/v1/brain/match
```

Rate limit: 60 req/min per (token + IP).

---

## 4. 일상 운영 작업

### PM 흐름
1. **신규 Project 생성** → RFP 텍스트 입력
2. **`/projects/[id]/brain` 접속** — Brain 4+1 통합 화면 (matchTuple 5초)
3. **자산 "인용" 클릭** → AssetUsage row 자동 생성
4. **사업 결과 입력** — `Project.isBidWon = true/false` → cascade로 AssetUsage.wonProject 자동 채움

### Admin 흐름 (월 1회)
1. **`/admin/brain` 접속** — DB 카운트 + Coverage
2. **Gap analyzer** — 자산 부족 영역 확인 (예: K-culture 도메인 0건)
3. **Channel imbalance** — B2G 편중 concept → B2B 자산 추가 발굴
4. **Difficulty concepts** — "어려운데 성공 자산 없음" 자산 ingest 권장

### 신규 자료 ingest 후 (수동)
```bash
# 1. 로컬 폴더 ingest
npx tsx scripts/local-folder-ingest.ts --folder /path --tier high

# 2. 자동: 다음 06:00 cron 에서 W22 자가진화 실행 → AssetConcept 자동
#    수동 즉시 실행:
npx tsx scripts/cron-concept-evolution.ts --batch-size 15

# 3. RDF graph refresh (W17)
npx tsx scripts/build-concept-relations.ts

# 4. (옵션) 충돌 자산 demote
npx tsx scripts/auto-demote-superseded.ts
```

---

## 5. 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| `/admin/brain` 빈 화면 | DB 비어있음 | `npx tsx scripts/brain-status.ts` 로 카운트 확인 |
| 인용 클릭 → "Asset not found" | 자산 status='archived' | W20 cron 점검 + 직접 확인 |
| `/api/v1/brain/*` 503 | `BRAIN_PUBLIC_API_TOKEN` 미설정 | env 추가 후 재배포 |
| Cron 실행 안 됨 | `CRON_SECRET` 불일치 | Vercel env 확인 + 수동 트리거로 검증 |
| Cron timeout | 30→300s 변경됨 | concept-evolution 만 5분; 다른 건 60s 충분 |
| W22 backlog 적체 | 1회 max 30 자산 | 30/day 처리 → 1000 자산도 33일 |
| W19 winRate 모두 null | AssetUsage labeled=0 | PM 인용 + Project.isBidWon 결정 후 자동 |
| W30 Drive watch no-op | `DRIVE_WATCH_FOLDERS` 미설정 | env 추가 |
| Drive ADC 만료 | gcloud token 1시간 | `gcloud auth application-default login` 재실행 |

---

## 6. 모니터링 query (psql)

```sql
-- Coverage
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE status='stable') AS stable,
  COUNT(*) FILTER (WHERE status='developing') AS developing,
  COUNT(*) FILTER (WHERE status='archived') AS archived
FROM "ContentAsset";

-- AssetUsage 흐름
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE "wonProject" IS NOT NULL) AS labeled,
  COUNT(*) FILTER (WHERE "wonProject" = true) AS wins,
  COUNT(*) FILTER (WHERE "rejectedByPm" = true) AS rejected
FROM "AssetUsage";

-- Concept 자가진화 backlog
SELECT COUNT(*) FROM "ContentAsset" a
WHERE NOT EXISTS (SELECT 1 FROM "AssetConcept" ac WHERE ac."assetId" = a.id);

-- 최근 7일 ingest
SELECT DATE("createdAt") AS day, COUNT(*) FROM "ContentAsset"
WHERE "createdAt" > NOW() - INTERVAL '7 days'
GROUP BY day ORDER BY day DESC;

-- Top concept winRate (PM 인용 시작 후 의미 있음)
SELECT name, type, "assetCount", "winRate" FROM "Concept"
WHERE "winRate" IS NOT NULL
ORDER BY "winRate" DESC LIMIT 20;
```

---

## 7. 비용 추정 (월 단위)

| 항목 | 빈도 | 비용/건 | 월 |
|---|---|---|---|
| W22 자가진화 (30 자산/day) | 30 batch/일 × 2 LLM | ~$0.002 | ~$1.8 |
| W28 RFP-Concept (LLM 없음) | 매일 | $0 | $0 |
| W19/W20/W23 (DB만) | 매주~월 | $0 | $0 |
| W30 Drive watch | 매시간 polling | Drive API free tier | $0 |
| Brain UI matchTuple | PM 1회 클릭 | $0.003 | ~$1 (PM당 월) |

**총 ~$3/월** (PM 10명 기준). Brain 의 자가 진화 비용은 무시 가능 수준.

---

## 8. 무엇이 "완성" 인가

| 항목 | 상태 |
|---|---|
| Brain 5-Layer 모두 구현 | ✅ W14~W17·W18~W23·W24~W28·W29~W30·W31~W32 |
| 실 데이터 1,765 자산 | ✅ ingest 완료 |
| 자가 진화 cron | ✅ 매일 자동 |
| Public API | ✅ Bearer 토큰 |
| Dashboard | ✅ `/admin/brain` |
| Graph 시각화 | 🟡 `/admin/brain/graph` (refinement 예정) |
| External feed (Bizinfo) | 🟡 RSS URL 갱신 필요 |
| Phase B 데이터 누적 | ⏳ PM 인용 시작 후 |

남은 polish:
- **W26 Concept Graph 시각화 개선** (사용자 피드백 반영 — refinement)
- **W29 RSS URL 갱신 또는 API key 발급** (Bizinfo / K-Startup 공식 채널)
- **W30 Drive watched folders 선정** (회사 공유 드라이브 구조 확정)
- **udpb@ admin Trusted App 등록** (Drive ADC 영구 권한)

이 4가지가 마무리되면 진정한 **운영 정착**. 일단 코어 19 wave + 운영 setup 은 끝났음.
