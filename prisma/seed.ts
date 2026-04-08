import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import costStandards from './seed-data/cost-standards.json'
import sroiProxies from './seed-data/sroi-proxies.json'
import targetPresets from './seed-data/target-presets.json'
import modules from './seed-data/modules.json'
import internalLaborRates from './seed-data/internal-labor-rates.json'
import serviceProducts from './seed-data/service-products.json'
import impactModules from './seed-data/impact-modules.json'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🌱 시드 데이터 시작...')

  // ── 1. 비용 기준 (76개 항목: PC 외부인건비 + CF 코치파인더 + AC 직접비) ──
  console.log('  ▸ 비용 기준 (CostStandard)')
  for (const item of costStandards as any[]) {
    await prisma.costStandard.upsert({
      where: { wbsCode: item.wbsCode },
      update: { ...item, updatedAt: new Date() },
      create: { ...item, updatedAt: new Date() },
    })
  }
  console.log(`    ${costStandards.length}개 완료`)

  // ── 2. SROI 프록시 (16종 × 4개국 = 46개) ──
  console.log('  ▸ SROI 프록시 (SroiProxy)')
  for (const item of sroiProxies as any[]) {
    await prisma.sroiProxy.upsert({
      where: {
        country_impactType_subType: {
          country: item.country,
          impactType: item.impactType,
          subType: item.subType,
        },
      },
      update: { ...item, updatedAt: new Date() },
      create: { ...item, updatedAt: new Date() },
    })
  }
  console.log(`    ${sroiProxies.length}개 완료`)

  // ── 3. 대상자 프리셋 ──
  console.log('  ▸ 대상자 프리셋 (TargetPreset)')
  for (const item of targetPresets as any[]) {
    await prisma.targetPreset.upsert({
      where: { name: item.name },
      update: item,
      create: item,
    })
  }
  console.log(`    ${targetPresets.length}개 완료`)

  // ── 4. 교육 모듈 ──
  console.log('  ▸ 교육 모듈 (Module)')
  for (const item of modules as any[]) {
    await prisma.module.upsert({
      where: { moduleCode: item.moduleCode },
      update: item,
      create: item,
    })
  }
  console.log(`    ${modules.length}개 완료`)

  // ── 5. 내부 인건비 단가 (B2G + B2B + INTERNAL = 16개) ──
  console.log('  ▸ 내부 인건비 단가 (InternalLaborRate)')
  for (const item of internalLaborRates as any[]) {
    await prisma.internalLaborRate.upsert({
      where: { gradeCode: item.gradeCode },
      update: item,
      create: item,
    })
  }
  console.log(`    ${internalLaborRates.length}개 완료`)

  // ── 6. 서비스 상품 (DOGS + VOD + BeyondEdu + SV Impact = 14개) ──
  console.log('  ▸ 서비스 상품 (ServiceProduct)')
  for (const item of serviceProducts as any[]) {
    await prisma.serviceProduct.upsert({
      where: { code: item.code },
      update: item,
      create: item,
    })
  }
  console.log(`    ${serviceProducts.length}개 완료`)

  // ── 7. IMPACT 18모듈 (실제 PPTX 기반) ──
  console.log('  ▸ IMPACT 모듈 (ImpactModule)')
  for (const item of impactModules as any[]) {
    await prisma.impactModule.upsert({
      where: { moduleCode: item.moduleCode },
      update: {
        stage: item.stage,
        stageOrder: item.stageOrder,
        moduleOrder: item.moduleOrder,
        moduleName: item.moduleName,
        coreQuestion: item.coreQuestion,
        workshopOutputs: item.workshopOutputs,
        durationMinutes: item.durationMinutes,
        sixRolesTarget: item.sixRolesTarget,
      },
      create: {
        stage: item.stage,
        stageOrder: item.stageOrder,
        moduleOrder: item.moduleOrder,
        moduleCode: item.moduleCode,
        moduleName: item.moduleName,
        coreQuestion: item.coreQuestion,
        workshopOutputs: item.workshopOutputs,
        durationMinutes: item.durationMinutes,
        sixRolesTarget: item.sixRolesTarget,
      },
    })
  }
  console.log(`    ${impactModules.length}개 완료`)

  // ── 8. 관리자 계정 (개발용) ──
  console.log('  ▸ 관리자 계정')
  await prisma.user.upsert({
    where: { email: 'admin@underdogs.co.kr' },
    update: {},
    create: {
      email: 'admin@underdogs.co.kr',
      name: '관리자',
      role: 'ADMIN',
    },
  })
  console.log('    완료')

  console.log('\n✅ 시드 완료!')
  console.log(`   CostStandard: ${costStandards.length}개`)
  console.log(`   SroiProxy: ${sroiProxies.length}개`)
  console.log(`   TargetPreset: ${targetPresets.length}개`)
  console.log(`   Module: ${modules.length}개`)
  console.log(`   InternalLaborRate: ${internalLaborRates.length}개`)
  console.log(`   ServiceProduct: ${serviceProducts.length}개`)
  console.log(`   ImpactModule: ${impactModules.length}개`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
