# Coach 데이터 통합 — Supabase Single Source

**Status**: Active (Phase 4-coach-integration, 2026-05-03)
**Source-of-truth**: Supabase `public.coaches_directory`

## 데이터 흐름

```
                ┌─────────────────────────────────┐
                │  Supabase coaches_directory     │  ← Source of Truth
                │  (RLS: cd_read_authenticated)   │
                └──────────┬──────────────────────┘
                           │ service-role read
              ┌────────────┼────────────┐
              │                         │
   ┌──────────▼─────────┐   ┌──────────▼──────────┐
   │  underdogs-        │   │  ud-ops-workspace    │
   │  coach-finder      │   │  (이 프로젝트)         │
   │                    │   │                      │
   │  /api/coaches      │   │  /api/coaches/sync   │← 로컬 Coach 테이블 upsert
   │  → JSON (서버 proxy)│  │  /api/coaches/live   │← 캐시된 직접 read
   │                    │   │                      │
   │  Firebase Auth     │   │  NextAuth + Prisma   │
   └────────────────────┘   └──────────┬───────────┘
                                       │
                                       │ Prisma (CoachAssignment FK)
                                       ▼
                            ┌─────────────────────┐
                            │ ud-ops Coach 테이블  │  ← 캐시 / FK 용
                            └─────────────────────┘
```

## 환경 변수

ud-ops `.env.local` (production: Vercel env vars):

```bash
# Primary — coach-finder 와 동일 키 사용 (단일 source-of-truth)
SUPABASE_URL=https://zwvrtxxgctyyctirntzj.supabase.co
SUPABASE_SERVICE_ROLE=<service-role key from Supabase Dashboard>

# Fallback — Supabase 미설정 시 GitHub raw JSON 사용
GITHUB_TOKEN=ghp_xxxxxxxxxxxx
GITHUB_COACHES_REPO=underdogs-org/coaches-db
GITHUB_COACHES_FILE=coaches_db.json
```

## 사용 패턴

### 1. 주기적 동기화 (대부분의 흐름)

ud-ops 의 로컬 `Coach` Prisma 테이블이 캐시 역할.
`CoachAssignment` 등 FK 관계가 있어 로컬 테이블은 유지.

```bash
# CLI
npm run sync:coaches

# UI
/admin/metrics → Coach Sync 버튼 클릭
```

수행 동작:
1. Supabase `coaches_directory` 에서 active 코치 fetch (또는 GitHub fallback)
2. ud-ops `Coach` 테이블에 `upsert` (`githubId` 기준 또는 name+email 매칭)
3. `live` 캐시 invalidate

### 2. 실시간 read (확인 / 운영 모니터링)

```
GET /api/coaches/live
  Auth: ADMIN | DIRECTOR
  Cache: 5분 메모리 TTL
```

응답:
```json
{
  "source": "supabase",
  "count": 818,
  "fetchedAt": "2026-05-03T...",
  "coaches": [
    { "githubId": 123, "name": "...", "tier": "TIER1", ... }
  ]
}
```

용도: coach-finder 와 동기 상태 확인, sync 안 돌려도 최신 데이터 미리보기.

### 3. PipelineContext 에서 사용 (Step 3 코치 매칭)

기존 코드 그대로 — `prisma.coach.findMany()` 사용.
`Coach` 테이블이 sync 로 채워져 있으면 정상 동작.

향후 (Phase 5) 옵션: PipelineContext build 시 `getCoachesCached()` 호출하여 항상
최신 데이터 사용 (Prisma 우회) — 단 `CoachAssignment` 와 FK 정합성 유지 필요.

## coach-finder 와 ud-ops 의 컬럼 매핑

ud-ops `Coach` Prisma 모델 vs Supabase `coaches_directory`:

| ud-ops `Coach` | Supabase 컬럼 | 변환 |
|---|---|---|
| `githubId: Int?` | `external_id: text` | numeric string → Number, 아니면 undefined |
| `name` | `name` | direct |
| `email`, `phone`, `gender`, `location`, `country` | same | direct |
| `regions[]`, `industries[]`, `expertise[]`, `roles[]` | same | null → [] |
| `language[]` | `language: text` | string → split or [string] |
| `intro`, `careerHistory`, `education`, `currentWork`, `underdogsHistory`, `toolsSkills` | `intro`, `career_history`, ... | snake_case → camelCase |
| `careerYears: Int?` | `career_years: int` | direct |
| `careerYearsRaw: String` | `career_years_raw: text` | null → '' |
| `photoUrl` | `photo_url` | direct |
| `overseas`, `overseasDetail` | `overseas`, `overseas_detail` | direct |
| `tier: TIER1/2/3` | `tier: text` | "1"/"2"/"3" → enum, "S"→TIER1, "A"→TIER2 |
| `category: COACH/PARTNER_COACH/...` | `category: text` | 한글/영문 키워드 매칭 |
| `isActive` | `status: text` | `status === 'active'` |
| `businessType` | `business_type` | direct |

ud-ops 자체 필드 (Supabase 에 없음 — 기본값):
- `hasStartup`, `mainField`, `satisfactionAvg`, `collaborationCount`,
  `impactMethodLevel`, `lectureStyle`, `hasInvestExp`,
  `onlineAvailable`, `minLeadTimeDays`, `availableDays`, `taxType`

이 값들은 sync 시 기본값으로 들어가고, 운영 중 ud-ops UI 에서 별도 update.
다음 sync 시 덮어씌워지지 않도록 Prisma `update` 단계에서 명시적 보존 로직 추가 가능 (TODO).

## 코드 위치

| 파일 | 역할 |
|---|---|
| `src/lib/coaches/supabase-source.ts` | Supabase admin client + `fetchCoachesFromSupabase()` + `getCoachesCached()` |
| `scripts/sync-coaches.ts` | CLI 동기화 (Supabase 우선 / GitHub fallback) |
| `src/app/api/coaches/sync/route.ts` | POST sync 트리거 (CoachSyncButton 이 호출) |
| `src/app/api/coaches/live/route.ts` | GET 실시간 read (5분 캐시) |
| `src/app/admin/metrics/_components/coach-sync-button.tsx` | Sync UI + source label toast |

## 보안

- **Service-role 키는 server-only** — `'server-only'` import 로 cli-side 노출 방지.
- `/api/coaches/live` 는 ADMIN/DIRECTOR 만 호출 가능 (RLS 우회 키 사용).
- `/api/coaches/sync` 는 NextAuth 미들웨어로 보호 (모든 요청 로그인 필요).
- 클라이언트에 `SUPABASE_SERVICE_ROLE` 노출 금지 — 환경변수에 `VITE_` / `NEXT_PUBLIC_` prefix 절대 사용 X.

## 운영 주의사항

1. **coach-finder 가 Supabase update → ud-ops 즉시 반영 X**
   - ud-ops 의 `Coach` 테이블은 캐시. 매번 sync 돌려야 최신 반영.
   - 또는 `/api/coaches/live` 호출 (5분 캐시).

2. **Sync 충돌**
   - `githubId` 가 unique key. coach-finder 가 `external_id` 를 변경하면 새 row 로 들어옴 (이전 row 는 stale).
   - 정기적으로 `Coach.isActive=false` 인 row 의 정합성 점검 권장.

3. **데이터 손실 방지**
   - ud-ops 자체 필드 (`satisfactionAvg`, `collaborationCount` 등) 는 sync 시 default 값으로 덮어씌워질 수 있음.
   - 향후 필요 시 sync route 에서 `update` 시 이 필드 제외 — TODO.

4. **Supabase 없는 환경 (PoC, 로컬 dev)**
   - GitHub fallback 자동 발동.
   - `npm run health-check` 로 어떤 source 가 활성인지 확인 가능.

## 다음 단계 (선택)

- [ ] PipelineContext build 시 `getCoachesCached()` 직접 호출 옵션 (Prisma 우회 — Phase 5 측정 chain 도입 시)
- [ ] ud-ops 자체 필드 (`satisfactionAvg` 등) sync 시 보존 로직
- [ ] coach-finder 의 `last_synced_at` 같은 컬럼 활용 — incremental sync
- [ ] webhook: Supabase 변경 시 ud-ops 에 알림 → 자동 sync
