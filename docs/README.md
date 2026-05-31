# docs/ — 설계·의사결정·교육자료

## 디렉토리 구조

| 폴더 | 목적 | 독자 |
|------|------|------|
| `architecture/` | 시스템 아키텍처 — 모듈 경계, 데이터 계약, Ingestion 파이프라인 | 개발자, 새 모듈 개발자, 에이전트 |
| `decisions/` | ADR (Architecture Decision Records) — 왜 이렇게 결정했는가 | 개발자, 신규 참여자 |
| `journey/` | 시행착오 일지 — 고민·실패·깨달음의 날것 기록 | 추후 교육자료 원천 |
| `playbook/` | 정제된 교육자료 — journey + decisions에서 패턴만 추린 학습 콘텐츠 | 신입 PM, 신입 개발자 |

> 일하는 방식 = 위임+검증+투명보고 (ADR-020). `playbook/` 가 그 상세, `decisions/README.md` 가 ADR 인덱스.

## 읽는 순서

**새 세션(메인/서브) 진입 시:**
1. [../HANDOFF.md](../HANDOFF.md) — 현재 라이브 상태·다음 진입점
2. [HISTORY.md](HISTORY.md) — 문서 진실/버전 · [glossary.md](glossary.md) — 용어 SSoT
3. [../CLAUDE.md](../CLAUDE.md) + [playbook/working-method.md](playbook/working-method.md) — 운영 규칙·일하는 방식
4. [decisions/README.md](decisions/README.md) — ADR 인덱스 (관련 ADR 골라 읽기)

**개발 참여자가 모듈 맡을 때:**
1. [architecture/modules.md](architecture/modules.md) — 내가 맡을 모듈
2. [architecture/data-contract.md](architecture/data-contract.md) — 읽고 쓰는 데이터
3. `decisions/` 중 내 모듈 관련 ADR

**전체 설계 맥락:**
1. [architecture/](architecture/) 전체 · [decisions/](decisions/) (시간순) · [journey/](journey/) 최신 3개
> ⚠️ `../ROADMAP.md`·`archive/REDESIGN.md` 는 stale (이력 참조용). 현재 상태는 HANDOFF/HISTORY.

## 쓰는 규칙

**ADR (`decisions/NNN-short-title.md`)**
- 중요 결정 직후 작성 (미루면 유실됨)
- **Accepted 후 수정 금지** — 변경 필요 시 새 ADR (`Supersedes: NNN`). 번호는 영구.
- 서브 에이전트는 ADR 작성 금지 (후보만 보고)
- 템플릿: [decisions/TEMPLATE.md](decisions/TEMPLATE.md) · 인덱스: [decisions/README.md](decisions/README.md)

**Journey (`journey/YYYY-MM-DD-topic.md`)**
- 세션 끝날 때 1~2분 투자해서 그날의 고민·시행착오·결정을 날것으로 기록
- 잘 안 되던 것·생각이 바뀐 지점을 특히 남김 (나중에 교육자료의 골격)
- 템플릿: [journey/TEMPLATE.md](journey/TEMPLATE.md)

**Playbook (`playbook/NN-topic.md`)**
- journey + decisions가 충분히 쌓인 주제를 정제
- "왜 이렇게 해야 하는가 + 하지 말아야 할 것 + 실제 사례"
- 신규 참여자가 이것만 읽어도 맥락 잡히도록
