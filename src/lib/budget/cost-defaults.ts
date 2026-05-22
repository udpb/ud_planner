/**
 * F2 / B3 — Cost rate loader (CostStandard DB + Fallback hardcode)
 *
 * pure-ish 모듈: loadCostRates 만 prisma 호출, 나머지는 데이터.
 * FALLBACK_RATES 는 CostStandard 가 비어있는 환경 (dev seed 누락 등) 안전망.
 *
 * 단가 단위: KRW (원) — Int 로 저장. (Int 범위 ±2.14B 원, 사업 단가 충분히 수용)
 */

/**
 * prisma 의 구체 타입 의존 회피 — 우리 lib/prisma 의 extended client 와도 호환.
 * costStandard.findMany 만 사용하므로 minimal shape 으로 충분.
 */
interface PrismaCostStandardClient {
  costStandard: {
    findMany(args?: {
      where?: { isActive?: boolean }
    }): Promise<Array<{
      wbsCode: string
      category: string
      name: string
      unit: string
      unitPrice: number
    }>>
  }
}

export interface CostRate {
  wbsCode: string
  category: string
  name: string
  unit: string
  unitPrice: number
  source: 'CostStandard' | 'Fallback'
}

/**
 * Fallback hardcode — CostStandard 미시드 환경 안전망.
 * 단가는 언더독스 평균값 (2026-05 기준).
 */
export const FALLBACK_RATES: Record<
  string,
  { category: string; name: string; unit: string; unitPrice: number }
> = {
  // AC (Activity Cost) — 사업 활동 직접비
  'AC-01': { category: '강사료', name: '이론 강사료', unit: '회', unitPrice: 400000 },
  'AC-02': { category: '코치료', name: '실습 코치료', unit: '시간', unitPrice: 80000 },
  'AC-03': { category: '코치료', name: '1:1 코칭료', unit: '시간', unitPrice: 100000 },
  'AC-06': { category: '식음료비', name: '교육 중 다과비', unit: '인·회', unitPrice: 10000 },
  'AC-08': { category: '교통비', name: '강사·코치 교통비', unit: '인·회', unitPrice: 30000 },
  'AC-09': { category: '운영비', name: '회차 운영비 (자료·진행)', unit: '회', unitPrice: 100000 },
  'AC-10': { category: '운영비', name: '온라인 플랫폼 (Zoom/LMS)', unit: '월', unitPrice: 50000 },
  'AC-11': { category: '장소비', name: '교육장 임차비', unit: '일', unitPrice: 500000 },

  // PC (Personnel Cost) — 인건비
  'PC-01': { category: 'PM 인건비', name: '프로젝트 매니저 (월)', unit: '월', unitPrice: 4500000 },
  'PC-02': { category: '운영 인력', name: '운영 보조 (월)', unit: '월', unitPrice: 2500000 },
}

/**
 * DB CostStandard 로딩 + Fallback 매핑.
 * CostStandard 에 등록된 wbsCode 는 source='CostStandard',
 * FALLBACK_RATES 에만 있는 wbsCode 는 source='Fallback' 으로 채워서 반환.
 */
export async function loadCostRates(
  prisma: PrismaCostStandardClient,
): Promise<Map<string, CostRate>> {
  const cs = await prisma.costStandard.findMany({ where: { isActive: true } })
  const map = new Map<string, CostRate>()

  for (const c of cs) {
    map.set(c.wbsCode, {
      wbsCode: c.wbsCode,
      category: c.category,
      name: c.name,
      unit: c.unit,
      unitPrice: c.unitPrice,
      source: 'CostStandard',
    })
  }

  // FALLBACK 채우기 — CostStandard 에 없는 wbsCode 만
  for (const [code, fallback] of Object.entries(FALLBACK_RATES)) {
    if (!map.has(code)) {
      map.set(code, {
        wbsCode: code,
        category: fallback.category,
        name: fallback.name,
        unit: fallback.unit,
        unitPrice: fallback.unitPrice,
        source: 'Fallback',
      })
    }
  }

  return map
}
