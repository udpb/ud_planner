'use client'

import { useState } from 'react'
import { RfpParser } from './rfp-parser'
import { AiPanel } from './ai-panel'

interface Props {
  projectId: string
  initialRfpParsed: any
  initialLogicModel: any
  curriculum: any[]
  proposalSections: any[]
}

/**
 * RfpParser와 AiPanel이 rfpParsed / logicModel 상태를 공유하는 wrapper.
 * 파싱 완료 즉시 AiPanel이 활성화됩니다.
 */
export function ProjectAiWrapper({
  projectId,
  initialRfpParsed,
  initialLogicModel,
  curriculum,
  proposalSections,
}: Props) {
  const [rfpParsed, setRfpParsed] = useState<any>(initialRfpParsed)
  const [logicModel, setLogicModel] = useState<any>(initialLogicModel)

  return (
    <div className="w-80 shrink-0 space-y-4">
      <RfpParser
        projectId={projectId}
        initialParsed={rfpParsed}
        onParsed={(parsed) => setRfpParsed(parsed)}
      />
      <AiPanel
        projectId={projectId}
        rfpParsed={rfpParsed}
        logicModel={logicModel}
        onLogicModelGenerated={(lm) => setLogicModel(lm)}
        curriculum={curriculum}
        proposalSections={proposalSections}
      />
    </div>
  )
}
