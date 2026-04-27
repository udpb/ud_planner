/**
 * print-worktree.cjs — dev 서버 시작 직전에 현재 경로/브랜치를 출력.
 *
 * 배경 (2026-04-27 정리):
 *   과거 worktree 2개 운영 중 "잘못된 워크트리에서 dev 띄우기" 사고가 두 번 발생.
 *   master 단일 워크트리로 통합 후, 그래도 사용자가 임의 경로에서 띄울 가능성 대비.
 *
 * 출력 내용:
 *   📁 현재 작업 경로
 *   🌿 현재 브랜치
 *   ⚠ 워크트리 안에서 띄우는 경우 경고
 *   ✓ 정상 master 경로면 통과 메시지
 *
 * package.json 의 predev 훅에 등록되어 있음 (`npm run dev` 시 자동 실행).
 */

const { execSync } = require('child_process')
const path = require('path')

const cwd = process.cwd()
const cwdNorm = cwd.replace(/\\/g, '/').toLowerCase()

const isWorktree = cwdNorm.includes('/.claude/worktrees/')
const looksLikeMaster = cwdNorm.endsWith('/ud-ops-workspace')

let branch = '?'
try {
  branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim() || 'detached'
} catch (e) {
  branch = '(git unavailable)'
}

const bar = '─'.repeat(64)
const lines = []

lines.push('')
lines.push(bar)
lines.push(`📁 ${cwd}`)
lines.push(`🌿 ${branch}`)

if (isWorktree) {
  lines.push('')
  lines.push('⚠️  워크트리 안에서 dev 를 띄우고 있습니다.')
  lines.push('   정상 경로: C:\\Users\\USER\\projects\\ud-ops-workspace')
  lines.push('   2026-04-27 워크트리 통합 — 모든 작업은 master 디렉토리에서.')
} else if (!looksLikeMaster && branch !== 'master') {
  lines.push('')
  lines.push('ℹ️  master 가 아닌 경로/브랜치 입니다. 의도된 것인지 확인하세요.')
} else {
  lines.push('✓  master worktree 정상')
}

lines.push(bar)
lines.push('')

console.log(lines.join('\n'))
