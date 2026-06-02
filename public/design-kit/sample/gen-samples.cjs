/**
 * 샘플 이미지 생성기 — DECK-1 proof 덱용 결정론적 플레이스홀더(사진 대역).
 *
 * 실제 사진 자산이 레포에 없으므로(라이선스·용량) "사진 슬롯이 채워진다"를 시연하기 위한
 * 결정론적 SVG 플레이스홀더를 생성한다. 그레이스케일 기하 패턴 — 디자인 킷 가드 위반 아님
 * (장식이 아니라 사진 자리표시). 운영에서는 ContentAsset 이미지 URL 로 대체.
 *
 * 실행: node public/design-kit/sample/gen-samples.cjs
 */
const fs = require('node:fs')
const path = require('node:path')

const DIR = __dirname

// 결정론적 의사난수 (seed)
function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

function portrait(seed, label) {
  const r = rng(seed)
  const g1 = 60 + Math.floor(r() * 40)
  const g2 = 150 + Math.floor(r() * 60)
  // 추상 인물 실루엣 (그레이스케일)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">
  <rect width="320" height="320" fill="rgb(${g2},${g2},${g2})"/>
  <rect width="320" height="320" fill="rgb(${g1},${g1},${g1})" opacity="0.25"/>
  <circle cx="160" cy="128" r="58" fill="rgb(${g1},${g1},${g1})"/>
  <path d="M52 320 C52 232 100 196 160 196 C220 196 268 232 268 320 Z" fill="rgb(${g1},${g1},${g1})"/>
  <rect x="0" y="0" width="320" height="320" fill="none" stroke="rgb(120,120,120)" stroke-width="2"/>
</svg>`
}

function cover() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="#2b2c2b"/>
  <g opacity="0.5" stroke="#5a5b5a" stroke-width="1.5">
    ${Array.from({ length: 18 }, (_, i) => `<line x1="${i * 80}" y1="0" x2="${i * 80 + 360}" y2="720"/>`).join('\n    ')}
  </g>
  <g fill="#3a3b3a">
    <circle cx="980" cy="240" r="200"/>
    <circle cx="1120" cy="540" r="120"/>
  </g>
  <rect x="0" y="0" width="1280" height="720" fill="#000000" opacity="0.28"/>
</svg>`
}

function facility() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <rect width="800" height="600" fill="#cfcfcf"/>
  <rect x="0" y="380" width="800" height="220" fill="#9a9a9a"/>
  <g fill="#7d7d7d">
    <rect x="80" y="150" width="160" height="320"/>
    <rect x="300" y="90" width="200" height="380"/>
    <rect x="560" y="200" width="160" height="270"/>
  </g>
  <g fill="#e6e6e6">
    ${Array.from({ length: 4 }, (_, c) =>
      Array.from({ length: 5 }, (_, rr) => `<rect x="${320 + c * 45}" y="${120 + rr * 60}" width="28" height="34"/>`).join('')
    ).join('')}
  </g>
  <rect width="800" height="600" fill="none" stroke="#888" stroke-width="2"/>
</svg>`
}

const files = {
  'cover-bg.svg': cover(),
  'facility.svg': facility(),
  'coach-1.svg': portrait(11, 'A'),
  'coach-2.svg': portrait(29, 'B'),
  'coach-3.svg': portrait(53, 'C'),
  'coach-4.svg': portrait(97, 'D'),
}

for (const [name, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(DIR, name), content, 'utf-8')
  console.log('wrote', name)
}
