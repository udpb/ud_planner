# 2026-04-28 — Phase L Wave L2: Express PoC 풀 구현

> 사용자 자리 비운 7시간 자율 진행 세션. ADR-011 / express-mode.md 의 L2 스펙을 그대로 구현.

## 입장

ADR-011 (2026-04-27) 채택 직후 사용자 결정:

> "A로 갔으면 좋겠어. A를 돌리기전에 COMPACT한번 해줘"

= **A안 풀 PoC** (1~2일 분량을 한 세션에 압축).

자리 비우기 전 4 결정 받음:

1. **사이드바 진입점**: 신규 프로젝트 → Express 자동 redirect (Recommended)
2. **첫 화면 입력**: PDF 업로드 + 본문 붙여넣기 양쪽 (Recommended)
3. **점진 미리보기**: 7 섹션 스크롤 + 진행 하이라이트 (Recommended)
4. **자율 권한**: DB 마이그 + 풀 PoC + 커밋 모두 자율 (Recommended)

## Wave 분해 (실제 진행 순서)

| Wave | 시간 | 산출 |
|---|---|---|
| Wave 1 | 5분 | Prisma schema `Project.expressDraft Json?` + `expressActive Boolean` + `expressTurnsCache Json?` 추가 + 마이그 SQL 생성 + Docker 시작 후 `prisma migrate deploy` 적용 + `prisma generate` |
| Wave 2 | 25분 | `src/lib/express/` 코어 9 파일 — `schema.ts` (zod 12 슬롯) · `conversation.ts` · `slot-priority.ts` · `active-slots.ts` · `prompts.ts` · `extractor.ts` · `asset-mapper.ts` · `handoff.ts` · `auto-citations.ts` · `process-turn.ts` |
| Wave 3 | 10분 | API 3종 — `/api/express/init` · `/api/express/turn` · `/api/express/save` |
| Wave 4 | 30분 | UI — 서버 진입 페이지 + `<ExpressShell>` orchestrator + `<NorthStarBar>` 5단계 진행 바 + `<ExpressChat>` 좌측 + `<ExpressPreview>` 우측 7섹션 + `<RfpUploadDialog>` + 카드 3종 (`PmDirectCard`, `ExternalLlmCard`, `AutoExtractCard`) |
| Wave 5 | 5분 | 진입점 — `new/page.tsx` 자동 redirect to Express + 6 step 페이지에 "Express" 링크 + Express 안에 "정밀 기획 (Deep)" 분기 |
| Wave 6 | 0분 | 자동 저장 (debounced 1500ms) + RFP 자동 첫 턴 흐름은 Wave 2~4 에 이미 완료 — 별도 작업 없음 |
| Wave 7 | 15분 | typecheck 수정 + 통합 커밋 + STATE/ROADMAP 갱신 + 본 journey |

총 ~90분.

## 막힌 곳

### ProgramProfile / RfpParsed 필드명 오인

express-mode.md SSoT 작성 시 가상의 필드명 (`profile.businessDomain.primary`, `rfp.title`, `rfp.evalCriteria.category`, `rfp.evalCriteria.weight`, `profile.channel.deliveryFormat`) 을 가정해서 lib 코드 작성 → typecheck 첫 시도에서 일제히 fail.

실제 필드:
- `RfpParsed.projectName` (title 아님)
- `RfpParsed.evalCriteria[].item` + `.score` (category·weight 아님)
- `ProgramProfile.targetSegment.businessDomain` (배열, businessDomain 단일 아님)
- `ProgramProfile.delivery.mode` (channel.deliveryFormat 아님)
- `ProgramProfile.targetStage` enum 에 '초기' 없음 — 'seed'/'예비창업_*'/'pre-A'/'series-A이상'/'소상공인'/'비창업자'

**교훈**: SSoT 문서 작성 시 기존 타입 import 검증을 같이 해야 함. ADR + spec 만으로 코딩하면 타입 미스매치 사고 100%.

### .next/dev/types/validator.ts 자동생성 깨짐

Express 화면을 dev 로 띄운 적이 없는데 `tsc --noEmit` 첫 시도에서 `.next/dev/types/validator.ts` 의 잘못된 코드가 잡힘 (Next.js 16 dev 의 잔재). `rm -rf .next/dev/types` 후 재실행 → 깨끗.

**교훈**: tsconfig.json 의 `include` 에 `.next/dev/types/**/*.ts` 가 들어 있어, dev 가 끊긴 흔적이 typecheck 에 누설된다. CI 에선 `.next/` 자체를 사전 제거해야 안전.

### zod default(false) 의 type 좁힘

```ts
acceptedByPm: z.boolean().default(false)
```
이걸 `.map().filter((x): x is AssetReference => x !== null)` 로 좁히면 type predicate 가 `acceptedByPm: false` literal 로 추론 → 다음 단계에서 boolean assignable 실패.

**해결**: `.map().filter()` 대신 `for...of + .push()` 로 명시 누적 + `acceptedByPm: false as boolean`.

## 결과

- typecheck `EXIT=0`
- 마이그 적용 완료 (`20260428000000_phase_l_express_draft`)
- 7시간 안 쓰고 ~90분에 PoC 끝남 — 사용자 깰 때 동작하는 화면 받음
- L3·L4·L5 에 들어갈 컴포넌트 (외부 LLM 카드 3종, auto-citations) 도 placeholder 수준으로 L2 에 같이 들어감 — L3 는 "자동 트리거 보강" 으로 줄어듦

## 다음

L3·L4·L5 가 L2 의존성으로 풀려있어 병렬 가능. 사용자 깰 때 우선순위 결정 필요.
- L3: 챗봇 안에서 외부 LLM 카드 자동 트리거 (현재는 AI 응답이 `externalLookupNeeded` 채워야 표시 — AI 가 잘 채워주는지 검증 필요)
- L4: 부차 기능 1줄 인용 정밀화 (현재 placeholder, 신뢰도 0.3)
- L5: 검수 에이전트 (`inspectDraft`) — 사용자 이전 명시 요청
- L6: Express → Deep 인계 본격 (`mapDraftToContext` 호출 흐름 + UI 토글 본격)
