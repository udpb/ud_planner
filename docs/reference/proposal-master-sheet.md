# 제안서 마스터 시트 — 영구 reference

> **출처**: `[데이터센터]프로젝트 관리_총괄시트_2020~25.xlsx` (UD Labs 운영)
> **사용자 명시 2026-05-23**: *"이 시트는 중요하니까 꼭 가지고 있어. 제안서 정리방식이고 여기에 예산까지 있으니까"*
>
> 로컬 보관 사본: `.secrets/proposals/master-sheet.xlsx` (370KB) — `.gitignore` 로 외부 노출 X.

---

## 1. 시트 (탭) 목록

| 탭 이름 | rows | cols | 용도 |
|---|---|---|---|
| 프로젝트 목록 | 974 | 19 | 전체 사업 인덱스 |
| 전사 산출물 | 976 | 18 | 사업별 산출물 매핑 |
| **2025년(운영)** ⭐ | 1000 | 33 | 2025년 수주·운영 사업 (PDF 59건) |
| 2025년(기획-미수주) | 963 | 33 | 2025년 미수주 (학습 source) |
| 2024년(운영) | 996 | 33 | 2024년 운영 |
| 2024년(기획-미수주) | 1000 | 25 | 2024년 미수주 |
| 2023년(운영) | 994 | 33 | 2023년 운영 |
| 2023년(기획-미수주) | 1000 | 25 | 2023년 미수주 |
| 2022년(운영) | 994 | 33 | 2022년 운영 |
| 2021년(운영) | 994 | 33 | 2021년 운영 |

→ **운영 6년치 (2020~2025)** · **기획-미수주 3년치 (2023~2025)** 분리. 패배 학습 source (outcome='lost') 도 풍부.

---

## 2. "2025년(운영)" 탭 컬럼 구조 (33 columns)

### 식별·관리 (1~6)
| col | 컬럼명 | 의미 |
|---|---|---|
| 1 | NO | 일련번호 |
| 2 | **프로젝트 ID** | 예: `A.25.0003` · `A.25 (1).0047` (revision 표기) |
| 3 | **프로젝트명** | 한글 사업명 |
| 4 | 검토 일자 | 시트 정리 시점 (예: `26. 04`) |
| 5 | 기존 드라이브 위치 | 원본 폴더 hyperlink |
| 6 | 아카이빙 드라이브 위치 | 아카이브 폴더 hyperlink |

### 1차 산출물 (7~11)
| col | 컬럼명 | 의미 |
|---|---|---|
| 7 | 총괄시트 | 사업별 총괄 Google Sheet hyperlink |
| 8 | 계약서 | 계약서 PDF hyperlink |
| 9 | **사업제안서(PDF)** ⭐ | **Sphere 2 ingest 대상** · Drive file hyperlink |
| 10 | 사업제안서(PPT) | PPT 원본 |
| 11 | 산출내역서 | 예산 산출 내역 (Sphere 2 의 budget context) |

### 운영 산출물 (12~24)
| col | 컬럼명 | 의미 |
|---|---|---|
| 12 | 참여자신청설문 | 모객 단계 |
| 13 | 심사 | 선발 심사 자료 |
| 14 | 선발 | 최종 선발 명단 |
| 15 | **DOGS(자가진단)** | 언더독스 시그니처 진단 도구 |
| 16 | ACTT(사전) | 사전 진단 |
| 17 | 창업현황(사전) | 사전 status |
| 18 | 출석부 | 운영 중 |
| 19 | **교육 자료** | 콘텐츠 자산 (Sphere 2 의 학습 source 후보) |
| 20 | **코칭일지** | UD Labs Coaching Log 와 연결 (P6) |
| 21 | 만족도조사 | 운영 평가 |
| 22 | ACTT(사후) | 사후 진단 |
| 23 | 창업현황(사후) | 사후 status |
| 24 | **결과보고서** | 최종 산출물 (Sphere 2 의 outcome 검증) |

### 메타 (25~26)
| col | 컬럼명 | 의미 |
|---|---|---|
| 25 | 전체완료율 | 산출물 완성도 % |
| 26 | LMS 등록 여부 | UD LMS (P3) 와의 연결 |

(col 27~33 — 추가 메타 컬럼)

---

## 3. PDF Hyperlink 형식 (2 패턴)

각 셀의 hyperlink 가 Google Drive 파일 URL. **두 형식 모두 매칭 필요**:

| 패턴 | 정규식 | 예시 |
|---|---|---|
| `/file/d/{id}/view` | `\/d\/([a-zA-Z0-9_-]+)` | `https://drive.google.com/file/d/1-9x8...QxD/view?usp=drive_link` |
| `/open?id={id}` | `[?&]id=([a-zA-Z0-9_-]+)` | `https://drive.google.com/open?id=1nRIUv...&usp=drive_copy` |

**셀 값 형식** (ExcelJS):
```js
cell.value = { text: "A.25.0003_사업명_사업제안서(PDF)", hyperlink: "https://drive..." }
// 또는 string "해당 없음" (PDF 없는 사업)
```

---

## 4. 2025년 운영 현황 (분석 결과)

총 **88 행** (NO 가 있는 데이터 행) 중:

| 분류 | 건수 | 의미 |
|---|---|---|
| **PDF 있음** (fileId 추출 가능) | **59 건** | Sphere 2 ingest 대상 |
| PDF 해당 없음 (`"해당 없음"`) | 12 건 | 별도 PDF 미작성 사업 (특강·계약서만 등) |
| 다른 형식 (분석 필요) | 17 건 | URL 다른 형식 또는 데이터 누락 |

---

## 5. 활용 패턴 — Sphere 2 ingest 흐름

```
master-sheet.xlsx (이 reference)
   ↓ ExcelJS 파싱
2025년(운영) 탭 → col 9 hyperlink 추출
   ↓ regex 2개 매칭 → fileId 59건
Google Drive API (OAuth refresh token 필요)
   ↓ files.get(fileId, alt='media')
PDF 파일
   ↓ pdf-parse → text
extract-tuple API (POST /api/v1/inference/extract-tuple)
   ↓ 3 LLM 병렬 + embedding
WinningPattern + ContentAsset rows (DB)
```

### 회사 도메인 외부 공유 제한 우회 (2026-05-23 사용자 통신)

UD Labs Google Workspace 는 외부 공유 제한 정책. service account (`ud-planner-sphere2-reader@ud-ops.iam.gserviceaccount.com`) 가 직접 Drive 접근 X. 해결:

| Option | 방법 | 채택 |
|---|---|---|
| **1. xlsx + manual PDF** | 사용자가 PDF manually download → 우리가 pdf-parse | **단기 (W1)** |
| **2. 사용자 OAuth refresh token** | udpb@udimpact.ai 본인 OAuth → refresh token 시스템 보관 | **중기 (W2+) 권장** |
| 3. Domain-wide Delegation | Workspace admin 협조 | 보안 검토 시 |
| 4. 개인 Drive 복사 | 1건씩 manual | 비추천 |

---

## 6. 예산 정보 위치 (사용자 강조)

> *"여기에 예산까지 있으니까"* — 사용자 2026-05-23

### 예산 source 컬럼 후보
- **col 11 산출내역서** — 사업별 예산 내역 (PDF 또는 시트)
- **총괄시트** (col 7) — 사업별 통합 시트 안의 예산 항목
- **계약서** (col 8) — 계약 금액

### Sphere 2 에서의 활용
- Content tuple 의 `keyNumbers` 에 예산 정보 자동 추출 (`{value: "165M원", context: "총 사업비"}`)
- 향후 ContentAsset.category='data' 로 budget 자산 분리
- Channel 별 평균 예산 학습 (B2G vs B2B vs renewal)

---

## 7. 메모리 보관

본 reference 외에:
- **시트 원본**: `.secrets/proposals/master-sheet.xlsx` (영구 보관)
- **PDF download**: `C:/Users/USER/projects/archive/` (사용자 작업 폴더, 17개 PDF — 2026-05-23)
- **추출된 fileId list**: 향후 `.secrets/proposals/2025-운영-pdf-ids.json` 으로 저장 예정 (자동화 시)

---

## 변경 이력

- **2026-05-23 초안 작성** (작업: Wave W W1 첫 dry-run 직전)
  - 사용자 강조: "이 시트는 중요하니까 꼭 가지고 있어"
  - 컬럼 33개 + 시트 10개 + PDF URL 패턴 2개 매핑 완료
  - 회사 도메인 외부 공유 제한 4 우회 option 정리
