# ADR-016: 데이터 센터 구글 드라이브 통합 (Wave V 후속)

- **상태**: Draft (메모 단계, 2026-05-20)
- **작성자**: AI Architect (사용자 입력 기반)
- **관련**: ADR-015 (Wave V — Express+Deep 완전 통합)
- **선행 조건**: F1 (코치 자동 추천) 완료 — `historyScore` 가 collaborationCount/satisfactionAvg 에 의존하지만 현재 Supabase coaches_directory 가 그 필드를 sync 하지 않아 거의 0. 데이터 센터 통합 후 채워질 예정.

---

## 배경

2026-05-20 사용자 피드백:

> "언더독스 내 데이터센터에서 이렇게 전체 사업에 대해서 정리했어. 이게 도움이 될까?"
>
> 첨부: `04.[데이터 센터]데이터 아카이빙_대시보드 예시.html` (3.2MB, obfuscated, 보안 처리됨)
>
> "원본은 구글드라이브에 파일들이 몰려있어"

언더독스 내부에 **전체 사업 데이터 아카이브** 가 존재. 구글 드라이브에 흩어진 파일들. 이 데이터를 ud-planner 에 통합하면 F1~F5 의 AI 자동 채움 품질이 크게 향상.

## 활용 가능 영역 (ud-planner 관점)

| ud-planner 영역 | 데이터 센터로 강화 가능 |
|---|---|
| **F1 코치 자동 추천 (배포됨)** | 과거 사업의 코치 참여 이력 + 역할 + 평가 → `historyScore` 정확도 ↑↑ |
| **F2 커리큘럼 자동 시드** | 유사 사업 회차 패턴 (이론/실습/Action Week 비율) → AI outline 정확도 ↑ |
| **F3 외부 리서치 자동** | 과거 사업이 인용한 통계·시장 자료 → 자동 리서치 키워드 정확도 ↑ |
| **F5 1차본 자동 60%** | 채널·예산·대상별 intent / Before·After / 핵심 메시지 패턴 학습 → 시드 품질 ↑↑ |
| **Inspector 7 렌즈** | 수주/낙선 사례별 약점 lens 가중치 보정 → 점수 신뢰도 ↑ |
| **임팩트 forecast** | 과거 실제 SROI vs 예측 갭 학습 → forecast 보정 인수 |

## 문제

1. **구글 드라이브 파일이 흩어져 있음** — 단일 정리된 source X
2. **HTML export 는 obfuscated** — base64 title, anti-debug, view-source 차단
3. **자동 파싱 불가** — 보안 우회 부적절

## 옵션

### 옵션 A — 핵심 1~2 파일 CSV/JSON 수동 export (단기)
- 사용자가 구글 드라이브에서 가장 가치 높은 파일 1~2개 선별
- CSV/JSON 으로 export → ud-planner DB seed script 작성
- 즉시 F1 `historyScore` quality 향상
- 추정 작업: 2~3일

### 옵션 B — 구글 드라이브 API 자동 ingest (중기)
- Google Drive API + service account 사용
- 지정된 폴더의 파일 목록 → 파일 타입별 parser (sheet / docx / pdf)
- 변경 감지 → 주기적 sync
- 사용자가 정리한 폴더 구조 필요
- 추정 작업: 1~2주

### 옵션 C — 데이터 센터 자체에 export API 추가 (장기)
- 언더독스 데이터 센터 dashboard 에 JSON export endpoint 추가
- ud-planner 가 정기적으로 fetch
- 데이터 센터 owner 와 협업 필요
- 추정 작업: 2~4주 (양쪽 팀 협업)

## 권장 진행

1. **Wave V 우선 (F2~F5 완료까지)** — 현재 데이터로 작동하도록 설계. 데이터 센터 통합 X.
2. **Wave V 완료 후 옵션 A** — 사용자가 핵심 파일 1~2개 선별 + ud-planner seed.
3. **운영 안정화 후 옵션 B 또는 C** — 자동 sync 인프라.

## 임시 대응 (현재)

F1 의 `historyScore` (가중치 5%) 는 데이터 부재로 거의 0 — **plan 의도 (영향 최소)**. 데이터 센터 통합 후 활성. 다른 4 축 (keyword 0.4 + task 0.3 + region 0.15 + tier 0.1, 합 0.95) 으로 충분히 작동.

## TODO (Wave V 완료 후)

- [ ] 사용자에게 구글 드라이브 핵심 파일 1~2개 선별 요청
- [ ] 파일 schema 분석 → ud-planner DB column 매핑
- [ ] seed script 작성 (`prisma/seed-data-center.ts`)
- [ ] `historyScore` 활성화 + 가중치 재조정 검토
- [ ] 정식 ADR-016 본문 작성 (Accepted 상태로 승격)
