/**
 * Module Registry — 모든 manifest 의 단일 진입점 (Phase I, ADR-002)
 *
 * 6 step manifest + 4 support module manifest 를 한 곳에 모아 export.
 * 빌드 타임 검증 (scripts/check-manifests.cjs) 와 런타임 조회용.
 *
 * 새 모듈 추가 시 여기 import 1줄 추가하면 검증·문서·UI 에 자동 반영.
 */

import type { ModuleManifest } from './_types'

// ─────────────────────────────────────────
// Core (6 step) — Deep Track 파이프라인
// ─────────────────────────────────────────

import { manifest as stepRfp } from '@/app/(dashboard)/projects/[id]/step-rfp.manifest'
import { manifest as stepCurriculum } from '@/app/(dashboard)/projects/[id]/step-curriculum.manifest'
import { manifest as stepCoaches } from '@/app/(dashboard)/projects/[id]/step-coaches.manifest'
import { manifest as stepBudget } from '@/app/(dashboard)/projects/[id]/step-budget.manifest'
import { manifest as stepImpact } from '@/app/(dashboard)/projects/[id]/step-impact.manifest'
import { manifest as stepProposal } from '@/app/(dashboard)/projects/[id]/step-proposal.manifest'

// ─────────────────────────────────────────
// Support / Asset modules
// ─────────────────────────────────────────

import { manifest as pmGuide } from './pm-guide/manifest'
import { manifest as predictedScore } from './predicted-score/manifest'
import { manifest as gate3Validation } from './gate3-validation/manifest'
import { manifest as assetRegistry } from './asset-registry/manifest'

// ─────────────────────────────────────────
// 전체 레지스트리
// ─────────────────────────────────────────

export const MODULE_REGISTRY: readonly ModuleManifest[] = Object.freeze([
  // core (6)
  stepRfp,
  stepCurriculum,
  stepCoaches,
  stepBudget,
  stepImpact,
  stepProposal,
  // support / asset (4)
  pmGuide,
  predictedScore,
  gate3Validation,
  assetRegistry,
])

// ─────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────

export function findModule(name: string): ModuleManifest | undefined {
  return MODULE_REGISTRY.find((m) => m.name === name)
}

export function modulesByLayer(layer: ModuleManifest['layer']): ModuleManifest[] {
  return MODULE_REGISTRY.filter((m) => m.layer === layer)
}

/**
 * 어떤 모듈이 특정 PipelineContext slice 를 읽거나 쓰는지 조회.
 */
export function modulesUsingSlice(
  slice: string,
  mode: 'reads' | 'writes',
): ModuleManifest[] {
  return MODULE_REGISTRY.filter((m) => {
    const ctx = mode === 'reads' ? m.reads.context : m.writes.context
    return Array.isArray(ctx) && ctx.includes(slice as never)
  })
}

/**
 * 어떤 모듈이 특정 asset 을 읽는지 조회.
 */
export function modulesUsingAsset(assetName: string): ModuleManifest[] {
  return MODULE_REGISTRY.filter((m) => m.reads.assets?.includes(assetName) ?? false)
}
