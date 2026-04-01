/**
 * POST /api/admin/import
 * 엑셀 파일을 업로드하여 DB에 임포트합니다.
 *
 * Form data:
 *   type: 'coaches' | 'cost-standards' | 'modules' | 'contents' | 'sroi-proxies'
 *   file: .xlsx / .csv
 *   sheet?: 시트 이름
 *   headerRow?: 헤더 행 번호 (기본 1)
 *   dryRun?: 'true' — DB 저장 없이 파싱 결과만 반환
 */

import { NextRequest, NextResponse } from 'next/server'
import { writeFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { readExcel } from '@/lib/excel'
import { prisma } from '@/lib/prisma'

const SUPPORTED_TYPES = ['coaches', 'cost-standards', 'modules', 'sroi-proxies'] as const
type ImportType = (typeof SUPPORTED_TYPES)[number]

// ── 헬퍼 ────────────────────────────────────────────────────────────────────
const str = (v: any) => (v === null || v === undefined ? null : String(v).trim() || null)
const num = (v: any) => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return isNaN(n) ? null : n }
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
const detect = (row: Record<string, any>, ...candidates: string[]) => {
  for (const c of candidates) {
    const key = Object.keys(row).find(
      (k) => k.toLowerCase().replace(/[\s_\-]/g, '') === c.toLowerCase().replace(/[\s_\-]/g, '')
    )
    if (key && row[key] !== null && row[key] !== '') return row[key]
  }
  return null
}

// ── 임포터들 ──────────────────────────────────────────────────────────────────

async function importCoaches(rows: Record<string, any>[], dryRun: boolean) {
  let created = 0, updated = 0, skipped = 0
  const errors: string[] = []

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
      const existing = data.email
        ? await prisma.coach.findFirst({ where: { email: data.email } })
        : await prisma.coach.findFirst({ where: { name } })

      if (dryRun) {
        // dry run: just count
      } else if (existing) {
        await prisma.coach.update({ where: { id: existing.id }, data })
        updated++
      } else {
        await prisma.coach.create({ data })
        created++
      }
      if (!dryRun && !existing) created++ // already counted above for existing
    } catch (e: any) {
      errors.push(`${name}: ${e.message}`)
      skipped++
    }
  }

  return { created, updated, skipped, errors }
}

async function importCostStandards(rows: Record<string, any>[], dryRun: boolean) {
  let upserted = 0
  const errors: string[] = []

  for (const row of rows) {
    const wbsCode = str(row['WBS코드'] ?? row['wbsCode'] ?? row['코드'])
    const name = str(row['항목명'] ?? row['name'] ?? row['항목'])
    if (!wbsCode || !name) continue

    const typeRaw = str(row['유형'] ?? row['type'] ?? 'AC')
    const type = typeRaw?.toUpperCase() === 'PC' ? 'PC' : 'AC'

    try {
      if (!dryRun) {
        await prisma.costStandard.upsert({
          where: { wbsCode },
          create: {
            wbsCode, type: type as any,
            category: str(row['카테고리'] ?? row['category']) ?? '기타',
            name, unit: str(row['단위'] ?? row['unit']) ?? '건',
            unitPrice: int(row['단가'] ?? row['unitPrice']) ?? 0,
            notes: str(row['비고'] ?? row['notes']),
          },
          update: {
            category: str(row['카테고리'] ?? row['category']) ?? '기타',
            name, unit: str(row['단위'] ?? row['unit']) ?? '건',
            unitPrice: int(row['단가'] ?? row['unitPrice']) ?? 0,
            notes: str(row['비고'] ?? row['notes']),
          },
        })
      }
      upserted++
    } catch (e: any) {
      errors.push(`${wbsCode}: ${e.message}`)
    }
  }

  return { upserted, errors }
}

async function importModules(rows: Record<string, any>[], dryRun: boolean) {
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

  let created = 0, updated = 0, skipped = 0
  const errors: string[] = []

  for (const row of rows) {
    const moduleCode = str(row['모듈코드'] ?? row['moduleCode'] ?? row['코드'])
    const name = str(row['모듈명'] ?? row['name'] ?? row['이름'])
    if (!moduleCode || !name) { skipped++; continue }

    const catRaw = str(row['카테고리'] ?? row['category'] ?? '')
    const methodRaw = str(row['방식'] ?? row['method'] ?? row['운영방식'] ?? '')
    const diffRaw = str(row['난이도'] ?? row['difficulty'] ?? '')

    const data = {
      moduleCode, name,
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
      if (!dryRun) {
        if (existing) { await prisma.module.update({ where: { moduleCode }, data }); updated++ }
        else { await prisma.module.create({ data }); created++ }
      } else {
        if (existing) updated++; else created++
      }
    } catch (e: any) {
      errors.push(`${moduleCode} (${name}): ${e.message}`)
      skipped++
    }
  }

  return { created, updated, skipped, errors }
}

async function importSroiProxies(rows: Record<string, any>[], dryRun: boolean) {
  let upserted = 0
  const errors: string[] = []

  for (const row of rows) {
    const country = str(row['국가'] ?? row['country']) ?? '한국'
    const impactType = str(row['임팩트유형'] ?? row['impactType'] ?? row['유형'])
    const subType = str(row['세부유형'] ?? row['subType'] ?? row['세부'])
    if (!impactType || !subType) continue

    try {
      if (!dryRun) {
        await prisma.sroiProxy.upsert({
          where: { country_impactType_subType: { country, impactType, subType } },
          create: {
            country, impactType, subType,
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
      }
      upserted++
    } catch (e: any) {
      errors.push(`${impactType}/${subType}: ${e.message}`)
    }
  }

  return { upserted, errors }
}

// ── 메인 핸들러 ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const type = form.get('type') as ImportType
    const file = form.get('file') as File | null
    const sheet = form.get('sheet') as string | null
    const headerRow = form.get('headerRow') ? Number(form.get('headerRow')) : 1
    const dryRun = form.get('dryRun') === 'true'

    if (!type || !SUPPORTED_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `type은 ${SUPPORTED_TYPES.join(', ')} 중 하나여야 합니다.` },
        { status: 400 }
      )
    }
    if (!file) {
      return NextResponse.json({ error: 'file이 필요합니다.' }, { status: 400 })
    }

    // 임시 파일에 저장
    const ext = path.extname(file.name) || '.xlsx'
    const tmpPath = path.join(tmpdir(), `ud-import-${Date.now()}${ext}`)
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(tmpPath, buffer)

    let rows: Record<string, any>[]
    try {
      rows = await readExcel(tmpPath, { sheet: sheet ?? undefined, headerRow })
    } finally {
      await unlink(tmpPath).catch(() => {})
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: '파일에서 데이터를 읽을 수 없습니다.' }, { status: 400 })
    }

    let result: Record<string, any>
    switch (type) {
      case 'coaches':        result = await importCoaches(rows, dryRun); break
      case 'cost-standards': result = await importCostStandards(rows, dryRun); break
      case 'modules':        result = await importModules(rows, dryRun); break
      case 'sroi-proxies':   result = await importSroiProxies(rows, dryRun); break
      default:
        return NextResponse.json({ error: '지원하지 않는 타입입니다.' }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      type,
      totalRows: rows.length,
      ...result,
    })
  } catch (err: any) {
    console.error('[import]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
