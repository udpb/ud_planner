
---

## 5. 견고성 보강 — 빈 섹션 backfill (2026-05-30 추가)

### 발견된 품질 변동
M4 E2E 반복 실행 시 Inspector 점수 변동 (78 → 44):
- 빈 pmInput 슬롯(§2 추진전략·§4 운영체계)의 slot turn LLM이 JSON 파싱 실패 시 조용히 skip
- → 섹션 누락 → Inspector 44점(passed=false), sections 5/7만 채워짐

### 해결 (produce-ultimate-draft Step 3.2)
- 슬롯 루프 후 §1·2·3·4·6 중 **80자 미만 섹션 감지 → 전용 LLM backfill**
- RFP objectives + intent + 작성된 §1 참고로 자동 생성 (Pyramid·경어체·키워드 흡수)
- §5·7은 inferBudget/trackRecord 전용 단계가 담당하므로 제외
- 어떤 슬롯 LLM 결함에도 **7섹션 완성 보장**

### 재검증 결과
| 지표 | backfill 전 | backfill 후 |
|---|---|---|
| 섹션 완성 | 5/7 (§2·4 누락) | **7/7 (누락 0)** |
| Inspector | 44 (passed=false) | **72 (passed=true)** |
| LLM 호출 | 23 | 27 (+backfill 2) |
| slideSpecs | 10 | 10 |
| 렌더 슬라이드 | 19 | **21** (§2·4 divider+spec 추가) |

### 부수 발견·수정 (production 견고성)
- `/api/dev/ultimate-draft`: `assertDevAccess` import 제거 → self-contained `devGuard` (NODE_ENV + E2E_SECRET)
- `asset-registry.keywordOverlap`: 비문자 키워드·projectCode graceful skip
- `produce-ultimate-draft` slot loop: `slotKey = sin?.slot ?? ''` 가드

→ 알파테스트에서 빈 슬롯·malformed 입력에도 안정적으로 완성된 1차본 생성.
