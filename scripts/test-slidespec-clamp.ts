/**
 * P4 검증 — validateSlideSpec 가 길이 초과 string 을 drop 대신 clamp 하는지.
 * (캡스톤: architecture-stack item >40자 → 슬라이드 전체 reject 되던 회귀)
 */
import { validateSlideSpec } from '../src/lib/diagrams/slide-pattern'

const base = (pattern: string, data: any) => ({
  kicker: '04 운영 체계', headline: '전담 PMO 와 4중 페이스메이커로 운영 안정성을 확보합니다',
  diagram: { pattern, data }, sectionNum: '4', order: 1,
})

let pass = 0, fail = 0
const check = (name: string, cond: boolean) => { cond ? pass++ : fail++; console.log(`  ${cond ? '✓' : '✗'} ${name}`) }

console.log('▶ P4 — slideSpec clamp 검증')

// 1. architecture-stack item >40자 → 이전엔 reject, 이제 clamp 후 ok (layers ≥2 충족)
const longItem = '전담 프로젝트 매니지먼트 오피스 운영 및 산학협력단 실시간 소통 채널 상시 구축'  // >40자
const r1 = validateSlideSpec(base('architecture-stack', { layers: [{ name: 'PMO', items: [longItem, '코치진'] }, { name: 'AI', items: ['EDU 봇'], accent: true }] }))
check(`architecture-stack 긴 item(${longItem.length}자) → ok(clamp)`, r1.ok === true)
if (r1.ok) {
  const clamped = (r1.spec.diagram.data as any).layers[0].items[0]
  check(`  item clamp ≤40자 (실제 ${clamped.length}자)`, clamped.length <= 40)
}

// 2. 정상 데이터 → 변형 없이 ok (kpis ≥3 충족)
const r2 = validateSlideSpec(base('kpi-grid', { columns: 3, kpis: [{ value: '20,211', label: '명', sublabel: '누적' }, { value: '498', label: '건' }, { value: '500억', label: '수주' }] }))
check('정상 kpi-grid → ok', r2.ok === true)

// 3. 구조 오류(필수 필드 누락) → 여전히 reject
const r3 = validateSlideSpec(base('comparison-table', { rows: [{ dim: 'X' /* left/right 누락 */ }] }))
check('구조 오류(left/right 누락) → reject 유지', r3.ok === false)

// 4. timeline bar label 초과 → clamp
const r4 = validateSlideSpec(base('timeline', { units: ['M1','M2','M3'], tracks: [{ name: '교육', bars: [{ startIdx: 0, endIdx: 1, label: '아주 긴 바 라벨 텍스트가 사십자를 훌쩍 넘기는 경우의 처리 검증용 문구' }] }] }))
check('timeline 긴 bar label → ok(clamp)', r4.ok === true)

console.log(`\n${fail === 0 ? '✅ P4 PASS' : '❌ P4 FAIL'} — ${pass} pass / ${fail} fail`)
process.exitCode = fail === 0 ? 0 : 1
