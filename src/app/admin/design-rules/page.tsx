/**
 * /admin/design-rules — DesignRule 검수 (Server Component) · BR-2
 *
 * v1.2 에서 큐레이션해 메인이 발행한 DesignRule 시드를 사람이 규칙 단위로
 * 승인/반려/메모. approved 만 BR-3 생성기가 소비.
 *
 * 데이터: JSON-first (`data/program-design/design-rules.json`, ADR-028 Option B) —
 *   DB 아님. 서버 컴포넌트가 loadDesignRules() 로 직접 읽어 클라이언트 보드로 전달.
 *
 * 스키마 동결: docs/decisions/028-program-design-grammar.md 추록 3.
 */

import { Header } from '@/components/layout/header'
import { loadDesignRules } from '@/lib/program-design/design-rule'

import { RuleBoard } from './_components/rule-board'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'DesignRule 검수' }

export default async function DesignRulesPage() {
  let rules
  let loadError: string | null = null
  try {
    const set = await loadDesignRules()
    rules = set.rules
  } catch (err: unknown) {
    loadError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex flex-col overflow-hidden">
      <Header title="DesignRule 검수" />
      <div className="flex-1 overflow-y-auto" style={{ padding: 24 }}>
        {/* 안내 */}
        <div style={{ marginBottom: 20, maxWidth: 880 }}>
          <p
            style={{
              fontSize: 13,
              lineHeight: 1.7,
              color: 'var(--soft-ink)',
              wordBreak: 'keep-all',
            }}
          >
            v1.2 설계 로직에서 큐레이션한{' '}
            <strong style={{ fontWeight: 700 }}>프로그램 설계 문법(기본값 규칙)</strong>입니다.
            모든 규칙은 <strong style={{ fontWeight: 700 }}>강제가 아닌 기본값</strong>(제0원칙 —
            클라이언트 목표가 이긴다)이며, 승인된 규칙만 생성기(BR-3)가 빈칸 채움에 사용합니다.
            <span style={{ color: 'var(--accent)', fontWeight: 700 }}> 사람 결정 게이트</span>로
            표시된 규칙은 자동 적용 대신 모호할 때 사람에게 선택을 묻습니다.
          </p>
        </div>

        {loadError ? (
          <div
            style={{
              border: '1px solid var(--line)',
              borderLeft: '3px solid var(--accent)',
              background: 'var(--neutral-90)',
              padding: 16,
              fontSize: 13,
              color: 'var(--soft-ink)',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.6,
            }}
          >
            <strong style={{ fontWeight: 700 }}>시드를 읽지 못했습니다.</strong>
            {'\n'}시드가 ADR-028 추록 3 스키마와 어긋날 수 있습니다 — 시드 작성자(메인)에게
            보고하세요.{'\n\n'}
            {loadError}
          </div>
        ) : (
          <RuleBoard initialRules={rules ?? []} />
        )}
      </div>
    </div>
  )
}
