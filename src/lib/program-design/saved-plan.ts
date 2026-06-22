/**
 * BR-WS-4 — 저장된 프로그램 기획 플랜 read 헬퍼 (결함2: 복원)
 *
 * 저장 라우트(`src/app/api/projects/[id]/program-design/route.ts`)의 `savePlan` 과
 * **동일 파일 경로**를 공유한다: `data/program-design/plans/<projectId>.json`.
 *   - 저장 payload shape: { projectId, savedAt, plan: ProgramPlan }
 *   - 이 헬퍼는 그 파일을 읽어 `plan` 을 복원한다. 파일이 없으면 null (정상 — 미저장).
 *
 * ⚠️ 스키마 변경 0 — 저장은 DB 가 아니라 위 파일 경로(브리프 §저장 위치).
 *    `plan-types.ts` 계약은 import 만(읽기). 파싱 실패·구조 깨짐은 null 로 graceful 처리
 *    (워크스페이스는 떠야 함 — load-workspace 가 catch).
 */

import 'server-only'

import { promises as fs } from 'node:fs'
import path from 'node:path'

import type { ProgramPlan, PlanStructure } from './plan-types'

/** 저장 라우트의 savePlan 과 동일 경로 (계약 공유). */
const PLANS_DIR = path.join(process.cwd(), 'data', 'program-design', 'plans')

/** 저장 파일 payload shape (savePlan 이 쓰는 형태). */
interface SavedPlanFile {
  projectId: string
  savedAt: string
  plan: ProgramPlan
}

/** PlanStructure 최소 형태 검증 (계약 깨진 파일 방어 — 추측 채움 금지). */
function isValidStructure(s: unknown): s is PlanStructure {
  if (!s || typeof s !== 'object') return false
  const kind = (s as { kind?: unknown }).kind
  return (
    kind === 'sessions' ||
    kind === 'individual' ||
    kind === 'event' ||
    kind === 'pending'
  )
}

/** ProgramPlan 최소 형태 검증 (decisionLog/openGates/structure/meta 존재). */
function isValidPlan(p: unknown): p is ProgramPlan {
  if (!p || typeof p !== 'object') return false
  const plan = p as Partial<ProgramPlan>
  return (
    Array.isArray(plan.decisionLog) &&
    Array.isArray(plan.openGates) &&
    isValidStructure(plan.structure) &&
    !!plan.meta &&
    typeof plan.meta === 'object'
  )
}

/**
 * 저장된 플랜 1건 읽기 — 파일 없거나(미저장) 깨졌으면 null.
 *
 * @param projectId 프로젝트 id (파일명).
 * @returns 복원된 ProgramPlan 또는 null.
 */
export async function readSavedPlan(
  projectId: string,
): Promise<ProgramPlan | null> {
  const target = path.join(PLANS_DIR, `${projectId}.json`)
  let raw: string
  try {
    raw = await fs.readFile(target, 'utf8')
  } catch {
    // ENOENT(미저장) 등 — 정상. 복원할 게 없음.
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SavedPlanFile>
    if (parsed && isValidPlan(parsed.plan)) {
      return parsed.plan
    }
    return null
  } catch {
    // 파일 손상 — graceful (워크스페이스는 떠야 함).
    return null
  }
}
