# 브리프 체크리스트 — 자급자족 12항목

> 모든 서브 에이전트 호출은 이 12항목을 채운 자급자족 브리프 기반.
> 템플릿: [`../../.claude/agent-briefs/_template.md`](../../.claude/agent-briefs/_template.md)
> 자급자족 = 서브 에이전트가 `브리프 + CLAUDE.md + AGENTS.md + glossary.md` 만으로 작업 가능.

---

| # | 항목 | 내용 | 흔한 실수 |
|---|------|------|-----------|
| 1 | 🎯 **Mission** | 한 문장 · 능동 동사 · 측정 가능한 종료 상태 | 모호한 "개선" |
| 2 | 📋 **Context** | 왜 필요 (PRD § / ADR-N / Journey 날짜 인용) · 안 하면 뭐가 깨지나 | 컨텍스트 없이 작업만 |
| 3 | ✅ **Prerequisites (STOP 조건)** | 선행 조건 체크리스트 + **각각 검증법**(명령/경로) | 검증법 누락 |
| 4 | 📖 **Read These Files First** | 순서대로. CLAUDE/AGENTS/glossary 는 기본 | 너무 많이/적게 |
| 5 | 🎯 **Scope (CAN / MUST NOT touch)** | **명시 파일 경로** — `src/**` 같은 와일드카드 금지 | 광범위 스코프 |
| 6 | 🛠 **Tasks** | 번호 매긴 단계 + 중간 체크포인트(build/type pass) | 한 덩어리 |
| 7 | 🔒 **Tech Constraints** | Next.js 16 패턴 · strict 타입 · Zod 경계 · `invokeAi` 단일 진입점 | 레거시 패턴 |
| 8 | ✔️ **Definition of Done** | Mission 과 1:1 · yes/no 측정 가능 · 품질 게이트 포함 | 주관적 DoD |
| 9 | 📤 **Return Format** | 5섹션 보고 ([reporting.md](reporting.md)) + 브리프별 추가 | 자유 형식 |
| 10 | 🚫 **Do NOT** | 흔한 함정 선제 차단 | 생략 |
| 11 | 💡 **Hints & Edge Cases** | 이전 브리프 교훈 · 특수 데이터 상태 · 복사할 소스 라인 | 빈칸 |
| 12 | 🏁 **Final Note** | 부수 발견은 보고만 (스코프 크리프 금지) · 다음 후보 브리프 | 생략 |

---

## 핵심 원칙

- **CAN/MUST NOT touch + 완료 후 `git diff --name-only` 검증** = 격리 메커니즘 전부. 샌드박스 불필요.
- **Return Format 5섹션과 메인→사용자 보고 5섹션은 대칭** — 메인의 큐레이션이 재작성이 아니라 필터가 됨.
- **충돌은 ADR 후보로 보고, 직접 편집 금지** — 런타임 지식(glossary·schema)은 결정 기록 전까지 동결.
- **read-only 추출 브리프**(BR/Brain 자료 흡수)는 상단에 `본 작업은 read-only. 파일 수정/생성 금지` 명시.

## ud-ops 변경 금지 항목 (브리프 MUST NOT touch 기본 후보)

- `prisma/schema.prisma` 핵심 모델·키 (필드 추가도 ADR/DATA 브리프로)
- `src/lib/ai-fallback.ts` `invokeAi` 시그니처 (eslint `no-restricted-imports` 가 우회 차단)
- Express `schema.ts` 섹션 키 (1~7) · 슬롯 enum
- 모듈 manifest `reads/writes` 계약 (`check:manifest` 가 검증)
- 다른 트랙의 컴포넌트 (충돌 방지)
