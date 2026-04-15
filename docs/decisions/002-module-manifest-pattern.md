# ADR-002: Module Manifest 패턴 — 가벼운 모듈·명시적 계약·이식성

**Status:** Accepted
**Date:** 2026-04-15
**Deciders:** 사용자(언더독스), AI 공동기획자
**Scope:** 모든 모듈 (core·asset·ingestion·support)

## Context

사용자의 요구사항 (2026-04-15):
1. **각 모듈은 가볍게**. 무거우면 독립 개발·병렬 작업·인수인계가 어려워진다.
2. **다른 사람에게 떼어줄 수 있어야 함**. 언더독스 내부 혹은 외부 개발자가 특정 모듈을 맡을 수 있도록.
3. **필요 시 모듈 추가 가능**. 레지스트리에 붙이기만 하면 통합되어야.
4. **DB는 한 곳**. 모듈마다 자기 DB를 갖지 않음. 공유 Prisma 스키마에서 읽고 쓴다.
5. **모듈 간 데이터 흐름은 자연스럽게**. 같은 일을 두 번 하지 않음.

기존 구조는 `src/app/(dashboard)/projects/[id]/step-*.tsx` + `src/lib/*.ts` 혼재. 모듈 간 경계가 암묵적이고, 어떤 파일이 어느 슬라이스를 읽고 쓰는지 불명확. 의존성은 `import` 체인으로만 확인 가능 → 인수인계 시 큰 맥락 이전이 필요.

## Options Considered

### Option A — 폴더 구조만 재배치 (src/modules/\<name\>/)
- 장점: 가시성 향상
- 단점: 여전히 모듈 간 직접 import 가능, 계약이 명시되지 않음
- 기각: 경계가 강제되지 않으면 시간이 지나면서 다시 얽힌다

### Option B — 별도 패키지(monorepo) + 런타임 격리
- 장점: 강력한 격리
- 단점: Next.js 단일 앱 구조에 과함, 빌드 복잡도 폭증, 인수인계 시 오히려 부담
- 기각: 현재 규모에서 과도

### Option C — Module Manifest 파일 패턴 (채택)
각 모듈이 `manifest.ts` 파일을 갖고 `layer·reads·writes·api·ui·owner·quality` 메타데이터를 선언. 강제는 점진적으로 (처음엔 문서·리뷰로, 나중에 ESLint/런타임 검증으로).
- 장점:
  - 경량 — 파일 하나 추가
  - 명시적 계약 — 한 눈에 의존성 파악
  - 점진적 — 지금은 선언적, 나중에 강제
  - 이식성 — manifest가 인수인계 문서 역할
- 단점:
  - 선언과 실제가 불일치할 수 있음 (처음에는)
  - ESLint 룰 작성 필요 (Phase F)
- 채택: 사용자의 4가지 요구사항 모두 충족하면서 비용이 낮음

## Decision

모든 모듈은 `manifest.ts`를 갖는다:

```typescript
export const manifest: ModuleManifest = {
  name: string                     // 고유 식별자
  layer: "core" | "asset" | "ingestion" | "support"
  version: string
  owner: string                    // 인수인계 시 이 필드 교체

  reads: {
    context?: Array<keyof PipelineContext>
    assets?: string[]              // 자산 모듈 이름들
  }
  writes: {
    context?: Array<keyof PipelineContext>
  }

  api?: string[]                   // "POST /api/..."
  ui?: string                      // 파일 경로

  quality?: {
    checks: string[]               // 룰 ID
    minScore?: number
  }
}
```

**적용 순서:**
- **Phase A:** Manifest 타입 정의 + 기존 모듈들에 manifest 부여 (문서적)
- **Phase C 이후:** 런타임 레지스트리 구축 (`src/modules/_registry.ts`)
- **Phase F:** ESLint 커스텀 룰로 강제

**폴더 재배치:**
- 기존 파일 위치 즉시 이동 ❌ (리스크 대비 가치 낮음)
- 신규 모듈은 `src/modules/<name>/` 에 생성
- 기존 step-*.tsx는 옆에 `manifest.ts`만 추가 (co-locate)
- 완전 재배치는 Phase F 또는 별도 리팩토링 작업으로

## Consequences

### Positive
- 모듈 책임과 계약이 한 파일에 명시 → 인수인계 시간 ↓
- 새 모듈 추가 시 manifest 템플릿 복붙 → 절차적으로 명확
- `owner` 필드로 "이 모듈 누가 맡고 있는지" 즉시 추적
- 에이전트 위임 시 manifest가 곧 브리프의 뼈대

### Negative / Trade-offs
- 초기 오버헤드 — 기존 파일들에 manifest 달기
- 선언과 실제 구현 불일치 리스크 (강제 전까지) — PR 리뷰로 보완
- 두 체계 공존 (기존 `src/lib/` vs 신규 `src/modules/`) — 한동안 혼란 가능

### Follow-ups
- [ ] `src/modules/_types.ts` — ModuleManifest 타입 정의 (Phase A)
- [ ] 기존 6개 스텝 + planning-agent에 manifest.ts 추가 (Phase A)
- [ ] 런타임 레지스트리 (Phase C)
- [ ] ESLint 룰 (Phase F)
- [ ] 폴더 재배치 판단 (Phase F, 필요 시)

## References
- 관련 문서: [../architecture/modules.md](../architecture/modules.md), [../architecture/data-contract.md](../architecture/data-contract.md)
- 관련 ADR: ADR-001 (파이프라인 순서)

## Teaching Notes

**신입 PM/개발자가 이 ADR에서 배울 것:**
- **강한 격리는 비싸다**. 가장 싸게 격리 효과를 내는 방법(선언 → 점진 강제)을 먼저 시도한다.
- 모듈 경계를 **코드 구조**(폴더)가 아니라 **데이터 계약**(manifest.reads/writes)으로 정의하면 리팩토링 자유도가 높다.
- `owner` 필드 하나가 문화적으로 중요: 누구도 주인이 없는 모듈은 썩는다.
- "나중에 강제" 결정은 "영원히 안 강제"가 되기 쉽다. Phase F에 반드시 ESLint 룰 넣는 것을 체크리스트에 남겨야 한다.
