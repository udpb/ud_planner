/**
 * ProgramDesignPattern 추출 프롬프트 (ADR-028 · BR-1)
 *
 * 핵심 원칙 (프롬프트에 그대로 강제):
 *  1) 원문에 없는 값 = null + confidence 0 — 추측 채움 절대 금지
 *     (강의 분류 v5.4 "[파악 불가]" 원칙의 JSON 등가물)
 *  2) 모든 non-null 값에 원문 인용 evidence(≤200자) 1개 이상
 *  3) enum 밖 관찰값은 '기타' 로 분류하되 evidence 에 원문 표현 보존 (조용히 버리지 말 것)
 *  4) 금액 = 원 단위 정수 · 비율 = 0~100 정수
 *  5) intensity 는 LLM 산출 대상 아님 (코드 파생 — 프롬프트에서 요구하지 않음)
 *
 * 권장 어휘(VOCAB)는 가변 데이터 — enum 값 추가는 자유 (ADR-028).
 */

export interface ExtractionPromptInput {
  projectName: string
  client: string | null
  channel: string | null
  year: number | null
  fullText: string
}

/** 권장 어휘 — ProgramProfile v1.1 + ADR-028 표 + 강의 분류 v5.4 정합. */
export const VOCAB = {
  targetStage: ['예비창업_아이디어무', '예비창업_아이디어유', 'seed', 'pre-A', 'series-A이상', '소상공인', '비창업자'],
  demographic: ['무관', '여성', '청소년', '대학생', '청년', '시니어', '임직원', '상인', '장인', '디자이너', '일반소상공인'],
  geography: ['일반', '로컬', '글로벌_한국인바운드', '글로벌_공통', '일본', '인도'],
  channel: ['B2G', 'B2B', 'renewal'],
  clientTier: ['중앙부처', '지자체', '공공기관', '대학', '대기업', '중견기업', '재단/비영리'],
  preLearningTypes: ['없음', 'LMS_VOD', '사전진단', '사전과제'],
  diagnostics: ['DOGS', 'ACTT', '5D'],
  deliveryMode: ['온라인', '오프라인', '하이브리드'],
  syncType: ['실시간', 'VOD', '혼합'],
  rhythm: ['주1회', '주2회', '격주', '집중캠프', '혼합'],
  timeOfDay: ['주간', '저녁', '주말', '종일'],
  ratioBasis: ['명시', '추정'],
  coachingTypes: ['1:1', '팀전담', '그룹', '온라인후속'],
  peerDevices: ['동료리뷰', '커뮤니티', '네트워킹'],
  milestoneType: ['중간공유회', '데모데이', 'IR', '네트워킹', '박람회', '해커톤', '경진대회'],
  milestoneTiming: ['초반', '중반', '종반'],
  selectionMethods: ['서류', 'PT', '면접', '진단'],
  deliverables: ['사업계획서', 'IR덱', 'MVP', '프로토타입', '브랜드', '매출실적'],
  incentiveTypes: ['사업화지원금', '시제품비', '상금', '후속연계'],
  facultyTypes: ['전담코치', '외부전문가', '연사', '동문코치'],
  venueTypes: ['고정교육장', '현장방문', '합숙시설', '온라인', '지역거점'],
  completionCriteria: ['출석률', '과제', '결과물', '발표'],
  aftercareTypes: ['없음', 'alumni', '후속보육', '투자연계', '온라인코칭'],
  contentDeliveryFormats: ['강연', '경험담', '인터뷰·대담', '워크숍·실습', '데모·시연', '패널'],
  contentTypes: ['이론·개념', '사례·경험', '실무·도구', '트렌드·인사이트'],
  difficultyArc: ['단일', '상승', '혼합'],
  validityStatus: ['상시유효', '점검필요', '폐기후보'],
} as const

const fmt = (arr: readonly string[]) => arr.join(' | ')

/**
 * WinningProposalDoc 1건 → ProgramDesignPattern 추출 프롬프트.
 * 응답은 JSON 만 (extractionOutputSchema 형태 — docId/intensity/extractionMeta 제외).
 */
export function buildExtractionPrompt(input: ExtractionPromptInput): string {
  return `당신은 교육 프로그램 제안서 분석 전문가다. 아래 당선 제안서 원문에서 "프로그램 운영 설계" 정보를 구조화 JSON 으로 추출하라.

## 절대 원칙 (위반 시 전체 무효)
1. **원문에 없는 정보는 절대 만들지 마라.** 해당 축은 "value": null, "confidence": 0, "evidence": [] 로 둔다. 추정·일반 상식 채움 금지.
2. **null 이 아닌 모든 축의 evidence 배열에 원문에서 그대로 인용한 문구(각 200자 이하)를 1개 이상** 넣어라. 인용은 원문 표현 그대로 (요약·변형 금지, 길면 앞부분만 잘라서).
3. 아래 권장 값 목록에 없는 관찰값은 "기타" 로 분류하되, evidence 에 원문 표현을 보존하라. 조용히 버리지 마라.
4. 금액은 **원 단위 정수** (예: 3억 원 → 300000000, 500만원 → 5000000). 비율(%)은 **0~100 정수**.
5. confidence: 원문에 명시적·정량적으로 적혀 있으면 0.8~1.0, 문맥상 분명하지만 표현이 간접적이면 0.5~0.7, 단서가 약하면 0.1~0.4. value 가 null 이면 반드시 0.
6. OCR 로 추출된 원문은 표가 깨져 있을 수 있다. 커리큘럼 회차표를 신뢰성 있게 복원할 수 없으면 sessions 의 value 는 [] (빈 배열) 로 둬라. 억지 복원 금지.
7. 응답은 **JSON 만** 출력하라. 마크다운 펜스·설명문 금지.

## 공통 축 구조
모든 축은 { "value": <축별 구조 또는 null>, "confidence": 0~1, "evidence": ["원문 인용", ...] } 형태다.
profileSnapshot·operatingFormat 의 각 축뿐 아니라 **contentMix·sessions·validity·kpiTargets 도 동일한 축 래퍼**다 — "value" 래퍼 없이 평면 객체·문자열로 반환하지 마라.
예: "validity": { "value": { "status": "상시유효", "reason": null }, "confidence": 0.9, "evidence": ["오프라인 집합교육을 원칙으로 운영"] }

## 출력 JSON 구조 (이 키 이름 그대로, 빠짐없이)
{
  "profileSnapshot": {
    "targetStage": { "value": "<${fmt(VOCAB.targetStage)} | 기타>", ... },
    "demographic": { "value": ["<${fmt(VOCAB.demographic)} | 기타>"], ... },
    "businessDomain": { "value": ["<업종/도메인 — 예: 식품/농업, 문화/예술, IT/TECH, ALL>"], ... },
    "geography": { "value": "<${fmt(VOCAB.geography)} | 기타>", ... },
    "channel": { "value": "<${fmt(VOCAB.channel)} | 기타>", ... },
    "clientTier": { "value": "<${fmt(VOCAB.clientTier)} | 기타>", ... },
    "scale": { "value": { "budgetKrw": <원 단위 정수|null>, "participants": <명 정수|null>, "durationMonths": <개월 수|null> }, ... },
    "methodologySignals": { "value": ["<원문에 등장하는 방법론 — 예: IMPACT, ACT Canvas, 디자인씽킹, 린스타트업>"], ... }
  },
  "operatingFormat": {
    "preLearning": { "value": { "types": ["<${fmt(VOCAB.preLearningTypes)} | 기타>"], "diagnostics": ["<${fmt(VOCAB.diagnostics)} | 기타>"], "hours": <숫자|null> }, ... },
    "deliveryMode": { "value": { "mode": "<${fmt(VOCAB.deliveryMode)}|null>", "onlineRatio": <0~100 정수|null>, "syncType": "<${fmt(VOCAB.syncType)}|null>" }, ... },
    "cadence": { "value": { "totalSessions": <총 회차 정수|null>, "rhythm": "<${fmt(VOCAB.rhythm)} | 기타|null>", "campDays": <캠프 일수|null> }, ... },
    "sessionLength": { "value": { "hoursPerSession": <회당 시간|null>, "timeOfDay": "<${fmt(VOCAB.timeOfDay)}|null>" }, ... },
    "theoryPracticeRatio": { "value": { "lecturePct": <0~100 정수|null>, "practicePct": <0~100 정수|null>, "basis": "<${fmt(VOCAB.ratioBasis)}|null>" }, ... },
    "coaching": { "value": { "types": ["<${fmt(VOCAB.coachingTypes)} | 기타>"], "totalRounds": <총 회수 정수|null>, "hoursPerRound": <회당 시간|null>, "coachToTeamRatio": "<예: 1:5|null>", "pairing": "<매칭 방식 설명|null>" }, ... },
    "cohortStructure": { "value": { "isCohort": <true|false|null>, "teamBased": <true|false|null>, "teamSize": <팀당 인원|null>, "tracks": <트랙 수|null>, "peerDevices": ["<${fmt(VOCAB.peerDevices)} | 기타>"] }, ... },
    "milestoneEvents": { "value": [ { "type": "<${fmt(VOCAB.milestoneType)} | 기타>", "timing": "<${fmt(VOCAB.milestoneTiming)}|null>" } ], ... },
    "selectionFunnel": { "value": { "stages": <선발 단계 수|null>, "methods": ["<${fmt(VOCAB.selectionMethods)} | 기타>"], "competitionRatio": "<예: 5:1|null>", "midDropGate": <중간 탈락 게이트 존재 true|false|null> }, ... },
    "actionWeek": { "value": { "count": <액션위크/실행주간 수|null>, "placement": "<배치 설명|null>" }, ... },
    "deliverables": { "value": ["<${fmt(VOCAB.deliverables)} | 기타>"], ... },
    "incentives": { "value": { "types": ["<${fmt(VOCAB.incentiveTypes)} | 기타>"], "amounts": [ { "label": "<항목명>", "amountKrw": <원 단위 정수|null> } ] }, ... },
    "faculty": { "value": { "types": ["<${fmt(VOCAB.facultyTypes)} | 기타>"], "headcount": <투입 인원|null>, "dedicatedPm": <전담 PM 존재 true|false|null> }, ... },
    "venue": { "value": ["<${fmt(VOCAB.venueTypes)} | 기타>"], ... },
    "assessment": { "value": { "completionCriteria": ["<${fmt(VOCAB.completionCriteria)} | 기타>"], "attendanceThreshold": <출석률 기준 % 0~100 정수|null> }, ... },
    "aftercare": { "value": { "types": ["<${fmt(VOCAB.aftercareTypes)} | 기타>"], "duration": "<기간 표현|null>" }, ... }
  },
  "contentMix": { "value": { "deliveryFormats": ["<${fmt(VOCAB.contentDeliveryFormats)} | 기타>"], "contentTypes": ["<${fmt(VOCAB.contentTypes)} | 기타>"], "difficultyArc": "<${fmt(VOCAB.difficultyArc)}|null>" }, ... },
  "sessions": { "value": [ { "no": <회차 번호>, "title": "<회차 제목>", "hours": <시간|null>, "format": "<강의/워크숍/코칭/이벤트 등|null>", "isTheory": <true|false|null>, "isCoaching": <true|false|null>, "isEvent": <true|false|null> } ], ... },
  "validity": { "value": { "status": "<${fmt(VOCAB.validityStatus)}>", "reason": "<이유|null>" }, ... },
  "kpiTargets": { "value": [ { "metric": "<지표명 — 예: 수료율, 만족도>", "targetValue": <숫자|null>, "unit": "<%|점|건|명|null>", "raw": "<원문 표현 — 예: 85% 이상>" } ], ... }
}

위 구조에서 "..." 는 각 축의 "confidence" 와 "evidence" 키를 의미한다 — 모든 축에 반드시 포함하라.

## 축별 힌트
- "후속 온라인 코칭 2회", "2박 3일 집중 해커톤", "전국 5개 권역 30개 거점" 같은 문구가 coaching / cadence·캠프 / venue 의 전형적 근거다.
- 예산은 제안서 본문에 없을 수 있다 (과업지시서 별도) — 그 경우 null.
- validity: 운영 모델이 특정 시기에만 유효한 경우 (예: 코로나로 강제된 전면 비대면) "점검필요" 또는 "폐기후보" + reason. 일반적이면 "상시유효".
- contentMix 는 커리큘럼 전체의 전달 형식·콘텐츠 유형 구성을 본다 (전달 형식과 콘텐츠 유형은 독립 축이다).

## 문서 메타 (참고용 — 원문과 모순되면 원문 우선)
- 프로젝트명: ${input.projectName}
- 발주처: ${input.client ?? '(미상)'}
- 채널(시트 기재): ${input.channel ?? '(미상 — 원문에서 추론하라)'}
- 연도: ${input.year ?? '(미상)'}

## 제안서 원문
<제안서원문>
${input.fullText}
</제안서원문>

JSON:`
}
