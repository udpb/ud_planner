# 가이드북 에이전트 브리프

> **상시 운영.** 가이드북은 ud-ops 시스템과 **별개 트랙**. 새 사례·브랜드 업데이트·구조 변경 발생할 때마다 여기 브리프를 호출.

## 정체성 (변경 금지)

1. **독자:** 언더독스 PM (신입 포함), OJT 배포용
2. **목적:** 읽고 첫 RFP 받았을 때 첫 주에 뭘 할지 아는 수준
3. **원칙:**
   - Practical > Comprehensive — 방대함 지양, 실전 즉시 적용
   - 시스템 사용법 ❌, 사고방식·질문·체크리스트 ⭕
   - 사례는 계속 늘어남 — 구조 그대로 추가만
   - 메시지 선명도 최우선 (혼란 유발 ❌)

## 저장 위치

```
docs/guidebook/
├── README.md                  # 목차
├── 01-start/
├── 02-field/
├── 03-casebook/               # 핵심 자산
├── 04-channel-types/
└── appendix/
```

## 작업 종류별 브리프

| 브리프 | 시점 |
|--------|------|
| [initial-v2.md](./initial-v2.md) | 가이드북 v2 최초 작성 |
| [add-case.md](./add-case.md) | 새 수주 제안서 케이스 추가 |
| [update-brand.md](./update-brand.md) | 브랜드 수치·자체도구 업데이트 반영 |
| [reorganize.md](./reorganize.md) | 구조 변경 |

*(add-case · update-brand · reorganize 는 필요 시점에 생성)*

## 상시 규칙 (모든 브리프가 지키는 것)

1. **고유명사 원문 확인** — 오타는 치명적 (예: 코오롱 프로보노, NH 애그테크)
2. **언더독스 자체 도구 표기** — ACT-PRENEURSHIP, DOGS, IMPACT, Startup 6 Dimension, 라이콘, 액션코치
3. **수치는 ud-brand.ts 상수에서만 인용** — 임의 숫자 금지
4. **브랜드 보이스 SKILL §11 금지 목록** — AI 코치 별도 레이어 ❌, 약자 동정 프레임 ❌
5. **마크다운만** — HTML/JSX/코드 임의 삽입 ❌
6. **Git 커밋은 하지 않음** — 메인 세션이 담당
