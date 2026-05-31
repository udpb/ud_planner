// [WORKSTREAM] 하위호환 어댑터 (ADR-019, Tech Spec §7.4)
//
// 과업 레이어 도입 전 프로젝트는 모두 "교육 1종" 모양이었다. 이 어댑터는 과업이
// 0개인 기존 프로젝트에 'education' 과업 1개를 자동 생성해 하위호환을 보장한다.
//
// 순수 추가 로직 — 기존 데이터는 절대 변경하지 않는다 (읽기 + Workstream 생성만).
// 이미 과업이 1개라도 있으면 no-op (멱등).

import { prisma } from '@/lib/prisma'
import { WORKSTREAM_SCORING } from './types'

/**
 * 해당 Project 에 Workstream 이 0개면 'education' 과업 1개를 생성한다.
 * 이미 있으면 아무것도 하지 않는다 (멱등).
 *
 * - order: 0 (첫 블록)
 * - type: 'education'
 * - scoringCategory: WORKSTREAM_SCORING.education ('수행역량')
 * - detail: {} (구조화 필드는 후속 자동채움 G4 에서)
 * - autoFillRatio: 0
 *
 * CurriculumItem 등 기존 산출물이 있으면 본격적인 detail 채움은 후속 단계가
 * 담당하고, 여기서는 그릇(빈 education 과업)만 만든다.
 */
export async function ensureDefaultWorkstream(projectId: string): Promise<void> {
  const existing = await prisma.workstream.count({ where: { projectId } })
  if (existing > 0) return

  await prisma.workstream.create({
    data: {
      projectId,
      type: 'education',
      scoringCategory: WORKSTREAM_SCORING.education,
      order: 0,
      detail: {},
      autoFillRatio: 0,
    },
  })
}
