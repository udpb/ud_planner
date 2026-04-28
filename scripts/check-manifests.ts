/**
 * Module Manifest 무결성 검증 (Phase I, ADR-002)
 *
 * 실행: npm run check:manifest  (또는 npx tsx scripts/check-manifests.ts)
 * 자동: predev / prebuild 훅에서 호출 권장.
 *
 * 검사 항목:
 *   1. 모듈 이름 중복 (errors)
 *   2. PipelineContext slice writes 충돌 — 한 slice 를 여러 모듈이 동시에 쓰면 경고
 *   3. reads.assets 에 명시된 asset 모듈이 실제 등록되었는지 (또는 알려진 외부 asset 인지)
 *   4. layer 값 유효성 (core / asset / ingestion / support)
 *   5. version semver 형식 단순 검사
 *
 * 출력: 사람이 읽기 쉬운 표 + errors 발견 시 process.exit(1)
 */

import { MODULE_REGISTRY } from '../src/modules/_registry'
import type { ModuleManifest, PipelineContextSlice } from '../src/modules/_types'

// 알려진 asset 모듈 이름들 (외부에서 시드됨 — manifest 에 없는 것도 허용)
// 주의: Phase G·H 의 자산 카탈로그에서 사용되는 이름. 새 자산 추가 시 여기도 갱신.
const KNOWN_ASSET_NAMES = new Set<string>([
  // Phase G UD Asset Registry / Phase H Content Hub
  'asset-registry',
  // 자산 카테고리 (asset-registry-types.ts AssetCategory 와 일치)
  'methodology',
  'content',
  'product',
  'human',
  'data',
  'framework',
  // 마스터 데이터 (DB 시드)
  'channel-presets',
  'winning-patterns',
  'past-projects',
  'cost-standards',
  'sroi-proxies',
  'target-presets',
  // 6 step manifest 에서 참조하는 도메인 자산 (Phase A~F 시드)
  'impact-modules', // IMPACT 18 모듈 + CORE 4 (prisma.module / impactModule)
  'coach-pool', // Coach DB 활성 풀
  'sroi-proxy', // SroiProxy 16종 × 4국 단수형 alias
  'ud-brand', // src/lib/ud-brand.ts 브랜드 보이스 자산
])

// ─────────────────────────────────────────
// 검사 함수들
// ─────────────────────────────────────────

interface CheckResult {
  errors: string[]
  warnings: string[]
}

function checkDuplicateNames(modules: readonly ModuleManifest[]): CheckResult {
  const errors: string[] = []
  const seen = new Map<string, number>()
  for (const m of modules) {
    seen.set(m.name, (seen.get(m.name) ?? 0) + 1)
  }
  for (const [name, count] of seen) {
    if (count > 1) errors.push(`모듈 이름 중복: "${name}" — ${count}회`)
  }
  return { errors, warnings: [] }
}

function checkWritesConflicts(modules: readonly ModuleManifest[]): CheckResult {
  const writers = new Map<PipelineContextSlice, string[]>()
  for (const m of modules) {
    const writes = m.writes.context ?? []
    for (const slice of writes) {
      const arr = writers.get(slice) ?? []
      arr.push(m.name)
      writers.set(slice, arr)
    }
  }
  const warnings: string[] = []
  for (const [slice, names] of writers) {
    if (names.length > 1) {
      warnings.push(
        `slice "${slice}" 를 ${names.length} 모듈이 write: ${names.join(', ')} (의도된 협업이면 무시)`,
      )
    }
  }
  return { errors: [], warnings }
}

function checkAssetReferences(modules: readonly ModuleManifest[]): CheckResult {
  const errors: string[] = []
  const moduleNames = new Set(modules.map((m) => m.name))
  for (const m of modules) {
    const reads = m.reads.assets ?? []
    for (const a of reads) {
      if (!moduleNames.has(a) && !KNOWN_ASSET_NAMES.has(a)) {
        errors.push(`모듈 "${m.name}" 이 알려지지 않은 asset 참조: "${a}"`)
      }
    }
  }
  return { errors, warnings: [] }
}

function checkLayerValidity(modules: readonly ModuleManifest[]): CheckResult {
  const errors: string[] = []
  const validLayers = new Set(['core', 'asset', 'ingestion', 'support'])
  for (const m of modules) {
    if (!validLayers.has(m.layer)) {
      errors.push(`모듈 "${m.name}" 의 layer 값 비정상: "${m.layer}"`)
    }
  }
  return { errors, warnings: [] }
}

function checkVersionFormat(modules: readonly ModuleManifest[]): CheckResult {
  const warnings: string[] = []
  const semverLike = /^\d+\.\d+\.\d+(-[\w.]+)?$/
  for (const m of modules) {
    if (!semverLike.test(m.version)) {
      warnings.push(`모듈 "${m.name}" 의 version 형식이 semver 아님: "${m.version}"`)
    }
  }
  return { errors: [], warnings }
}

function checkOwnerNotTbd(modules: readonly ModuleManifest[]): CheckResult {
  const warnings: string[] = []
  for (const m of modules) {
    if (m.owner === 'TBD' || m.owner === '미정') {
      warnings.push(`모듈 "${m.name}" owner 미지정 (TBD)`)
    }
  }
  return { errors: [], warnings }
}

// ─────────────────────────────────────────
// 메인
// ─────────────────────────────────────────

function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`📋 Module Manifest 무결성 검증 (총 ${MODULE_REGISTRY.length} 모듈)`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // 모듈 목록 표
  const byLayer = new Map<string, ModuleManifest[]>()
  for (const m of MODULE_REGISTRY) {
    const arr = byLayer.get(m.layer) ?? []
    arr.push(m)
    byLayer.set(m.layer, arr)
  }
  for (const layer of ['core', 'support', 'asset', 'ingestion']) {
    const arr = byLayer.get(layer)
    if (!arr || arr.length === 0) continue
    console.log(`\n[${layer}] ${arr.length} 모듈`)
    for (const m of arr) {
      const reads = (m.reads.context ?? []).join(',') || '-'
      const writes = (m.writes.context ?? []).join(',') || '-'
      console.log(
        `  · ${m.name.padEnd(18)} v${m.version.padEnd(8)} reads=[${reads}] writes=[${writes}]`,
      )
    }
  }

  // 검사 실행
  const allErrors: string[] = []
  const allWarnings: string[] = []
  for (const check of [
    checkDuplicateNames,
    checkLayerValidity,
    checkAssetReferences,
    checkWritesConflicts,
    checkVersionFormat,
    checkOwnerNotTbd,
  ]) {
    const r = check(MODULE_REGISTRY)
    allErrors.push(...r.errors)
    allWarnings.push(...r.warnings)
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  if (allErrors.length === 0) {
    console.log(`✅ Errors: 0`)
  } else {
    console.log(`❌ Errors: ${allErrors.length}`)
    for (const e of allErrors) console.log(`   - ${e}`)
  }
  if (allWarnings.length > 0) {
    console.log(`⚠️  Warnings: ${allWarnings.length}`)
    for (const w of allWarnings) console.log(`   - ${w}`)
  } else {
    console.log(`✓ Warnings: 0`)
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  process.exit(allErrors.length === 0 ? 0 : 1)
}

main()
