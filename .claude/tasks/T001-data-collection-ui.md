# T001: 데이터 수집 UI — 참가자 신청서 + DOGS + ACTT 폼

## 미션
프로젝트별 참가자 데이터 수집 페이지를 만든다. 참가자 신청서, DOGS 성향진단, ACTT 실행역량 진단 3개 폼.

## 브랜치
```bash
git checkout -b feat/T001-data-collection master
```

## 읽어야 할 파일
1. `prisma/schema.prisma` — Applicant, DogsResult, ActtResult 모델 확인
2. `src/app/(dashboard)/projects/[id]/page.tsx` — 파이프라인 페이지 구조
3. `src/components/ui/` — 사용 가능한 UI 컴포넌트 목록
4. `CLAUDE.md` — 디자인 시스템, 커밋 컨벤션

## 스코프

### 만들어야 할 파일
1. `src/app/(dashboard)/projects/[id]/data-collection/page.tsx` — 탭 레이아웃 (신청서 | DOGS | ACTT)
2. `src/app/(dashboard)/projects/[id]/data-collection/applicant-form.tsx` — 신청서 입력 폼
3. `src/app/(dashboard)/projects/[id]/data-collection/dogs-form.tsx` — DOGS 24문항 진단
4. `src/app/(dashboard)/projects/[id]/data-collection/actt-form.tsx` — ACTT 15문항 진단
5. `src/app/api/data-collection/applicants/route.ts` — CRUD API
6. `src/app/api/data-collection/dogs/route.ts` — CRUD API
7. `src/app/api/data-collection/actt/route.ts` — CRUD API

### 건드리면 안 되는 파일
- `src/app/(dashboard)/projects/[id]/step-*.tsx` — 기존 파이프라인 UI
- `prisma/schema.prisma` — 스키마는 이미 완성됨, 수정 금지
- `src/lib/planning-agent/` — Planning Agent 코드

## 상세 스펙

### 1. 신청서 폼 (Applicant)
Prisma `Applicant` 모델 기반. 필수 필드:
- name, email, teamName, gender, affiliation, orgType
- companyName, industry, problemToSolve, itemIntro
- startupStage, teamSize, motivation, referralSource

섹션별 그룹핑:
- 기본 정보 (이름, 이메일, 성별, 소속)
- 창업 정보 (조직형태, 업종, 아이템 소개)
- 프로그램 참여 (동기, 유입경로)

### 2. DOGS 진단 (DogsResult)
- 24개 문항, 각 1~4점 리커트 척도
- 4가지 유형: D(Drive), O(Openness), G(Growth), S(Stability)
- 결과 자동 계산: 유형별 합산 → 최고점 유형이 dogsType
- 결과 시각화: 4축 바 차트 (간단한 div 기반)

DOGS 문항 구조 (6문항 × 4유형):
```
Q1~Q6: D 유형 문항
Q7~Q12: O 유형 문항  
Q13~Q18: G 유형 문항
Q19~Q24: S 유형 문항
```

### 3. ACTT 진단 (ActtResult)
- 15개 문항, 각 1~5점 리커트 척도
- timing: PRE 또는 POST
- 5개 도메인 (3문항씩):
  - goalOrientation (Q1~Q3)
  - marketAwareness (Q4~Q6)
  - problemSolving (Q7~Q9)
  - experimentation (Q10~Q12)
  - persistence (Q13~Q15)
- 도메인별 평균 + 총점 자동 계산

### 4. API 패턴
기존 API 패턴 따르기 (`src/app/api/projects/route.ts` 참고):
```typescript
// GET: 목록 조회 (projectId 필터)
// POST: 신규 생성
// PATCH: 수정
```

### 5. 네비게이션 연결
사이드바(`src/components/layout/sidebar.tsx`)에 "데이터 수집" 메뉴 추가:
```typescript
{ href: '/projects', label: '프로젝트', icon: FolderKanban },
// 이 항목 아래에 데이터 수집이 프로젝트 하위로 접근됨
```
→ 사이드바 수정 대신, 프로젝트 상세 페이지에서 탭/링크로 접근하는 것이 더 적합.

## 디자인 가이드
- shadcn/ui 컴포넌트 사용 (Input, Select, RadioGroup, Label, Card, Tabs, Badge)
- 폼 길이가 길으므로 섹션별 Card로 구분
- 리커트 척도는 RadioGroup + 가로 배치
- 저장 시 `toast.success()` (sonner)
- 에러 시 `toast.error()`

## 완료 기준
- [ ] 3개 폼 모두 렌더링 + 입력 가능
- [ ] API로 저장/조회 동작
- [ ] DOGS 결과 자동 계산 (유형 판별)
- [ ] ACTT 도메인별 평균 자동 계산
- [ ] `npx next build` 통과
- [ ] 커밋 완료

## 금지 사항
- 기존 step-*.tsx 파일 수정하지 않기
- prisma/schema.prisma 수정하지 않기
- 새 npm 패키지 추가하지 않기 (기존 것만 사용)
