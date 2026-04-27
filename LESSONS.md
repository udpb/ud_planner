# LESSONS.md — 핵심 시행착오와 반복 함정

> 이 문서는 다음 사람에게 "이 함정을 미리 알린다" 가 목적이다. 결정 근거(ADR)나 그날의 흐름(journey)은 다른 곳에 있고, 여기는 **반복적으로 재발한 사고와 그 회복** 만 모은다.

---

## 0. 들어가며

세 종류의 기록이 한 저장소에 공존한다. 셋의 역할이 다르다 — 같은 사건이 셋 모두에 흩어져 있을 수 있고, 같은 곳을 보면 다른 종류의 답을 못 얻는다.

| 문서 | 답하는 질문 | 시점 | 톤 |
|---|---|---|---|
| `docs/decisions/NNN-*.md` (ADR) | "왜 이 결정을 했나?" | 결정 시점 | 합의·정당화 |
| `docs/journey/YYYY-MM-DD-*.md` | "그날 어떤 흐름이었나?" | 사후 정리 | 서술·맥락 |
| **`LESSONS.md`** (이 문서) | "어디서 자빠졌고 어떻게 다시 안 자빠지는가?" | 누적 | 반성·가드 |

ADR 의 "리스크" 섹션은 **앞으로 일어날 수도 있는 것** 의 예측이고, 이 문서의 케이스들은 **이미 일어난 것** 의 사후정리다. 둘이 겹치는 케이스(예: §10 짧은 시드 vs 깊은 시드)는 ADR 예측이 들어맞은 자리를 표시해둔 거다.

읽는 방법: 새로 합류했다면 0~3을 먼저 읽어라. 가장 자주 다시 일어날 함정들이다. 4~12는 한 번씩 읽어두고 비슷한 상황에서 돌아와서 보면 된다.

---

## 1. 워크트리 혼동 사고 (2회 발생)

### 사고 1 — 2026-04-22 체크포인트 12 커밋 시점

`blissful-goodall-56a659` 워크트리에서 작업 시작했지만, Phase E 실작업물 50건은 `amazing-khorana-50ddb7` 워크트리에 uncommitted 로 쌓여 있었다. 사용자가 *"C(커밋 정리) 부터"* 라고 지시한 직후에야 두 개의 워크트리가 동시에 살아 있다는 사실을 인지. 12 커밋으로 논리 단위 분할해서 정리.

### 사고 2 — 2026-04-27 Phase H 검증 시점

브라우저 E2E 검증 단계에서 비어있는 워크트리에서 `npm run dev` 를 띄움. Prisma 가 `.env` 를 못 찾아서 `connectionString` 이 빈 문자열로 들어감 → **SASL 인증 에러**. 한참 디버깅하다 "이 워크트리에는 코드가 없다" 는 사실을 깨달음.

### 근본 원인

- 워크트리 두 개를 동시에 운영하면서 IDE 와 셸이 각각 다른 경로를 가리키고 있었다
- `cd <path>` 버릇 — 매번 명시적으로 경로를 찍지 않고 IDE 가 열려있는 곳을 신뢰
- 메모리(머릿속)에 "지금 어디서 작업 중인지" 를 의존

### 해결 (2026-04-27)

`master` 단일 워크트리로 통합. `package.json` 에 `predev` 훅 추가:

```json
"predev": "node scripts/print-worktree.cjs"
```

`scripts/print-worktree.cjs` 가 `npm run dev` 직전에 현재 경로·브랜치·워크트리 여부를 출력. 워크트리 안에서 dev 띄우면 ⚠️ 경고, master 정상 경로면 ✓ 통과.

### 재발 방지

**시각화 가드가 메모리보다 강력하다.** "출력으로 보이게" 만들면 자기검열이 생긴다. 같은 패턴을 다른 명령(예: `db:migrate`, `db:seed:*`)에도 확장할 만한 가치가 있다. 메모리(머릿속)에 의존하지 말 것.

---

## 2. 클라이언트 번들에 prisma 가 새는 것 (Phase H Wave H2)

### 증상

```
Module not found: Can't resolve 'dns'
```

Build error. Turbopack 이 `dns` 노드 모듈을 클라이언트 번들에 끌어오려고 시도.

### 트레이스

```
matched-assets-panel.tsx (Client Component, "use client")
   └─> import { ... } from '@/lib/asset-registry'
        └─> @prisma/client
             └─> @prisma/adapter-pg
                  └─> pg
                       └─> dns  ← 클라이언트에선 못 씀
```

### 원인

`asset-registry.ts` 한 파일에 **타입 정의** (`UdAsset`, `EvidenceType`, `AssetCategory`) 와 **DB 쿼리 함수** (`getAllAssets`, `findAssetById`) 를 같이 export. 클라이언트 컴포넌트가 타입만 import 해도 Turbopack 이 같은 모듈 내 prisma 의존성을 모두 따라간다.

### 해결

1. 타입·상수만 별도 파일로 분리 — `src/lib/asset-registry-types.ts` (DB 의존성 0)
2. DB 함수는 `asset-registry.ts` 에 남기고 파일 최상단에 `import 'server-only'` 가드
3. 클라이언트 컴포넌트는 `-types` 만 import

`server-only` 가드를 안 거치면 비슷한 사고가 다른 라우트에서 또 터진다. 빌드 에러는 운이 좋은 케이스고, 운이 나쁘면 SSR 에선 통과하고 hydration 에서 폭발한다.

### 재발 방지

**서버/클라 경계를 모듈 단위로 명시할 것.** Module Manifest (ADR-002) 의 `reads`/`writes` 메타가 이걸 미리 잡았어야 했다 — manifest 에 "이 모듈은 server-only" 라는 플래그가 있었다면 ESLint 룰로 클라 import 차단 가능. Phase I 에서 ESLint Manifest 강제 룰 도입할 때 이 케이스를 회귀 테스트로 박을 것.

---

## 3. Prisma 7 어댑터 옵션 누락 (Phase H Wave H1 시드)

### 증상

```
PrismaClientInitializationError: PrismaClient needs to be constructed
with non-empty PrismaClientOptions
```

`prisma/seed-content-assets.ts` 실행 시.

### 원인

```ts
// 잘못된 코드
const prisma = new PrismaClient()
```

Prisma 7 부터 `PrismaPg` 어댑터를 명시 옵션으로 넘기는 게 필수. 빈 옵션은 거부.

### 해결

기존 `prisma/seed.ts` 가 이미 올바른 패턴을 갖고 있었다. 그걸 따라 수정:

```ts
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })
```

### 재발 방지

**의존성 메이저 버전이 바뀌었으면 기존 패턴부터 검색.** "Prisma 클라이언트 초기화" 같은 키워드로 저장소 안을 먼저 grep 한 뒤 새로 작성. AGENTS.md 도 비슷한 톤이다 — *"This is NOT the Next.js you know"* — 모든 메이저 버전 변경 시 같은 자세 필요. 학습 데이터 기억 그대로 코드 짜면 안 된다.

---

## 4. "리서치 2개 이동" → 구조 격상 (Phase F)

### 시작

스냅샷 메모(`session_20260420_status.md`)에 적힌 다음 할 일은 가벼웠다 — "임팩트 리서치 2개를 앞 스텝으로 이동". 6시간이면 끝날 작업이었다.

### 사용자 한 마디로 게이트가 작동

사용자가 던진 한 줄:

> *"너가 생각했을 때 임팩트가 앞이랑 뒤에 두먼 오는 건 어때?"*

이 한 줄이 "단순 이동" 을 "씨앗·수확 분할 패턴" 으로 재해석시켰다. 그 다음 사용자가 5단계 + 루프 프레임을 제시했고, 그 다음에 결정타가 떨어졌다:

> *"outcome 은 SROI 로 나올거고"*

7글자. 이 한 문장이 ⑤ Outcome 의 정체를 SROI 로 못박았고, 추상적이던 "루프" 개념의 물리적 실체(SROI = Input/Outcome 비율)를 제공했다.

### 결과

- ADR-008 채택 (`docs/decisions/008-impact-value-chain.md`)
- Phase F = 9 Wave 신설, 6시간 → 2일
- Step 4·5 재구성 (예산 / 임팩트+SROI 분리)
- 신규 루프 Gate 도입

### 재발 방지

**가벼운 태스크 앞에서도 게이트 동작.** Phase/Wave 시작 직전 30초만 멈추고 "이 설계가 여전히 맞는가" 자문. 그리고 **사용자가 짧게 던지는 통찰을 절대 무시하지 말 것** — "outcome 은 SROI 로" 같은 한 줄이 시스템 골격을 바꾼다. `feedback_gatekeeping.md` 의 원칙이 이 케이스에서 정확히 작동했다.

---

## 5. 자산 정리 → Asset Registry → Content Hub (G→H)

### 시작

2026-04-23 Q2 워크샵 문서 검토 대화에서 자산 인벤토리 18종이 식별됐다. Phase G 로 가벼운 v1 (코드 시드 15종) 만 만들기로 결정.

### 사용자가 v2 격상 트리거

Phase G 완료 다음 날 사용자가 한 질문:

> *"계속 교육 콘텐츠는 늘어날건데 이걸 담을 수 있도록 세팅이 되어 있을까?"*

이 한 문장으로 Phase H 가 즉시 발동:
- DB 이관 (코드 시드 → `ContentAsset` 테이블)
- 1단 계층 (parentId)
- 담당자 UI (`/admin/content-hub`)
- 원본은 외부(LMS/노션) — 링크만

Q1=D / Q2=담당자 1명 / Q3=원본 외부 — 3 답변이 ADR-010 의 4 결정을 자동 도출.

### 결과

- Phase G 7 커밋 (코드 시드 v1)
- Phase H 7 커밋 (DB 이관 v2) — **G 완료 익일**

### 재발 방지

**v1 을 무리하게 끌고 가지 않기.** v2 가 빨리 온다는 신호(자산이 매주 늘어남, 담당자 PR 병목)가 있으면 v1 은 짧게 가고 기록만 단단히. ADR-009 의 "리스크 + 대응" 표에 *"코드 시드로 시작 → 안정화 후 DB 이관"* 이 미리 명시돼 있던 게 도움이 됐다 — v2 가 와도 타입 계약(`UdAsset`)·매칭 엔진은 그대로 유지.

---

## 6. dev 캐시 vs 코드 변경 혼동 (Phase E 시점)

### 증상

사용자가 *"Step 5 저장 버그가 안 고쳐져"* 보고. 코드는 분명 수정·커밋·재배포까지 끝났는데 브라우저에서 동일 동작.

### 원인

Next.js dev 서버의 hot-reload 캐시가 특정 파일 변경을 잡지 못함. 특히 server component 와 client component 경계 변경 시 자주 발생. 정적 export 메타데이터가 stale 한 채로 유지됨.

### 해결

dev 서버 종료 후 재시작 1회. 그 즉시 정상 동작.

### 재발 방지

**"코드 변경됐는데 동작 안 함" 시 dev 재시작 1회를 디버깅 첫 단계로.** 코드를 다시 의심하기 전에 dev 캐시부터 무효화. 5초짜리 동작이라 비용 0. 단, 매번 끄고 켜는 것도 시간 낭비라 *"코드는 명백히 바뀌었는데 결과가 동일"* 시그널이 잡히면 즉시. 그 외엔 평소처럼.

---

## 7. 에이전트 self-report 를 "통과" 로 간주

### 사고

Phase E Step 5 (proposal-rules) 작업을 서브 에이전트에 위임. 에이전트가 *"구현 완료, typecheck 통과"* 보고. 그대로 "Step 5 ✅" 마킹.

### 실제 상태

사용자가 직후에 제1원칙을 선언하고 결과물을 다시 보니, Gate 3 메시지가 *"…없으면 제안서 작성을 시작할 수 없습니다"* 같은 시스템 에러 톤이었다. 평가위원 설득력·언더독스 차별화 관점에서 **기준 미달**. 5개 메시지 전부 직접 재작성 (scoringImpact · differentiationLoss · fixHint 3층 포함).

### 원인

- 정적 검증(typecheck, build)은 "코드가 돈다" 만 증명
- 동작 검증(브라우저, 시드 데이터로 실행)은 별개
- 의미 검증(이게 PM 의 설득력 있는 제안서를 만드는 길을 넓혀주는가)은 또 별개

에이전트는 1번만 한다. 2·3번은 사람이 해야 한다.

### 재발 방지

**에이전트 결과는 typecheck 만 신뢰. 의미 검증은 매번 직접.** `feedback_first_principle.md` 의 한 줄로 정리됨:

> 코드가 돌아가는가 ❌ → 이 코드가 PM 의 설득력 있는 제안서를 만드는 길을 넓혀주는가 ⭕

검증 프로토콜:
1. 에이전트 보고 받음 → typecheck 결과만 신뢰
2. `Read` 로 실제 파일 직접 열어서 핵심 메시지·로직 눈으로 확인
3. 제1원칙 4개 렌즈 (시장흐름·통계·문제정의·Before/After) 통과 여부 점검
4. 통과 못 하면 반려 또는 직접 재작성 → 그 후에 ✅

---

## 8. Q2 자산 인벤토리 사용 시 담당자 이름 분리

### 시점

Phase G Asset Registry 시드 작성 직전. 외부 문서(udlabs Q2 기획)에 자산 18종이 정리되어 있었고, 거기엔 자산별 담당자·운영 체계도 함께 있었다.

### 사용자 명시

> *"여기에 담당자 이름이 지금 들어갈 필요는 없을 것 같아. 그리고 이건 2분기 우리 계획이니까 이 내용들이 너무 강하게 들어가기보다는 너가 어떤 프로덕트들과 asset이 있고, 나오고자 하는지를 인지하기 위해서 공유해준거야"*

### 구현 반영

ADR-009 "리스크 + 대응" 표에 정식 박힘:

> 담당자·내부 운영 정보가 레지스트리에 섞이면 사용자가 원하지 않는 정보 노출
> → `UdAsset` 스키마에 `owner`/`internalContact` 필드 **두지 않음**. 운영은 다른 체계.

ADR-010 도 동일 제약 유지 (`ContentAsset` 테이블에도 운영자 필드 없음).

### 재발 방지

**외부 문서를 시스템에 녹일 때 무엇을 흡수하고 무엇을 분리할지 사용자에게 묻기.** 자산 인벤토리는 흡수, Q2 운영 계획·담당자 정보는 분리. 이 경계가 ADR 의 제약으로 박혀야 후속 PR 에서 "owner 필드 추가" 같은 무심한 변경이 차단된다. 외부 문서가 가져오는 정보의 **반은 시스템에 안 어울린다** 가 기본 전제.

---

## 9. PipelineContext 호출자 → fallback 잊음 (Phase F Wave 4)

### 증상

Phase F 완료 후 브라우저 E2E 시점에 발견 — `ValueChainDiagram` 이 항상 "현재 스텝만 하이라이트". `completedStages` 가 비어 있어서 그래 보이는 거였다.

### 원인

- `pm-guide-panel.tsx` 가 `valueChainInputs` prop 을 받도록 추가됨 (Wave 4)
- 그러나 호출 측 `page.tsx` 에서 prop 을 안 채움
- panel 내부 fallback 로직이 *"inputs 없으면 currentStage 만 표시"* 로 동작
- 화면은 "정상" 처럼 보이지만 사실 Value Chain 상태 추적이 동작 안 함

### 미완 후속 TODO (project_impact_value_chain.md 후속 TODO 섹션에 박힘)

> PmGuidePanel 호출자에서 실제 `valueChainInputs` 주입 (현재 fallback — completedStages 비어있음)

### 재발 방지

**Prop 도입 시 호출자(caller)까지 닿는 PR 단위로.** Component 만 수정하고 caller 는 다음 PR 로 미루면 fallback 만 동작하는 좀비 상태가 된다. ESLint 룰로 *"이 prop 은 optional 이지만 caller 가 명시적으로 미설정 의도를 표시해야 함"* 같은 방어 가능 (예: `valueChainInputs={undefined}` 명시 vs 그냥 생략).

---

## 10. 짧은 시드 vs 깊은 시드 (Phase G Wave 3)

### 결정 시점

Phase G Wave 3 — 자산 시드 15종 vs 30+ 종 결정.

### 결정

15종 (방법론 3 · 콘텐츠 3 · 프로덕트 4 · 데이터 3 · 프레임워크 1 + human 1). 안정화 후 DB 이관(G → H).

### 결과 (Phase H 도달 시점)

H5 에서 자산 5종 추가 (계층 children — AI 솔로 Week 1~3 + AX Guidebook Ch 1~2). 총 20종.

만약 G 시점에 30+ 종으로 갔다면? H 의 DB 이관 시 시드 스크립트 재작성 비용이 2배. 또한 계층 구조(parentId) 가 H1 에서 도입됐는데, G 시점엔 평면 시드 — G 의 30종을 H 에서 계층화하려면 모두 다시 분류해야 한다.

### 재발 방지

**"스키마 안정 → 시드 확장" 순서.** 거꾸로 하면 시드 재작성 비용. ADR-009 "리스크 + 대응" 에도 *"코드 시드로 시작 → 주 단위 갱신 허용 → 안정화 후 DB 이관"* 으로 명시돼 있었음. 다음 v3 (자산 30+ 도달 시 DB 인덱스 강화) 도 같은 원칙으로 갈 것.

---

## 11. ADR 번호 정합성 (전 Phase 누적)

### 현황

`docs/decisions/` 에 ADR-001 ~ 010 (10건) + TEMPLATE.md. 번호 점프 없음, 일관성 OK.

```
001-pipeline-reorder.md
002-module-manifest-pattern.md
003-ingestion-pipeline.md
004-activity-session-mapping.md
005-guidebook-system-separation.md
006-program-profile.md
007-step-differentiated-research-flow.md
008-impact-value-chain.md
009-asset-registry.md
010-content-hub.md
```

### 잠재 함정 (아직 발생 안 함)

- 두 PR 이 동시에 다음 번호를 잡으면 충돌 (예: 둘 다 011 로 잡음)
- ADR 을 `docs/decisions/` 외부에 두는 실수 (재합본 시 누락)
- 일자가 ADR 채택일이 아닌 작성일로 박힘 (의사결정 추적 시 혼란)

### 재발 방지

- ADR 신설 PR 은 **번호 + 제목 한 줄** 을 PR 본문 최상단에 명시 (다른 PR 과 번호 충돌 사전 인식)
- 모든 ADR 은 반드시 `docs/decisions/` 에 위치 (TEMPLATE.md 가 이미 안내)
- ADR 일자는 **결정이 합의된 날** (사용자 승낙 시점). 작성·커밋 일과 다를 수 있음

---

## 13. AI JSON truncate 사고 (Logic Model 5843byte 절단) — Phase L1

### 증상

2026-04-27 dev 로그에서 발견:

```
[claude] Logic Model 응답 잘림 — 5843 바이트
SyntaxError: Unexpected end of JSON input
```

Logic Model AI 호출이 평소 4000~5000byte 응답에서 멈췄으나, 한 RFP 에서 응답이 5843byte 를 *시작* 하다가 절단. 클라이언트 alert 폭발.

### 근본 원인

세 층의 누적:

1. **max_tokens 4096 한계**: PRD-v6 §7.2 의 모든 호출이 4096 — Claude Sonnet 4.6 의 응답이 한국어 + JSON 으로 길어지면 토큰 1당 ~2.5 char 비율로 1만 char 초과 가능. 5843byte 가 정확히 4096 토큰 부근에서 잘림.
2. **safeParseJson 의 jagged 처리**: 절단된 JSON 을 `JSON.parse()` 직접 호출 → SyntaxError. 부분 복구 시도 없음.
3. **모델 단일**: Claude 응답 시간이 45~76초/섹션 (제안서 7섹션 = 5분+). truncate 시도 자체가 비싼 호출 끝에 발생 → 재시도 비용 부담.

### 해결 (Phase L1, `f2c0c38` / `6369403` / `f0ffab8`)

세 층 동시 강화:

1. **max_tokens 확장**: 4096 → 8192 (일반) / 16384 (Express 일괄). 토큰 한계 자체를 제거.
2. **safeParseJson 강화**: trailing comma 제거 + 마크다운 펜스 (` ```json ` / ` ``` `) 제거 + 중괄호 슬라이스 + 잘림 감지 + **자동 1회 재시도**
3. **Gemini Primary**: Gemini 3.1 Pro Preview 가 Claude 보다 응답 빠름 (특히 한국어 JSON). 실패 시 Claude 자동 fallback.

신규 단일 진입점: `src/lib/ai-fallback.ts` `invokeAi(params)` — provider/model 중립.

```ts
const { raw, provider, model, elapsedMs } = await invokeAi({
  prompt,
  maxTokens: 8192,
  temperature: 0.4,
  label: 'logic-model',
})
const json = safeParseJson<LogicModelResponse>(raw)
```

### 재발 방지

**한계가 보이면 데이터 (max_tokens) + 코드 (safeParseJson) + 모델 (provider) 을 동시에 강화.** 하나만 강화하면 다음 한계가 다른 차원에서 또 터진다.

L1 의 발견: 5843byte truncate 사고가 단순 토큰 부족이 아니라 *전체 AI 호출 신뢰성 부족* 의 증상이었다. invokeAi + safeParseJson 강화로 모든 호출이 더 안전해짐.

CLAUDE.md "Claude API" 섹션 + STATE 알려진 이슈 *"AI 응답 시간 45~76초/섹션"* 도 같은 원인 → L1 으로 부분 해소.

---

## 14. 시스템 정체성 재정의 (Express Mode 채택) — ADR-011

### 시작

2026-04-27 PRD-v6.0 작성 직후 (같은 날) 사용자가 던진 통찰:

> *"언더독스의 강점은 부각이 되지만 RFP에 따라 유연하게 적용 유무를 판단하고 적용하면서, 과정이 가장 사용자 친숙한 방식으로 되려면 어떻게 해야할까? 복잡도가 올라가는 방식보다는 사용자가 직관적으로 따라가지만, 계속 본인 스스로 흐름을 놓치지 않고 핵심 메세지 중심으로 결과물이 완성되는거야. SROI, 예산, 코치추천 이것도 필요한 기능이지만 부차적이야. **핵심은 RFP에 맞춰서 당선 가능한 기획 1차본이 나오는거지**"*

이 한 문단이 시스템 정체성 자체를 재정의했다.

### 메인 세션이 잘못 본 것 (재발 방지의 핵심)

PRD-v6.0 작성을 통해 메인 세션은 *"6 스텝 파이프라인 = 시스템의 정체"* 로 굳혀가고 있었다. Phase A~H 누적 105 커밋 + 10 ADR + 9 architecture 문서가 모두 6 스텝 위에 쌓여 있었으니 *그 위에서 안정화*가 자연스러운 다음 수순으로 보였다.

**그러나 사용자는 시스템을 *밖에서* 보고 있었다**:
- 신입 PM 의 첫 프로젝트 = 6 step 모두 거치면 수 시간. 어디부터?
- 부차 기능 (SROI · 예산 · 코치) 이 메인 흐름을 차단
- 평가위원에게 보일 1차본 도달 시간 = 명확하지 않음

### 결과 (ADR-011 채택)

시스템이 두 트랙으로 재정의:

```
Express Track (메인)              Deep Track (보조)
────────────────────              ────────────────────
RFP → 30~45분 → 1차본              기존 6 step (Phase A~H 산출물 100% 보존)
챗봇 + Slot Filling                정밀 산출 (수주 후 실행)
점진 미리보기                      Loop 얼라인 Gate
부차 기능 자동 인용 (1줄)
신규 진입점
```

기존 코드·UI·데이터 100% 보존. Express 는 *추가* 트랙. PRD-v6.0 → v7.0 격상 (v6 archived).

### 재발 방지

**Phase A~H 같은 누적 결과 위에서도 "이게 정말 메인 흐름인가" 자문이 필요.** 메인 세션은 누적 산출물에 *과적합* 하기 쉽다. 사용자가 시스템 *밖에서* 보는 시각이 결정적.

세 가지 시그널이 있을 때 시스템 정체성 재검토:

1. **신입 사용자 막힘**: "어디부터 시작?" 질문이 반복되면 진입점 정체성 부재의 신호
2. **부차 기능 비대화**: 메인 가치 외 부차 기능이 동등 노출되면 메인 흐름 차단
3. **사용자 한 문단 통찰**: 짧은 한 문단이 "이게 부차이고 이게 메인이야" 를 정리하면 즉시 ADR.

ADR-011 의 사용자 원문을 LESSONS 부록 C 에 추가. *"핵심은 RFP에 맞춰서 당선 가능한 기획 1차본이 나오는거지"* 가 가장 결정적 16글자.

또한 메모: `feedback_gatekeeping.md` 의 *"각 Phase/Wave 게이트에서 설계 재검토"* 가 이 케이스에서 정확히 작동. PRD-v6.0 작성 자체가 게이트 → 사용자 통찰로 즉시 v7 격상.

---

## 15. (선택) 미래에 만들 수 있는 다음 함정 (이전 §12 였음)

이 섹션은 **아직 안 일어났지만 일어날 가능성이 높은** 함정들. 회고 아닌 예방.

### 15.1 Phase I 배포 시 환경변수 누락

- 로컬 dev 는 `.env` 로 동작하지만, Vercel 배포 시 환경변수 누락 → 빌드는 통과, 런타임 500
- 특히 `DATABASE_URL`, `ANTHROPIC_API_KEY`, `GOOGLE_*` (OAuth)
- **방어**: Vercel preview 배포를 거쳐야 prod 배포 가능하도록 강제. preview 에서 첫 페이지 로드 + 1개 AI 호출까지 smoke test.

### 15.2 Asset 30+ 도달 시 매칭 점수 캐싱 부재로 느려짐

- 현재 `matchAssetsToRfp()` 는 모든 자산에 대해 매번 점수 계산 (O(N×M) — 자산 N · 섹션 M)
- 30+ 도달 시 Step 1 RFP 파싱 직후 패널 렌더가 1초 이상
- **방어**: 자산별 `programProfileFit` 정규화 결과를 캐시 (예: Redis or in-memory). RFP·프로파일 변경 시만 재계산.

### 15.3 Logic Model Outcome ↔ ContentAsset 연결 가능성

- 현재 `ContentAsset.applicableSections` 는 RFP 섹션 키만 가리킴
- Logic Model 의 Outcome 항목과 자산을 직접 연결하면 SROI 계산 시 어느 자산이 어떤 outcome 에 기여했는지 추적 가능
- **함정**: 이 연결을 충동적으로 추가하면 스키마 복잡도 증가. v3 시점까지 미룰 것.

### 15.4 가이드북 사이트 (guidebook-site) 와 메인 시스템 동기화

- 가이드북 v2 는 별도 트랙(ADR-005)이지만 ProgramProfile 11축 같은 **시스템 핵심 개념** 이 가이드북에도 등장
- 시스템에서 12축으로 확장되면 가이드북은 11축인 채로 남을 수 있음
- **방어**: 시스템 핵심 개념 변경 시 `docs/guidebook/` 도 영향 분석에 포함. CI 에서 guidebook 빌드도 함께 돌리는 게 한 가드.

### 15.5 사용자 메모리(MEMORY.md) 와 저장소 docs 의 진실 충돌

- `~/.claude/projects/.../memory/*.md` 는 시점 스냅샷. *"This memory is N days old"* 경고가 자주 뜸
- 실제 코드는 그 사이 변경됨
- **방어**: 메모리는 "맥락 복원용" 으로만 쓰고, 사실 확인은 항상 저장소 코드·문서에서. 이 LESSONS.md 도 마찬가지 — 한 달 뒤엔 일부가 stale 일 수 있다.

---

## 부록 A — 메모리 파일 인덱스

사용자 메모리(`~/.claude/projects/C--Users-USER-projects-ud-ops-workspace/memory/`) 기준. 각 파일이 답하는 질문:

| 파일 | 답하는 질문 |
|---|---|
| `session_20260420_status.md` | Phase E 직전 전체 진행 상태는? |
| `session_20260421_phase_e_complete.md` | Phase E 가 무엇을 만들었나? |
| `session_20260423_phase_f_wave0.md` | Phase F 시작 직전 체크포인트 정리는? |
| `feedback_first_principle.md` | 제1원칙(설득력+차별화)은 무엇이며 어떻게 적용? |
| `feedback_gatekeeping.md` | 게이트마다 설계 재검토 책임은? |
| `feedback_coplanner_mode.md` | AI 공동기획자 협업 패턴은? |
| `project_pipeline_redesign_20260415.md` | 파이프라인 v2 재설계 이유와 구조? |
| `project_program_profile_v1.md` | ProgramProfile 11축 스펙? |
| `project_impact_value_chain.md` | Impact Value Chain 5단계 + 루프? |
| `project_asset_registry.md` | Asset Registry v1 (코드 시드)? |
| `project_content_hub.md` | Content Hub v2 (DB + 계층 + UI)? |
| `project_express_mode.md` ⭐ | Express Mode (ADR-011) 트랙 정체·12 슬롯·3 카드? (L1 후속 추가 예정) |

## 부록 B — Journey 파일 인덱스

`docs/journey/` 기준. 그날의 흐름·사용자 원문 인용 필요할 때 참조.

| 파일 | 다루는 사건 |
|---|---|
| `2026-04-15-redesign-kickoff.md` | 파이프라인 v2 재설계 시작 |
| `2026-04-15-phase-a-execution.md` | Phase A (골격) 실행 |
| `2026-04-15-phase-b-wave1-gates.md` | Phase B Wave 1 게이트 운영 |
| `2026-04-16-guidebook-review.md` | 가이드북 v2 진단·재정비 |
| `2026-04-21-phase-e-complete.md` | Phase E + 가이드북 한/영 + 제1원칙 정립 |
| `2026-04-21-pm-guide-simulation.md` | pm-guide 매칭 3 시나리오 시뮬 |
| `2026-04-21-smoke-test-phase-e.md` | Phase E 품질 검증 (Control vs Treatment) |
| `2026-04-23-impact-value-chain-adoption.md` | ADR-008 채택 흐름 |
| `2026-04-24-phase-g-asset-registry-kickoff.md` | Phase G 착수 |
| `2026-04-24-phase-h-content-hub-kickoff.md` | Phase H 착수 (G 완료 익일) |
| `2026-04-27-express-mode-adoption.md` ⭐ | ADR-011 채택 흐름 + L1 Gemini 통합 (Phase L 시작) |

## 부록 C — 이 문서에 직접 인용된 사용자 원문

전부 의사결정의 결정적 한 마디들. 보존 목적.

1. **2026-04-22 체크포인트 정리 시작**
   > *"C(커밋 정리) 부터"*

2. **2026-04-23 Phase F 트리거 (가벼운 태스크 → 구조 격상)**
   > *"너가 생각했을 때 임팩트가 앞이랑 뒤에 두먼 오는 건 어때?"*

3. **2026-04-23 ⑤ Outcome 정체 확정**
   > *"outcome 은 SROI 로 나올거고"*

4. **2026-04-23 자산 인벤토리 사용 제약**
   > *"여기에 담당자 이름이 지금 들어갈 필요는 없을 것 같아. 그리고 이건 2분기 우리 계획이니까 이 내용들이 너무 강하게 들어가기보다는 너가 어떤 프로덕트들과 asset이 있고, 나오고자 하는지를 인지하기 위해서 공유해준거야"*

5. **2026-04-21 제1원칙 선언**
   > *"반드시 지켜야 하는 가장 기본 원칙은 RFP·클라이언트 요구 사항에 맞춰서 가장 설득력 있는 제안서를 기획하는 것이고, 그 안에서 우리의 강점·차별화 포인트가 잘 나와야 해. 너는 에이전트가 일할 때 계속 이 관점에서 높은 기준으로 결과물이 나오는지를 검증해야 해."*

6. **2026-04-21 4 세부 원칙 추가**
   > *"단순히 기존 자료·데이터를 기본으로 '이게 좋은 제안서다' 이렇게 하면 안 돼. 시장의 흐름을 반영하면서, 통계적 근거 있는 설득과 함께 제대로 된 문제정의, 그래서 before & after 가 명확하도록 기획해줘. 이걸 그대로 반영하라는 게 아니라 이런 관점들이 잘 서있어야 해."*

7. **2026-04-24 Phase H 트리거 (v1 → v2 격상)**
   > *"계속 교육 콘텐츠는 늘어날건데 이걸 담을 수 있도록 세팅이 되어 있을까?"*

8. **2026-04-27 시스템 정체성 재정의 (Express Mode, ADR-011)**
   > *"언더독스의 강점은 부각이 되지만 RFP에 따라 유연하게 적용 유무를 판단하고 적용하면서, 과정이 가장 사용자 친숙한 방식으로 되려면 어떻게 해야할까? 복잡도가 올라가는 방식보다는 사용자가 직관적으로 따라가지만, 계속 본인 스스로 흐름을 놓치지 않고 핵심 메세지 중심으로 결과물이 완성되는거야. SROI, 예산, 코치추천 이것도 필요한 기능이지만 부차적이야. **핵심은 RFP에 맞춰서 당선 가능한 기획 1차본이 나오는거지**"*

   가장 결정적인 16글자: *"핵심은 RFP에 맞춰서 당선 가능한 기획 1차본이 나오는거지"*

9. **2026-04-27 비정형 → 정형 우려 (Express 4 안전장치 트리거)**
   > *"비정형데이터를 정형화 시키는게 굉장히 어려운 로직이 될 것 같아"*

   이 한 줄이 ADR-011 §"비정형 → 정형 안전장치" 4종 (Schema First / Partial Extraction / 외부 분기 자동 / Validation Gate) 도입 트리거.

---

*이 문서는 누적 업데이트 대상이다. 새로운 사고가 발생하면 (a) 기존 케이스의 변형이면 해당 §에 추가, (b) 새 카테고리면 §16~ 으로 신설. 너무 많아지면(20+ 케이스) 카테고리별로 분할 검토.*
