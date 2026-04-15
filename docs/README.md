# docs/ — 설계·의사결정·교육자료

## 디렉토리 구조

| 폴더 | 목적 | 독자 |
|------|------|------|
| `architecture/` | 시스템 아키텍처 — 모듈 경계, 데이터 계약, Ingestion 파이프라인 | 개발자, 새 모듈 개발자, 에이전트 |
| `decisions/` | ADR (Architecture Decision Records) — 왜 이렇게 결정했는가 | 개발자, 신규 참여자 |
| `journey/` | 시행착오 일지 — 고민·실패·깨달음의 날것 기록 | 추후 교육자료 원천 |
| `playbook/` | 정제된 교육자료 — journey + decisions에서 패턴만 추린 학습 콘텐츠 | 신입 PM, 신입 개발자 |

## 읽는 순서

**개발 참여자가 처음 들어올 때:**
1. [../README.md](../README.md)
2. [../CLAUDE.md](../CLAUDE.md)
3. [architecture/modules.md](architecture/modules.md) — 내가 맡을 모듈이 뭔지
4. [architecture/data-contract.md](architecture/data-contract.md) — 내 모듈이 읽고 쓰는 데이터
5. `decisions/` 중 내 모듈 관련 ADR만 골라 읽기

**전체 설계 맥락이 궁금할 때:**
1. [../ROADMAP.md](../ROADMAP.md) / [../REDESIGN.md](../REDESIGN.md)
2. [architecture/](architecture/) 전체
3. [decisions/](decisions/) 전체 (시간순)
4. [journey/](journey/) 최신 3개

## 쓰는 규칙

**ADR (`decisions/NNN-short-title.md`)**
- 중요 결정 직후 작성 (미루면 유실됨)
- 번호는 증가만, 수정은 허용. 번복 시 "Superseded by NNN" 표기
- 템플릿: [decisions/TEMPLATE.md](decisions/TEMPLATE.md)

**Journey (`journey/YYYY-MM-DD-topic.md`)**
- 세션 끝날 때 1~2분 투자해서 그날의 고민·시행착오·결정을 날것으로 기록
- 잘 안 되던 것·생각이 바뀐 지점을 특히 남김 (나중에 교육자료의 골격)
- 템플릿: [journey/TEMPLATE.md](journey/TEMPLATE.md)

**Playbook (`playbook/NN-topic.md`)**
- journey + decisions가 충분히 쌓인 주제를 정제
- "왜 이렇게 해야 하는가 + 하지 말아야 할 것 + 실제 사례"
- 신규 참여자가 이것만 읽어도 맥락 잡히도록
