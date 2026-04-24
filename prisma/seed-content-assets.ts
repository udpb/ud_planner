/**
 * Phase H (ADR-010) — Content Hub DB 시드.
 *
 * Phase G 의 코드 시드 UD_ASSETS_SEED(15종) 을 ContentAsset 테이블로 이관.
 *
 * 실행:
 *   npm run db:seed:content-assets
 *
 * 멱등성:
 *   upsert(id) 로 동작 — 같은 id 가 있으면 업데이트, 없으면 insert.
 *   담당자가 UI 로 수정한 내용은 이 시드 재실행 시 덮어쓰기됨.
 *   운영 환경 재실행 주의 — 개발·초기 셋업 용도.
 */

import { PrismaClient } from '@prisma/client'
import { UD_ASSETS_SEED, type UdAsset } from '../src/lib/asset-registry'

const prisma = new PrismaClient()

// ─────────────────────────────────────────────────────────────
// Phase H Wave H5 — 계층 시드 예시 5건
// ─────────────────────────────────────────────────────────────
//
// Phase G 의 UD_ASSETS_SEED 는 모두 top-level (parentId=null).
// H5 에서 "상품 → 세션/주차/챕터" 계층 예시를 주입:
//   - asset-ai-solopreneur 아래 Week 1~3
//   - asset-ax-guidebook 아래 Ch 1~2
//
// 담당자가 /admin/content-hub UI 로 children 추가 흐름을 검증하기 위한 예시.
//

const HIERARCHY_EXAMPLES: UdAsset[] = [
  // ── AI 솔로프러너 children (parentId: asset-ai-solopreneur) ──
  {
    id: 'asset-ai-solopreneur-w1',
    name: 'AI 솔로프러너 Week 1 · AI 네이티브 마인드셋',
    category: 'content',
    applicableSections: ['curriculum'],
    valueChainStage: 'activity',
    evidenceType: 'methodology',
    keywords: ['AI 네이티브', '마인드셋', '솔로 창업 기초', 'Week 1'],
    narrativeSnippet:
      '첫 주차는 AI 도구가 주어졌을 때 "무엇을 맡길 것인가 / 무엇을 내가 쥘 것인가" 를 스스로 구분하는 마인드셋 훈련이다. 실습 과제로 자기 사업에서 AI 위임 지점 3 개와 사람 고유 판단 지점 3 개를 분리해 기록한다.',
    status: 'developing',
    lastReviewedAt: '2026-04-24',
  },
  {
    id: 'asset-ai-solopreneur-w2',
    name: 'AI 솔로프러너 Week 2 · 아이디어 ↔ AI 대화 설계',
    category: 'content',
    applicableSections: ['curriculum'],
    valueChainStage: 'activity',
    evidenceType: 'methodology',
    keywords: ['프롬프트 설계', '아이디어 검증', 'AI 대화', 'Week 2'],
    narrativeSnippet:
      '2 주차는 사업 아이디어를 AI 와 주고받으며 급속히 정제하는 훈련이다. "한 번의 프롬프트" 가 아니라 "연쇄 대화" 를 설계해 시장·경쟁·가치제안을 한 세션 안에서 압축적으로 스크린한다.',
    status: 'developing',
    lastReviewedAt: '2026-04-24',
  },
  {
    id: 'asset-ai-solopreneur-w3',
    name: 'AI 솔로프러너 Week 3 · 첫 프로토타입',
    category: 'content',
    applicableSections: ['curriculum'],
    valueChainStage: 'activity',
    evidenceType: 'case',
    keywords: ['프로토타입', 'MVP', 'AI 개발 도구', 'Week 3', 'no-code'],
    narrativeSnippet:
      '3 주차에는 AI 도구(v0 · Cursor · Claude Code 등) 을 엮어 실제 작동하는 프로토타입을 1 주일 안에 만든다. 완성도가 아닌 "고객에게 보여줄 수 있는 상태" 가 목표이며, 다음 주차의 고객 인터뷰 재료가 된다.',
    keyNumbers: ['1주일'],
    status: 'developing',
    lastReviewedAt: '2026-04-24',
  },

  // ── AX Guidebook children (parentId: asset-ax-guidebook) ──
  {
    id: 'asset-ax-guidebook-ch1',
    name: 'AX Guidebook Ch 1 · 내 사업에서 AI 쓸 자리 찾기',
    category: 'content',
    applicableSections: ['curriculum'],
    valueChainStage: 'activity',
    evidenceType: 'methodology',
    keywords: ['AI 도입 진단', 'AX 시작', '업무 분해', 'Chapter 1'],
    narrativeSnippet:
      '첫 챕터는 참여자의 현재 사업 흐름을 10~15 단계로 분해한 뒤 각 단계에서 "AI 가 실제로 도움되는지 / 사람이 해야 하는지" 를 판별하는 진단 프레임을 제공한다. 결과는 본 교육의 AI 도입 우선순위 지도로 활용된다.',
    status: 'developing',
    lastReviewedAt: '2026-04-24',
  },
  {
    id: 'asset-ax-guidebook-ch2',
    name: 'AX Guidebook Ch 2 · 프롬프트 기반 작업 자동화',
    category: 'content',
    applicableSections: ['curriculum'],
    valueChainStage: 'activity',
    evidenceType: 'methodology',
    keywords: ['프롬프트 자동화', '반복 업무', 'AX 실행', 'Chapter 2'],
    narrativeSnippet:
      '2 챕터는 진단에서 나온 "AI 가 할 수 있는 단계" 들을 실제로 프롬프트 · 템플릿 · 워크플로우로 전환하는 실습이다. 참여자는 자기 반복 업무 하나를 골라 3 회의 실습 세션 안에 자동화 초안을 완성한다.',
    keyNumbers: ['3 회'],
    status: 'developing',
    lastReviewedAt: '2026-04-24',
  },
]

// 자식 자산의 parentId 매핑 (upsert 시 주입)
const CHILD_PARENT_MAP: Record<string, string> = {
  'asset-ai-solopreneur-w1': 'asset-ai-solopreneur',
  'asset-ai-solopreneur-w2': 'asset-ai-solopreneur',
  'asset-ai-solopreneur-w3': 'asset-ai-solopreneur',
  'asset-ax-guidebook-ch1': 'asset-ax-guidebook',
  'asset-ax-guidebook-ch2': 'asset-ax-guidebook',
}

async function main() {
  const totalCount = UD_ASSETS_SEED.length + HIERARCHY_EXAMPLES.length
  console.log(
    `[seed-content-assets] 시작 — ${UD_ASSETS_SEED.length} 종 top-level + ${HIERARCHY_EXAMPLES.length} 종 children = ${totalCount} upsert`,
  )

  // ── 1 단계: top-level 자산 (parentId=null) 먼저 upsert ──
  // (children 이 parent 를 참조하므로 순서 중요)
  let upserted = 0
  for (const asset of UD_ASSETS_SEED) {
    await prisma.contentAsset.upsert({
      where: { id: asset.id },
      create: {
        id: asset.id,
        name: asset.name,
        category: asset.category,
        parentId: null, // v1 자산은 모두 top-level (children 은 Wave H5 에서 추가)
        applicableSections: asset.applicableSections as unknown as object,
        valueChainStage: asset.valueChainStage,
        evidenceType: asset.evidenceType,
        keywords: asset.keywords ? (asset.keywords as unknown as object) : undefined,
        programProfileFit: asset.programProfileFit
          ? (asset.programProfileFit as unknown as object)
          : undefined,
        narrativeSnippet: asset.narrativeSnippet,
        keyNumbers: asset.keyNumbers ? (asset.keyNumbers as unknown as object) : undefined,
        status: asset.status,
        version: 1,
        sourceReferences: asset.sourceReferences
          ? (asset.sourceReferences as unknown as object)
          : undefined,
        lastReviewedAt: new Date(asset.lastReviewedAt),
        createdById: null,
        updatedById: null,
      },
      update: {
        name: asset.name,
        category: asset.category,
        applicableSections: asset.applicableSections as unknown as object,
        valueChainStage: asset.valueChainStage,
        evidenceType: asset.evidenceType,
        keywords: asset.keywords ? (asset.keywords as unknown as object) : undefined,
        programProfileFit: asset.programProfileFit
          ? (asset.programProfileFit as unknown as object)
          : undefined,
        narrativeSnippet: asset.narrativeSnippet,
        keyNumbers: asset.keyNumbers ? (asset.keyNumbers as unknown as object) : undefined,
        status: asset.status,
        sourceReferences: asset.sourceReferences
          ? (asset.sourceReferences as unknown as object)
          : undefined,
        lastReviewedAt: new Date(asset.lastReviewedAt),
      },
    })
    upserted += 1
    console.log(`  ✓ ${asset.id} (${asset.category} / ${asset.valueChainStage})`)
  }

  // ── 2 단계: children upsert (Phase H Wave H5 계층 예시) ──
  for (const asset of HIERARCHY_EXAMPLES) {
    const parentId = CHILD_PARENT_MAP[asset.id]
    if (!parentId) {
      console.warn(`  ⚠ ${asset.id} — CHILD_PARENT_MAP 에 parentId 없음, 건너뜀`)
      continue
    }
    await prisma.contentAsset.upsert({
      where: { id: asset.id },
      create: {
        id: asset.id,
        name: asset.name,
        category: asset.category,
        parentId,
        applicableSections: asset.applicableSections as unknown as object,
        valueChainStage: asset.valueChainStage,
        evidenceType: asset.evidenceType,
        keywords: asset.keywords ? (asset.keywords as unknown as object) : undefined,
        programProfileFit: asset.programProfileFit
          ? (asset.programProfileFit as unknown as object)
          : undefined,
        narrativeSnippet: asset.narrativeSnippet,
        keyNumbers: asset.keyNumbers ? (asset.keyNumbers as unknown as object) : undefined,
        status: asset.status,
        version: 1,
        sourceReferences: asset.sourceReferences
          ? (asset.sourceReferences as unknown as object)
          : undefined,
        lastReviewedAt: new Date(asset.lastReviewedAt),
        createdById: null,
        updatedById: null,
      },
      update: {
        name: asset.name,
        category: asset.category,
        parentId,
        applicableSections: asset.applicableSections as unknown as object,
        valueChainStage: asset.valueChainStage,
        evidenceType: asset.evidenceType,
        keywords: asset.keywords ? (asset.keywords as unknown as object) : undefined,
        programProfileFit: asset.programProfileFit
          ? (asset.programProfileFit as unknown as object)
          : undefined,
        narrativeSnippet: asset.narrativeSnippet,
        keyNumbers: asset.keyNumbers ? (asset.keyNumbers as unknown as object) : undefined,
        status: asset.status,
        sourceReferences: asset.sourceReferences
          ? (asset.sourceReferences as unknown as object)
          : undefined,
        lastReviewedAt: new Date(asset.lastReviewedAt),
      },
    })
    upserted += 1
    console.log(`  ✓ ${asset.id} (child of ${parentId})`)
  }

  const total = await prisma.contentAsset.count()
  const topLevel = await prisma.contentAsset.count({ where: { parentId: null } })
  const children = total - topLevel
  console.log(
    `\n[seed-content-assets] 완료 — upsert ${upserted} 종 · DB 총 ${total} 종 (top-level ${topLevel} · children ${children})`,
  )
}

main()
  .catch((e) => {
    console.error('[seed-content-assets] 실패:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
