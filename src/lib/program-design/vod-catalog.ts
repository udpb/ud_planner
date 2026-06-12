/**
 * VOD 카탈로그 — 강의 분류 가이드 v5.4 인테이크 스키마 (ADR-028 §4 Follow-up)
 *
 * 사용자가 1,000+ VOD 를 v5.4 기준으로 분류 중 — 완료 시 시트(CSV/XLSX) 수령 예정.
 * 이 모듈은 **받을 그릇**: 20컬럼 zod 스키마 + 헤더 매칭 + 셀 정규화.
 * 임포트 실행은 `scripts/import-vod-catalog.ts`.
 *
 * v5.4 핵심 규칙 (이 파일이 코드로 강제):
 *  - 모든 칸에 `[파악 불가]` 허용 → null/빈 배열 정규화 (추측 채움 금지 원칙의 시트 등가물)
 *  - 전달형식 ⊥ 콘텐츠유형 — 2축 독립
 *  - 경험담·인터뷰·대담 은 난이도 기본값 입문(~초급) / 청중 공통 (명시 없을 때만 적용,
 *    적용 사실은 appliedDefaults 에 기록)
 *  - 강사·소속·직책 컬럼은 받아도 무시 (v5.2 삭제 정책)
 *  - 시장분석 등은 강의영역 교차 허용 → lectureAreas 다중
 *
 * ADR-028 정합: 이 분류 축(청중×비즈니스단계×강의영역×난이도×유효성)은
 * operatingFormat.preLearning 슬롯의 콘텐츠 해석 공간이다.
 */

import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────
// v5.4 어휘 (가변 데이터 — 값 추가는 자유, ADR-028)
// ─────────────────────────────────────────────────────────────────

/** "[파악 불가]" 마커 — 공백 변형('[파악불가]')도 인정. */
export const UNKNOWN_MARKERS = ['[파악 불가]', '[파악불가]'] as const

export const VOD_LANGUAGES = ['Korean', 'English', 'Mixed'] as const

/** 전달형식 (단일) — 7종. */
export const VOD_DELIVERY_FORMATS = [
  '강연',
  '경험담',
  '인터뷰·대담',
  '패널 토론',
  '워크숍·실습',
  '데모·시연',
  '기타',
] as const

/** 난이도·청중 기본값이 적용되는 전달형식 (v5.4: 경험담·인터뷰·대담 → 입문~초급/공통). */
export const VOD_DEFAULTABLE_FORMATS = ['경험담', '인터뷰·대담'] as const

export const VOD_VALIDITY_STATUS = ['상시유효', '점검필요', '폐기후보'] as const

export const VOD_AUDIENCE_EXPERIENCE = ['예비창업자', '초기창업자', '성장기창업자', '공통'] as const

export const VOD_AUDIENCE_BUSINESS_TYPE = [
  '스타트업',
  '소상공인·자영업',
  '프리랜서·1인사업자',
  '소셜벤처·사회적기업',
  '공통',
] as const

/** 비즈니스단계 (다중) — 10종. */
export const VOD_BUSINESS_STAGES = [
  '아이디어 탐색',
  '아이디어 검증',
  '첫 제품 만들기',
  '첫 고객 만들기',
  '반복 매출 만들기',
  '팀 만들기',
  '자금 확보',
  '채널 확장',
  '조직 만들기',
  '전단계공통',
] as const

/** 강의영역 대분류 (6) — 시장분석 등 교차 주제는 다중 허용 (예: 사업·전략+고객·시장). */
export const VOD_LECTURE_AREAS = [
  '사업·전략',
  '재무·투자',
  '사람·조직',
  '고객·시장',
  '제품·운영',
  '법무·규제',
] as const

export const VOD_DIFFICULTY = ['입문', '초급', '중급', '고급', '전문가'] as const

export const VOD_CONTENT_TYPES = ['이론·개념', '사례·경험', '실무·도구', '트렌드·인사이트'] as const

/** v5.2 삭제 정책 — 이 컬럼들은 시트에 있어도 무시 (정규화 헤더 기준). */
export const VOD_IGNORED_COLUMNS = ['강사', '강사명', '소속', '직책'] as const

// ─────────────────────────────────────────────────────────────────
// 엔트리 스키마 (20컬럼)
// ─────────────────────────────────────────────────────────────────

export const vodCatalogEntrySchema = z.object({
  /** 강의ID — 파일명 기반 (필수 · 유일키). */
  lectureId: z.string().min(1),
  folderPath: z.string().nullable(),
  seriesId: z.string().nullable(),
  partNo: z.number().int().nullable(),
  /** 제목 — v5.4 max 60자 (필수). */
  title: z.string().min(1).max(60),
  /** 산업 — 다중('|' 구분), 자유 어휘. */
  industries: z.array(z.string()),
  language: z.enum(VOD_LANGUAGES).nullable(),
  /** 전달형식 — 단일. */
  deliveryFormat: z.enum(VOD_DELIVERY_FORMATS).nullable(),
  /** 요약 — max 150자. */
  summary: z.string().max(150).nullable(),
  /** 인사이트 — max 200자. 언제·누구에게·왜 추천하는가. */
  insight: z.string().max(200).nullable(),
  validityStatus: z.enum(VOD_VALIDITY_STATUS).nullable(),
  validityReason: z.string().nullable(),
  audienceExperience: z.array(z.enum(VOD_AUDIENCE_EXPERIENCE)),
  audienceBusinessType: z.array(z.enum(VOD_AUDIENCE_BUSINESS_TYPE)),
  businessStages: z.array(z.enum(VOD_BUSINESS_STAGES)),
  /** 강의영역 대분류 — 교차 주제는 다중. */
  lectureAreas: z.array(z.enum(VOD_LECTURE_AREAS)),
  /** 세부태그 — 자유 다중. */
  subTags: z.array(z.string()),
  difficulty: z.enum(VOD_DIFFICULTY).nullable(),
  contentTypes: z.array(z.enum(VOD_CONTENT_TYPES)),
  /** 키워드 — 채워져 있으면 3~5개 ([파악 불가] = 빈 배열 허용). */
  keywords: z
    .array(z.string())
    .refine((a) => a.length === 0 || (a.length >= 3 && a.length <= 5), {
      message: '키워드는 3~5개 (또는 [파악 불가] → 빈 배열)',
    }),
  /** v5.4 전달형식 기본값이 적용된 필드 기록 (예: 'difficulty=입문'). 추적용. */
  appliedDefaults: z.array(z.string()).default([]),
})
export type VodCatalogEntry = z.infer<typeof vodCatalogEntrySchema>

// ─────────────────────────────────────────────────────────────────
// 헤더 매칭 (한글 헤더 유연 매칭 — 공백·언더스코어·괄호 변형 허용)
// ─────────────────────────────────────────────────────────────────

/** 헤더 정규화 — BOM·공백·언더스코어·괄호 제거. */
export function normalizeHeader(h: string): string {
  return h.replace(/﻿/g, '').replace(/[\s_()]/g, '')
}

/**
 * 정규화 헤더 → 스키마 필드. exact-match (정규화 후) — '유효성판단근거' 가
 * '유효성' 에 오매칭되지 않도록 부분일치 금지.
 */
export const VOD_HEADER_ALIASES: Record<string, keyof VodCatalogEntry> = {
  강의ID: 'lectureId',
  강의id: 'lectureId',
  폴더경로: 'folderPath',
  시리즈ID: 'seriesId',
  시리즈id: 'seriesId',
  파트번호: 'partNo',
  제목: 'title',
  산업: 'industries',
  언어: 'language',
  전달형식: 'deliveryFormat',
  요약: 'summary',
  인사이트: 'insight',
  유효성: 'validityStatus',
  유효성판단근거: 'validityReason',
  판단근거: 'validityReason',
  청중경험수준: 'audienceExperience',
  경험수준: 'audienceExperience',
  청중사업형태: 'audienceBusinessType',
  사업형태: 'audienceBusinessType',
  비즈니스단계: 'businessStages',
  강의영역대분류: 'lectureAreas',
  강의영역: 'lectureAreas',
  대분류: 'lectureAreas',
  세부태그: 'subTags',
  난이도: 'difficulty',
  콘텐츠유형: 'contentTypes',
  키워드: 'keywords',
}

// ─────────────────────────────────────────────────────────────────
// 셀 정규화 + 행 빌드
// ─────────────────────────────────────────────────────────────────

/** 셀 → trimmed 문자열. '[파악 불가]'(변형 포함)·빈 문자열 → null. */
export function normalizeCell(raw: string): string | null {
  const t = raw.trim()
  if (t.length === 0) return null
  const compact = t.replace(/\s/g, '')
  if (UNKNOWN_MARKERS.some((m) => m.replace(/\s/g, '') === compact)) return null
  return t
}

/** 다중값 분리 — '|' 우선, 콤마도 허용 (v5.4 어휘에 콤마·파이프 미포함). */
export function splitMulti(cell: string | null): string[] {
  if (cell === null) return []
  return cell
    .split(/[|,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => normalizeCell(s))
    .filter((s): s is string => s !== null)
}

/** 행 원시값(필드 키 → 셀 문자열) → 스키마 입력 객체 (zod 검증 전). */
export function buildEntryInput(cells: Partial<Record<keyof VodCatalogEntry, string>>): unknown {
  const c = (k: keyof VodCatalogEntry) => normalizeCell(cells[k] ?? '')
  const partNoRaw = c('partNo')
  const partNo = partNoRaw !== null && /^\d+$/.test(partNoRaw) ? parseInt(partNoRaw, 10) : null

  const input = {
    lectureId: c('lectureId') ?? '',
    folderPath: c('folderPath'),
    seriesId: c('seriesId'),
    partNo,
    title: c('title') ?? '',
    industries: splitMulti(c('industries')),
    language: c('language'),
    deliveryFormat: c('deliveryFormat'),
    summary: c('summary'),
    insight: c('insight'),
    validityStatus: c('validityStatus'),
    validityReason: c('validityReason'),
    audienceExperience: splitMulti(c('audienceExperience')),
    audienceBusinessType: splitMulti(c('audienceBusinessType')),
    businessStages: splitMulti(c('businessStages')),
    lectureAreas: splitMulti(c('lectureAreas')),
    subTags: splitMulti(c('subTags')),
    difficulty: c('difficulty'),
    contentTypes: splitMulti(c('contentTypes')),
    keywords: splitMulti(c('keywords')),
    appliedDefaults: [] as string[],
  }

  // v5.4 전달형식 기본값 — 경험담·인터뷰·대담: 난이도 입문(~초급) / 청중 공통.
  // 명시값이 있으면 건드리지 않는다. 적용 사실은 appliedDefaults 에 기록 (추적 가능).
  if (
    input.deliveryFormat !== null &&
    (VOD_DEFAULTABLE_FORMATS as readonly string[]).includes(input.deliveryFormat)
  ) {
    if (input.difficulty === null) {
      input.difficulty = '입문'
      input.appliedDefaults.push('difficulty=입문(전달형식 기본값)')
    }
    if (input.audienceExperience.length === 0) {
      input.audienceExperience = ['공통']
      input.appliedDefaults.push('audienceExperience=공통(전달형식 기본값)')
    }
    if (input.audienceBusinessType.length === 0) {
      input.audienceBusinessType = ['공통']
      input.appliedDefaults.push('audienceBusinessType=공통(전달형식 기본값)')
    }
  }

  return input
}
