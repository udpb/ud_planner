/**
 * 시스템 헬스체크 (Phase 3.4, 2026-05-03)
 *
 * Playwright E2E 대신 — 빠르게 실행 가능한 운영 진단 스크립트.
 * deps 추가 없이 환경변수 + DB + AI provider + 핵심 시드 데이터 확인.
 *
 * 실행:
 *   npm run health-check
 *   (또는) npx tsx scripts/health-check.ts
 *
 * 종료 코드:
 *   0 — 모든 체크 통과
 *   1 — critical 실패 (DB 연결, 환경변수 missing 등)
 *   2 — warning (시드 부족, 외부 자산 누락 등 — 운영은 가능하나 품질 영향)
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

interface CheckResult {
  name: string
  status: 'pass' | 'warn' | 'fail'
  message: string
  detail?: Record<string, unknown>
}

const results: CheckResult[] = []

function pass(name: string, message: string, detail?: Record<string, unknown>) {
  results.push({ name, status: 'pass', message, detail })
}

function warn(name: string, message: string, detail?: Record<string, unknown>) {
  results.push({ name, status: 'warn', message, detail })
}

function fail(name: string, message: string, detail?: Record<string, unknown>) {
  results.push({ name, status: 'fail', message, detail })
}

// ─────────────────────────────────────────
// 1. 환경변수 체크
// ─────────────────────────────────────────

function checkEnvVars() {
  const required = ['DATABASE_URL', 'NEXTAUTH_SECRET']
  const aiKeys = ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY']
  const optional = ['AUTH_GOOGLE_ID', 'AUTH_GOOGLE_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE']

  for (const key of required) {
    if (!process.env[key]) {
      fail('env-required', `필수 환경변수 누락: ${key}`)
    } else {
      pass('env-required', `${key} ✓`)
    }
  }

  // AI: 최소 1개 있어야 운영 가능
  const presentAi = aiKeys.filter((k) => !!process.env[k])
  if (presentAi.length === 0) {
    fail('env-ai', 'AI provider 키 0개 — invokeAi 호출 불가', {
      checked: aiKeys,
    })
  } else {
    pass('env-ai', `AI provider ${presentAi.length}개 활성`, { providers: presentAi })
  }

  for (const key of optional) {
    if (process.env[key]) {
      pass('env-optional', `${key} 활성`)
    } else {
      warn('env-optional', `${key} 미설정 (선택)`)
    }
  }
}

// ─────────────────────────────────────────
// 2. DB 연결 + 핵심 테이블 카운트
// ─────────────────────────────────────────

async function checkDatabase() {
  if (!process.env.DATABASE_URL) {
    fail('db-connect', 'DATABASE_URL 없음 — DB 체크 skip')
    return
  }

  try {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
    const prisma = new PrismaClient({ adapter })

    // 연결 테스트
    await prisma.$queryRaw`SELECT 1`
    pass('db-connect', 'DB 연결 OK')

    // 핵심 테이블 카운트
    const [
      userCount,
      coachCount,
      projectCount,
      assetCount,
      moduleCount,
      winningPatternCount,
      channelPresetCount,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.coach.count({ where: { isActive: true } }),
      prisma.project.count(),
      prisma.contentAsset.count(),
      prisma.module.count(),
      prisma.winningPattern.count(),
      prisma.channelPreset.count(),
    ])

    pass('db-tables', '핵심 테이블 접근 OK', {
      User: userCount,
      ActiveCoach: coachCount,
      Project: projectCount,
      ContentAsset: assetCount,
      Module: moduleCount,
      WinningPattern: winningPatternCount,
      ChannelPreset: channelPresetCount,
    })

    // 시드 데이터 검증 (warn 수준)
    if (coachCount === 0) {
      warn('seed-coach', 'Coach DB 비어있음 — Step 3·4 무력화 / npm run sync:coaches 필요')
    } else if (coachCount < 100) {
      warn('seed-coach', `활성 Coach ${coachCount}명만 — 800명 풀 동기화 권장`)
    } else {
      pass('seed-coach', `활성 Coach ${coachCount}명 OK`)
    }

    if (assetCount === 0) {
      warn('seed-asset', 'ContentAsset 비어있음 — npm run db:seed:content-assets 필요')
    } else if (assetCount < 15) {
      warn('seed-asset', `ContentAsset ${assetCount}건만 — 자산 풀 확장 권장`)
    } else {
      pass('seed-asset', `ContentAsset ${assetCount}건 OK`)
    }

    if (moduleCount === 0) {
      warn('seed-module', 'IMPACT 18 모듈 미시드 — npm run db:seed 필요')
    } else {
      pass('seed-module', `IMPACT Module ${moduleCount}건 OK`)
    }

    if (winningPatternCount === 0) {
      warn(
        'seed-winning-pattern',
        'WinningPattern 비어있음 — npm run db:seed:winning-patterns-sections 권장',
      )
    } else if (winningPatternCount < 50) {
      warn(
        'seed-winning-pattern',
        `WinningPattern ${winningPatternCount}건 — 섹션 시드 추가 (50+ 권장)`,
      )
    } else {
      pass('seed-winning-pattern', `WinningPattern ${winningPatternCount}건 OK`)
    }

    if (channelPresetCount === 0) {
      warn('seed-channel-preset', 'ChannelPreset 미시드 — npm run db:seed:channel-presets 권장')
    } else {
      pass('seed-channel-preset', `ChannelPreset ${channelPresetCount}건 OK`)
    }

    await prisma.$disconnect()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    fail('db-connect', `DB 연결 실패: ${msg.slice(0, 200)}`)
  }
}

// ─────────────────────────────────────────
// 3. Module Manifest 무결성 (간이 체크)
// ─────────────────────────────────────────

async function checkManifests() {
  try {
    const mod = (await import('../src/modules/_registry')) as {
      MODULE_REGISTRY?: ReadonlyArray<{ name: string; layer: string; version: string }>
    }
    const registry = mod.MODULE_REGISTRY
    if (!Array.isArray(registry)) {
      warn('manifest-load', 'MODULE_REGISTRY 로드 실패 — 형식 불일치')
      return
    }
    if (registry.length === 0) {
      warn('manifest-load', 'MODULE_REGISTRY 비어있음')
    } else {
      pass('manifest-load', `Module Manifest ${registry.length}건 등록 OK`, {
        count: registry.length,
        byLayer: registry.reduce<Record<string, number>>((acc, m) => {
          acc[m.layer] = (acc[m.layer] ?? 0) + 1
          return acc
        }, {}),
      })
    }
  } catch (err: unknown) {
    warn('manifest-load', `_registry import 실패: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// ─────────────────────────────────────────
// 메인
// ─────────────────────────────────────────

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🔧 UD-Ops 헬스체크')
  console.log(`   ${new Date().toISOString()}`)
  console.log(`   NODE_ENV=${process.env.NODE_ENV ?? 'undefined'}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  checkEnvVars()
  await checkDatabase()
  await checkManifests()

  // 결과 출력
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📋 결과 요약')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const passed = results.filter((r) => r.status === 'pass')
  const warnings = results.filter((r) => r.status === 'warn')
  const failures = results.filter((r) => r.status === 'fail')

  for (const r of results) {
    const icon = r.status === 'pass' ? '✅' : r.status === 'warn' ? '🟡' : '🔴'
    console.log(`${icon} [${r.name}] ${r.message}`)
    if (r.detail && Object.keys(r.detail).length > 0) {
      for (const [k, v] of Object.entries(r.detail)) {
        console.log(`     └─ ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
      }
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`✅ Pass:    ${passed.length}`)
  console.log(`🟡 Warning: ${warnings.length}`)
  console.log(`🔴 Fail:    ${failures.length}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  if (failures.length > 0) {
    process.exit(1)
  } else if (warnings.length > 0) {
    process.exit(2)
  } else {
    process.exit(0)
  }
}

main().catch((err) => {
  console.error('❌ 헬스체크 실행 실패:', err)
  process.exit(1)
})
