/**
 * /projects/new — 신규 프로젝트 생성 (Phase L, 2026-04-28 갱신)
 *
 * RFP 우선 흐름: 업로드 → 자동 분석 → form 자동 채움 → 검토·수정 → 생성
 *  → 자동으로 /projects/{id}/express 진입 (RFP 이미 있는 상태 → 첫 턴 자동)
 *
 * "RFP 없이 수동 시작" 토글로 빈 form 도 가능.
 */

import { Header } from '@/components/layout/header'
import { NewProjectForm } from './NewProjectForm'

export const metadata = { title: '새 프로젝트' }

export default function NewProjectPage() {
  return (
    <div className="flex flex-col overflow-hidden">
      <Header title="새 프로젝트" />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl">
          <NewProjectForm />
        </div>
      </div>
    </div>
  )
}
