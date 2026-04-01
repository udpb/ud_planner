/**
 * Excel → DB 범용 임포트 스크립트
 *
 * 사용법:
 *   npx tsx scripts/import-excel.ts <타입> <파일경로> [옵션]
 *
 * 타입 목록:
 *   coaches        코치 목록 (Coach 테이블)
 *   cost-standards 비용 기준 단가표 (CostStandard 테이블)
 *   modules        교육 모듈 (Module 테이블)
 *   contents       콘텐츠 라이브러리 (Content 테이블)
 *   sroi-proxies   SROI 프록시 계수 (SroiProxy 테이블)
 *
 * 옵션:
 *   --sheet=<이름>   시트 이름 (기본: 첫 번째 시트)
 *   --header=<n>     헤더 행 번호 (기본: 1)
 *   --preview        DB에 저장하지 않고 미리보기만 출력
 *   --dry-run        실제 저장 없이 파싱 결과만 확인
 *
 * 예시:
 *   npx tsx scripts/import-excel.ts coaches C:/Users/USER/Downloads/coaches.xlsx
 *   npx tsx scripts/import-excel.ts coaches C:/Users/USER/Downloads/coaches.xlsx --preview
 *   npx tsx scripts/import-excel.ts cost-standards C:/Users/USER/Downloads/단가표.xlsx --sheet=단가기준
 */

import path from 'path'
import { readExcel, previewExcel } from '../src/lib/excel'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// ── 인수 파싱 ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const importType = args[0]
const filePath = args[1] ? path.resolve(args[1]) : ''
const sheetArg = args.find((a) => a.startsWith('--sheet='))?.split('=')[1]
const headerArg = args.find((a) => a.startsWith('--header='))?.split('=')[1]
const isPreview = args.includes('--preview')
const isDryRun = args.includes('--dry-run')

const TYPES = ['coaches', 'cost-standards', 'modules', 'contents', 'sroi-proxies']

if (!importType || !TYPES.includes(importType) || !filePath) {
  console.log(`
사용법: npx tsx scripts/import-excel.ts <타입> <파일경로> [옵션]

지원 타입: ${TYPES.join(', ')}
옵션: --sheet=<시트명> --header=<행번호> --preview --dry-run
  `)
  process.exit(1)
}

// ── 미리보기 모드 ─────────────────────────────────────────────────────────────
async function runPreview() {
  console.log(`\n📋 파일 미리보기: ${filePath}\n`)
  const { sheets, headers, sampleRows } = await previewExcel(filePath)
  console.log(`시트 목록: ${sheets.join(', ')}`)
  for (const sheet of sheets) {
    console.log(`\n[${sheet}] 헤더: ${headers[sheet].join(' | ')}`)
    console.log('샘플 데이터:')
    sampleRows[sheet].forEach((row, i) => {
      console.log(`  행 ${i + 2}:`, JSON.stringify(row, null, 0))
    })
  }
}

// ── str 헬퍼 ─────────────────────────────────────────────────────────────────
const str = (v: any) => (v === null || v === undefined ? null : String(v).trim() || null)
const num = (v: any) => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}
const int = (v: any) => { const n = num(v); return n !== null ? Math.round(n) : null }
const bool = (v: any) => {
  if (v === null || v === undefined || v === '') return false
  if (typeof v === 'boolean') return v
  return ['y', 'yes', 'true', '1', 'o', '가능', '예'].includes(String(v).toLowerCase().trim())
}
const arr = (v: any): string[] => {
  if (!v) return []
  return String(v).split(/[,，\n]/).map((s) => s.trim()).filter(Boolean)
}

// ── 임포터들 ──────────────────────────────────────────────────────────────────

// 코치 임포트
// 엑셀 컬럼명(유연하게 매핑): 이름/name, 이메일/email, 전화/phone, ...
async function importCoaches(rows: Record<string, any>[]) {
  console.log(`\n총 ${rows.length}행 코치 데이터 임포트 시작...\n`)

  // 컬럼 자동 감지 (한글/영문 혼용 대응)
  const detect = (row: Record<string, any>, ...candidates: string[]) => {
    for (const c of candidates) {
      const key = Object.keys(row).find(
        (k) => k.toLowerCase().replace(/[\s_\-]/g, '') === c.toLowerCase().replace(/[\s_\-]/g, '')
      )
      if (key && row[key] !== null && row[key] !== '') return row[key]
    }
    return null
  }

  let created = 0, updated = 0, skipped = 0

  for (const row of rows) {
    const name = str(detect(row, '이름', 'name', '성명'))
    if (!name) { skipped++; continue }

    const tierRaw = str(detect(row, '티어', 'tier', '등급'))
    const tier = tierRaw === '1' || tierRaw === 'TIER1' || tierRaw?.includes('베테랑') ? 'TIER1'
      : tierRaw === '3' || tierRaw === 'TIER3' || tierRaw?.includes('외부') ? 'TIER3'
      : 'TIER2'

    const categoryRaw = str(detect(row, '카테고리', 'category', '구분'))
    const category =
      categoryRaw?.includes('파트너') ? 'PARTNER_COACH'
      : categoryRaw?.includes('글로벌') ? 'GLOBAL_COACH'
      : categoryRaw?.includes('컨설') ? 'CONSULTANT'
      : categoryRaw?.includes('투자') ? 'INVESTOR'
      : 'COACH'

    const data = {
      name,
      email: str(detect(row, '이메일', 'email', 'e-mail')),
      phone: str(detect(row, '전화', 'phone', '연락처', '휴대폰')),
      gender: str(detect(row, '성별', 'gender')),
      location: str(detect(row, '지역', 'location', '거주지')),
      organization: str(detect(row, '소속', 'organization', '회사', '기관')),
      position: str(detect(row, '직책', 'position', '직위', '직함')),
      intro: str(detect(row, '소개', 'intro', '한줄소개')),
      careerHistory: str(detect(row, '경력', 'career', 'careerHistory', '경력사항')),
      education: str(detect(row, '학력', 'education')),
      expertise: arr(detect(row, '전문분야', 'expertise', '전문영역') ?? ''),
      industries: arr(detect(row, '산업', 'industries', '업종') ?? ''),
      regions: arr(detect(row, '활동지역', 'regions', '지역') ?? ''),
      careerYears: int(detect(row, '경력년수', 'careerYears', '경력년', '연차')),
      tier: tier as any,
      category: category as any,
      overseas: bool(detect(row, '해외가능', 'overseas', '해외')),
      lectureRateMain: int(detect(row, '강의료메인', 'lectureRateMain', '강의단가')),
      coachRateMain: int(detect(row, '코칭료메인', 'coachRateMain', '코칭단가')),
      isActive: true,
    }

    try {
      // email이 있으면 email로 upsert, 없으면 name으로 중복 체크
      const existing = data.email
        ? await prisma.coach.findFirst({ where: { email: data.email } })
        : await prisma.coach.findFirst({ where: { name } })

      if (isDryRun) {
        console.log(`[DRY] ${existing ? '업데이트' : '생성'}: ${name} (${data.email ?? '이메일없음'})`)
      } else if (existing) {
        await prisma.coach.update({ where: { id: existing.id }, data })
        updated++
      } else {
        await prisma.coach.create({ data })
        created++
      }
    } catch (e: any) {
      console.error(`  ❌ ${name}: ${e.message}`)
      skipped++
    }
  }

  console.log(`\n✅ 완료 — 생성: ${created}, 업데이트: ${updated}, 건너뜀: ${skipped}`)
}

// 비용 기준 단가 임포트
async function importCostStandards(rows: Record<string, any>[]) {
  console.log(`\n총 ${rows.length}행 비용 단가 임포트 시작...\n`)
  let upserted = 0

  for (const row of rows) {
    const wbsCode = str(row['WBS코드'] ?? row['wbsCode'] ?? row['코드'])
    const name = str(row['항목명'] ?? row['name'] ?? row['항목'])
    if (!wbsCode || !name) continue

    const typeRaw = str(row['유형'] ?? row['type'] ?? 'AC')
    const type = typeRaw?.toUpperCase() === 'PC' ? 'PC' : 'AC'

    try {
      await prisma.costStandard.upsert({
        where: { wbsCode },
        create: {
          wbsCode,
          type: type as any,
          category: str(row['카테고리'] ?? row['category']) ?? '기타',
          name,
          unit: str(row['단위'] ?? row['unit']) ?? '건',
          unitPrice: int(row['단가'] ?? row['unitPrice']) ?? 0,
          notes: str(row['비고'] ?? row['notes']),
        },
        update: {
          category: str(row['카테고리'] ?? row['category']) ?? '기타',
          name,
          unit: str(row['단위'] ?? row['unit']) ?? '건',
          unitPrice: int(row['단가'] ?? row['unitPrice']) ?? 0,
          notes: str(row['비고'] ?? row['notes']),
        },
      })
      upserted++
      if (isDryRun) console.log(`[DRY] upsert: ${wbsCode} ${name}`)
    } catch (e: any) {
      console.error(`  ❌ ${wbsCode}: ${e.message}`)
    }
  }

  console.log(`\n✅ 완료 — upsert: ${upserted}건`)
}

// 콘텐츠 라이브러리 임포트 (IMPACT 방법론 300+ 콘텐츠)
async function importContents(rows: Record<string, any>[]) {
  console.log(`\n총 ${rows.length}행 콘텐츠 임포트 시작...\n`)
  let created = 0, updated = 0, skipped = 0

  for (const row of rows) {
    const legacyCode = int(row['code'] ?? row['코드'] ?? row['번호'])
    const name = str(row['콘텐츠명'] ?? row['name'] ?? row['모듈명'])
    if (!legacyCode || !name) { skipped++; continue }

    const data = {
      legacyCode,
      name,
      format: str(row['형태'] ?? row['format'] ?? row['운영형태']) ?? '현장강의',
      category: str(row['카테고리'] ?? row['category']) ?? '창업교육',
      targetAudience: arr(row['대상'] ?? row['targetAudience'] ?? ''),
      businessField: arr(row['분야'] ?? row['businessField'] ?? ''),
      startupStage: arr(row['창업단계'] ?? row['startupStage'] ?? ''),
      deliveryMethod: str(row['운영방식'] ?? row['deliveryMethod']),
      sixRolesTarget: arr(row['6Roles'] ?? row['sixRoles'] ?? ''),
      learningType: str(row['학습유형'] ?? row['learningType']),
      impactExpect: str(row['임팩트기대'] ?? row['impactExpect']),
      description: str(row['설명'] ?? row['description']),
      pptUrl: str(row['PPT링크'] ?? row['pptUrl']),
      vodUrl: str(row['VOD링크'] ?? row['vodUrl']),
      isActive: true,
    }

    try {
      const existing = await prisma.content.findUnique({ where: { legacyCode } })
      if (isDryRun) {
        console.log(`[DRY] ${existing ? '업데이트' : '생성'}: code ${legacyCode} — ${name}`)
      } else if (existing) {
        await prisma.content.update({ where: { legacyCode }, data })
        updated++
      } else {
        await prisma.content.create({ data })
        created++
      }
    } catch (e: any) {
      console.error(`  ❌ code ${legacyCode} (${name}): ${e.message}`)
      skipped++
    }
  }

  console.log(`\n✅ 완료 — 생성: ${created}, 업데이트: ${updated}, 건너뜀: ${skipped}`)
}

// 교육 모듈 임포트
async function importModules(rows: Record<string, any>[]) {
  console.log(`\n총 ${rows.length}행 모듈 임포트 시작...\n`)
  let created = 0, updated = 0, skipped = 0

  const CATEGORY_MAP: Record<string, string> = {
    '기술': 'TECH_EDU', '창업': 'STARTUP_EDU', '캡스톤': 'CAPSTONE',
    '멘토링': 'MENTORING', '네트워킹': 'NETWORKING', '이벤트': 'EVENT',
    '액션위크': 'ACTION_WEEK', '특강': 'SPECIAL_LECTURE',
    'TECH_EDU': 'TECH_EDU', 'STARTUP_EDU': 'STARTUP_EDU', 'CAPSTONE': 'CAPSTONE',
    'MENTORING': 'MENTORING', 'NETWORKING': 'NETWORKING', 'EVENT': 'EVENT',
    'ACTION_WEEK': 'ACTION_WEEK', 'SPECIAL_LECTURE': 'SPECIAL_LECTURE',
  }
  const METHOD_MAP: Record<string, string> = {
    '강의': 'LECTURE', '워크숍': 'WORKSHOP', '실습': 'PRACTICE',
    '멘토링': 'MENTORING', '혼합': 'MIXED', '액션위크': 'ACTION_WEEK', '온라인': 'ONLINE',
    'LECTURE': 'LECTURE', 'WORKSHOP': 'WORKSHOP', 'PRACTICE': 'PRACTICE',
    'MIXED': 'MIXED', 'ACTION_WEEK': 'ACTION_WEEK', 'ONLINE': 'ONLINE',
  }
  const DIFF_MAP: Record<string, string> = {
    '입문': 'INTRO', '중급': 'MID', '심화': 'ADVANCED',
    'INTRO': 'INTRO', 'MID': 'MID', 'ADVANCED': 'ADVANCED',
  }

  for (const row of rows) {
    const moduleCode = str(row['모듈코드'] ?? row['moduleCode'] ?? row['코드'])
    const name = str(row['모듈명'] ?? row['name'] ?? row['이름'])
    if (!moduleCode || !name) { skipped++; continue }

    const catRaw = str(row['카테고리'] ?? row['category'] ?? '')
    const methodRaw = str(row['방식'] ?? row['method'] ?? row['운영방식'] ?? '')
    const diffRaw = str(row['난이도'] ?? row['difficulty'] ?? '')

    const data = {
      moduleCode,
      name,
      category: (CATEGORY_MAP[catRaw ?? ''] ?? 'STARTUP_EDU') as any,
      method: (METHOD_MAP[methodRaw ?? ''] ?? 'LECTURE') as any,
      difficulty: (DIFF_MAP[diffRaw ?? ''] ?? 'INTRO') as any,
      keywordTags: arr(row['키워드'] ?? row['keywords'] ?? row['태그'] ?? ''),
      durationHours: num(row['시간'] ?? row['durationHours'] ?? row['소요시간']) ?? 2,
      minParticipants: int(row['최소인원'] ?? row['minParticipants']) ?? 5,
      maxParticipants: int(row['최대인원'] ?? row['maxParticipants']) ?? 50,
      objectives: arr(row['목표'] ?? row['objectives'] ?? ''),
      contents: arr(row['내용'] ?? row['contents'] ?? ''),
      practices: arr(row['실습'] ?? row['practices'] ?? ''),
      equipment: arr(row['장비'] ?? row['equipment'] ?? ''),
      outputs: arr(row['산출물'] ?? row['outputs'] ?? ''),
      targetStages: arr(row['대상단계'] ?? row['targetStages'] ?? ''),
      targetPresets: arr(row['대상프리셋'] ?? row['targetPresets'] ?? ''),
      impactQ54Mapping: arr(row['Q54매핑'] ?? row['impactQ54Mapping'] ?? ''),
      skills5D: arr(row['5D역량'] ?? row['skills5D'] ?? ''),
      acttTargets: arr(row['ACTT타겟'] ?? row['acttTargets'] ?? ''),
      aiRatio: int(row['AI비중'] ?? row['aiRatio']) ?? 0,
      expertRatio: int(row['전문가비중'] ?? row['expertRatio']) ?? 100,
      prerequisites: arr(row['선수조건'] ?? row['prerequisites'] ?? ''),
      outcomeTypes: arr(row['성과유형'] ?? row['outcomeTypes'] ?? ''),
      isTheory: bool(row['이론여부'] ?? row['isTheory'] ?? false),
      isActive: true,
    }

    try {
      const existing = await prisma.module.findUnique({ where: { moduleCode } })
      if (isDryRun) {
        console.log(`[DRY] ${existing ? '업데이트' : '생성'}: ${moduleCode} — ${name}`)
      } else if (existing) {
        await prisma.module.update({ where: { moduleCode }, data })
        updated++
      } else {
        await prisma.module.create({ data })
        created++
      }
    } catch (e: any) {
      console.error(`  ❌ ${moduleCode} (${name}): ${e.message}`)
      skipped++
    }
  }

  console.log(`\n✅ 완료 — 생성: ${created}, 업데이트: ${updated}, 건너뜀: ${skipped}`)
}

// SROI 프록시 계수 임포트
async function importSroiProxies(rows: Record<string, any>[]) {
  console.log(`\n총 ${rows.length}행 SROI 프록시 임포트 시작...\n`)
  let upserted = 0

  for (const row of rows) {
    const country = str(row['국가'] ?? row['country']) ?? '한국'
    const impactType = str(row['임팩트유형'] ?? row['impactType'] ?? row['유형'])
    const subType = str(row['세부유형'] ?? row['subType'] ?? row['세부'])
    if (!impactType || !subType) continue

    try {
      await prisma.sroiProxy.upsert({
        where: { country_impactType_subType: { country, impactType, subType } },
        create: {
          country,
          impactType,
          subType,
          formula: str(row['산출식'] ?? row['formula']) ?? '',
          proxyKrw: int(row['프록시금액'] ?? row['proxyKrw'] ?? row['금액']) ?? 0,
          unit: str(row['단위'] ?? row['unit']) ?? '명',
          contributionRate: num(row['기여율'] ?? row['contributionRate']),
          isActive: true,
        },
        update: {
          formula: str(row['산출식'] ?? row['formula']) ?? '',
          proxyKrw: int(row['프록시금액'] ?? row['proxyKrw'] ?? row['금액']) ?? 0,
          unit: str(row['단위'] ?? row['unit']) ?? '명',
          contributionRate: num(row['기여율'] ?? row['contributionRate']),
        },
      })
      upserted++
      if (isDryRun) console.log(`[DRY] upsert: ${country}/${impactType}/${subType}`)
    } catch (e: any) {
      console.error(`  ❌ ${impactType}/${subType}: ${e.message}`)
    }
  }

  console.log(`\n✅ 완료 — upsert: ${upserted}건`)
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  if (isPreview) {
    await runPreview()
    return
  }

  console.log(`\n📂 파일: ${filePath}`)
  console.log(`📊 타입: ${importType}`)
  if (isDryRun) console.log('⚠️  DRY-RUN 모드 — DB에 저장하지 않습니다.\n')

  const rows = await readExcel(filePath, {
    sheet: sheetArg,
    headerRow: headerArg ? Number(headerArg) : 1,
  })

  console.log(`✔ ${rows.length}행 읽음\n`)

  switch (importType) {
    case 'coaches':       await importCoaches(rows); break
    case 'cost-standards': await importCostStandards(rows); break
    case 'contents':      await importContents(rows); break
    case 'modules':       await importModules(rows); break
    case 'sroi-proxies':  await importSroiProxies(rows); break
    default:
      console.log(`'${importType}' 타입은 아직 구현 중입니다.`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
