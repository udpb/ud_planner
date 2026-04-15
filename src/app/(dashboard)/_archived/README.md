# _archived — 보관된 페이지들

> Next.js App Router 에서 `_` 접두사가 붙은 폴더는 **private folder** 로, 라우트가 생성되지 않음. 파일은 보존되지만 URL 로 접근 불가.

## 왜 여기 있나

재설계 v2 (2026-04-15) 에서 "내부 자산은 자동으로 올라온다" 원칙에 따라 자산 관리용 독립 페이지는 제거 대상. 하지만:
- 대체 기능(프로젝트 내부 자동 추천 · Coach Finder UI · Admin 통합)이 아직 완성되지 않았다.
- 해당 파일들에 축적된 UX·로직을 참고자료로 보존할 가치가 있다.
- 완전 삭제 대신 **라우트에서 비활성 + 코드 보존** 선택.

## 보관 대상 · 대체 기능 · 제거 시점

| 폴더 | 대체 기능 | 실제 제거 시점 |
|------|----------|-------------|
| `coaches/` | Coach Finder UI (`src/app/(lab)/coach-finder/` — Planning Agent Phase 5) | Coach Finder 안정 운영 후 |
| `modules/` | Step 2 커리큘럼 IMPACT 모듈 자동 추천 | ROADMAP Phase E1 완료 후 |
| `sroi/` | Step 4 예산·SROI 통합 | ROADMAP Phase E3 완료 후 |
| `feedback/` (관리 뷰) | Admin 경로로 이전 (미구현) 또는 Step 3/4 내부 흡수 | ROADMAP Phase F |

**주의:** 외부 참여자 피드백 경로 `src/app/feedback/[projectId]` 는 **별도 경로로 보존 중** (이 폴더와 무관). 서비스 동작에 필요하므로 절대 삭제 금지.

## 관련 API 는 유지

이 페이지들이 사용하던 API 라우트 (`/api/coaches`, `/api/modules`, `/api/feedback`, `/api/sheets` 등) 는 **프로젝트 내부 스텝에서 계속 사용**. 페이지만 archived, API 는 정상 동작.

## 복구 방법

필요하면 해당 폴더를 `_archived/` 에서 상위(`src/app/(dashboard)/`)로 다시 옮기고 사이드바 navItems 에 항목 추가.

## 관련 문서

- [../../../../docs/architecture/current-state-audit.md](../../../../docs/architecture/current-state-audit.md) — 유지/제거 전체 판정표
- [../../../../ROADMAP.md](../../../../ROADMAP.md) — Phase E/F 대체 기능 일정
