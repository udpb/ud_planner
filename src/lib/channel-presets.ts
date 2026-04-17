/**
 * ChannelPreset DB 조회 헬퍼
 *
 * DB 가 1차 소스 (ADR-005 §정보 흐름 규칙 3).
 * planning-direction.ts 의 CHANNEL_TONE_PROMPT 는 DB 실패 시 fallback.
 */

import { prisma } from '@/lib/prisma'
import type { ChannelPreset } from '@prisma/client'

// ─── DTO ────────────────────────────────────────────────────────
// DB 의 Json 필드를 string[] 로 보장한 안전 타입

export interface ChannelPresetDto {
  id: string
  code: string
  displayName: string
  description: string

  keyMessages: string[]
  avoidMessages: string[]
  tone: string
  evaluatorProfile: string

  theoryMaxRatio: number | null
  actionWeekMinCount: number | null

  budgetTone: string
  directCostMinRatio: number | null

  proposalStructure: string

  createdAt: Date
  updatedAt: Date
  source: string
}

// ─── 변환 ───────────────────────────────────────────────────────

function toDto(row: ChannelPreset): ChannelPresetDto {
  return {
    id: row.id,
    code: row.code,
    displayName: row.displayName,
    description: row.description,
    keyMessages: parseJsonStringArray(row.keyMessages),
    avoidMessages: parseJsonStringArray(row.avoidMessages),
    tone: row.tone,
    evaluatorProfile: row.evaluatorProfile,
    theoryMaxRatio: row.theoryMaxRatio,
    actionWeekMinCount: row.actionWeekMinCount,
    budgetTone: row.budgetTone,
    directCostMinRatio: row.directCostMinRatio,
    proposalStructure: row.proposalStructure,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    source: row.source,
  }
}

/** Prisma Json → string[] 안전 변환 */
function parseJsonStringArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.filter((v): v is string => typeof v === 'string')
  if (typeof val === 'string') {
    try {
      const parsed: unknown = JSON.parse(val)
      if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === 'string')
    } catch {
      // JSON 파싱 실패 시 빈 배열
    }
  }
  return []
}

// ─── 공개 API ───────────────────────────────────────────────────

/**
 * 특정 채널 코드로 ChannelPreset 조회.
 * @param code "B2G" | "B2B" | "renewal"
 * @returns DTO 또는 null (코드가 없거나 DB 오류)
 */
export async function getChannelPreset(code: string): Promise<ChannelPresetDto | null> {
  const row = await prisma.channelPreset.findUnique({ where: { code } })
  return row ? toDto(row) : null
}

/**
 * 모든 ChannelPreset 목록 반환.
 * @returns DTO 배열 (code 오름차순)
 */
export async function listChannelPresets(): Promise<ChannelPresetDto[]> {
  const rows = await prisma.channelPreset.findMany({ orderBy: { code: 'asc' } })
  return rows.map(toDto)
}
