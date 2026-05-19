/**
 * SMART 5축 휴리스틱 체크 — Wave U / U4 (2026-05-19)
 *
 * Before/After + KeyMessages 를 5축으로 평가:
 *   Specific      (구체적)    — 대상·문제·해결이 명시되는가
 *   Measurable    (측정 가능)  — 숫자·단위가 포함되는가
 *   Achievable    (달성 가능)  — 현실적 동사·과한 약속 없음
 *   Relevant      (관련성)    — RFP·핵심 메시지와 연결되는가
 *   Time-bound    (기한)      — 기간 단위가 명시되는가
 *
 * 휴리스틱 — AI 호출 없이 client-side 즉시 평가. 매 키 입력마다 cheap.
 *
 * 사용처:
 *   - <SmartChecklist /> 컴포넌트 (ExpressPreview Before/After 카드 아래)
 *   - Inspector lens "before-after-smart" (추후)
 */

export type SmartAxis =
  | 'specific'
  | 'measurable'
  | 'achievable'
  | 'relevant'
  | 'timeBound'

export interface SmartScore {
  axis: SmartAxis
  label: string
  passed: boolean
  hint: string
  /** 0~1 점수 (시각화용 — passed 는 ≥ 0.6) */
  confidence: number
}

const AXIS_LABEL: Record<SmartAxis, string> = {
  specific: 'Specific (구체)',
  measurable: 'Measurable (측정)',
  achievable: 'Achievable (현실)',
  relevant: 'Relevant (관련)',
  timeBound: 'Time-bound (기한)',
}

interface Input {
  before: string
  after: string
  keyMessages: string[]
  intent?: string
}

export function evaluateSmart(input: Input): SmartScore[] {
  const combined = [input.before, input.after, input.intent ?? '', ...input.keyMessages]
    .filter(Boolean)
    .join(' ')

  return [
    checkSpecific(input, combined),
    checkMeasurable(combined),
    checkAchievable(input, combined),
    checkRelevant(input, combined),
    checkTimeBound(combined),
  ]
}

// ─────────────────────────────────────────
// 축별 체크 (단순 휴리스틱)
// ─────────────────────────────────────────

function checkSpecific(input: Input, _combined: string): SmartScore {
  const combined = _combined
  const len = (input.before?.length ?? 0) + (input.after?.length ?? 0)
  // Specific 키워드 — 누구·무엇·어디·어떤·문제·대상
  const specificHints = /(누가|대상|문제|상황|환경|어디|어떤|특정|구체|초점|타겟|소외)/
  const hits = (combined.match(specificHints) || []).length
  // 길이 + 키워드 합산
  const lengthScore = Math.min(len / 200, 1)
  const keywordScore = Math.min(hits / 3, 1)
  const confidence = lengthScore * 0.5 + keywordScore * 0.5
  return {
    axis: 'specific',
    label: AXIS_LABEL.specific,
    confidence,
    passed: confidence >= 0.6,
    hint:
      confidence >= 0.6
        ? '대상·문제·해결이 명확합니다'
        : '"누가", "어떤 문제", "어떤 환경" 같은 구체적 표현을 보강하세요',
  }
}

function checkMeasurable(combined: string): SmartScore {
  // 숫자 + 단위 — 명·%·회·시간·개월·건·점·만·천·억·원·시간
  const measureRe = /\d[\d,.]*\s*(명|%|퍼센트|회|차|시간|개월|건|점|만|천|억|원|배|이상|이하)/g
  const matches = combined.match(measureRe) || []
  const confidence = Math.min(matches.length / 3, 1)
  return {
    axis: 'measurable',
    label: AXIS_LABEL.measurable,
    confidence,
    passed: confidence >= 0.6,
    hint:
      confidence >= 0.6
        ? `정량 표현 ${matches.length}개 확인`
        : '"30명", "20% 증가", "8주" 같은 숫자·단위 표현 3개 이상 권장',
  }
}

function checkAchievable(input: Input, combined: string): SmartScore {
  // 비현실 어휘 — "모든", "100%", "완전한", "절대"
  const unrealisticRe = /(모든|100%|완전한|절대|전 국민|전 세계|즉시|영구히|항상)/g
  const unrealisticHits = (combined.match(unrealisticRe) || []).length
  // 동사 패턴 — "할 수 있", "가능", "달성", "확보"
  const realisticRe = /(할 수 있|가능|달성|확보|구축|마련|제공|운영|지원)/g
  const realisticHits = (combined.match(realisticRe) || []).length

  // 균형 — 비현실 hit 가 많으면 감점
  let confidence = Math.min(realisticHits / 2, 1)
  if (unrealisticHits > 2) confidence *= 0.5
  if (unrealisticHits > 4) confidence *= 0.5

  return {
    axis: 'achievable',
    label: AXIS_LABEL.achievable,
    confidence,
    passed: confidence >= 0.6,
    hint:
      unrealisticHits > 2
        ? `"모든", "100%" 같은 절대 표현 ${unrealisticHits}건 — 평가위원이 의심합니다. 범위 한정 권장`
        : confidence >= 0.6
          ? '현실적 표현으로 작성됨'
          : '"할 수 있", "확보", "달성" 같은 능동 표현 보강',
  }
}

function checkRelevant(input: Input, combined: string): SmartScore {
  // 핵심 메시지·intent 의 키워드가 Before/After 에 다시 나오는가
  const km = input.keyMessages.join(' ')
  if (!km && !input.intent) {
    return {
      axis: 'relevant',
      label: AXIS_LABEL.relevant,
      confidence: 0,
      passed: false,
      hint: '핵심 메시지·intent 가 비어있어 관련성 평가 불가',
    }
  }
  // intent 의 명사·동사 추출 — 단순히 2자 이상 단어
  const sourceTokens = (km + ' ' + (input.intent ?? ''))
    .split(/[\s,.·]+/)
    .filter((w) => w.length >= 2 && !/^[a-zA-Z0-9]+$/.test(w))
  const ba = input.before + ' ' + input.after
  const baTokens = new Set(ba.split(/[\s,.·]+/).filter((w) => w.length >= 2))
  let overlap = 0
  for (const t of sourceTokens) {
    if (baTokens.has(t)) overlap++
  }
  const confidence = Math.min(overlap / 3, 1)
  return {
    axis: 'relevant',
    label: AXIS_LABEL.relevant,
    confidence,
    passed: confidence >= 0.6,
    hint:
      confidence >= 0.6
        ? `핵심 메시지·intent 와 ${overlap}개 키워드 연결됨`
        : 'Before/After 에 핵심 메시지·intent 의 키워드가 반복되도록 보강',
  }
}

function checkTimeBound(combined: string): SmartScore {
  // 기간 단위 — "8주", "6개월", "2026년", "12회차"
  const timeRe = /(\d+\s*(주|개월|년|월|일|회차|회|학기|분기))|(\d{4}년)/g
  const matches = combined.match(timeRe) || []
  const confidence = Math.min(matches.length / 2, 1)
  return {
    axis: 'timeBound',
    label: AXIS_LABEL.timeBound,
    confidence,
    passed: confidence >= 0.6,
    hint:
      confidence >= 0.6
        ? `기한 표현 ${matches.length}개 확인`
        : '"8주", "6개월", "2026년 상반기" 같은 기한 명시 권장',
  }
}

/** 전체 SMART 점수 — passed 갯수 / 5 */
export function smartOverall(scores: SmartScore[]): number {
  return scores.filter((s) => s.passed).length / scores.length
}
