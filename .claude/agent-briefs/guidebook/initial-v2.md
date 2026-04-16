# 가이드북 v2 최초 작성 브리프

## 🎯 Mission

언더독스 PM(신입 포함) 을 위한 **OJT 배포용 제안서 기획 가이드북** 을 마크다운으로 `docs/guidebook/` 에 작성. 이전 v1 (HTML) 의 구조를 **대폭 개선** — 시스템과 분리·사례 중심·Practical 지향.

## 📋 Context

**이전 v1 의 문제:**
- 6단계 파이프라인 설명이 시스템 코드와 중복
- "What" 은 있고 "How" 가 약함
- 사례 3건 중 일부만 선명 (NH 애그테크·GS리테일·코오롱 프로보노)
- 체크리스트가 마지막에 몰려 있음

**v2 의 개선:**
- 시스템 기능 설명 **삭제** — 시스템은 시스템대로 돌아감
- Part 3 "케이스북" 을 척추로 — 사례가 앞으로 계속 늘어남
- 각 Chapter 가 **실전 도구 (질문 리스트·체크리스트·의사결정 기준)** 중심
- 새 사례 4건 (안성 · 서촌 · 한지 · 관광) 을 PDF 원본에서 직접 추출해 추가

**사용자 명시 (원문):**
> "가이드북이랑 지금 만드는 시스템은 별개야. 가이드북은 그냥 ojt처럼 배포용이야."
> "사례는 최대한 많아야 해. 앞으로 더 줄거야. 좋은 사례가 많아야 감을 빠르게 익히지"
> "구체적일수록 좋아"
> "사례는 확실하게 메시지가 선명해야 해"

## ✅ Prerequisites

1. 작업 디렉토리: `c:\Users\USER\projects\ud-ops-workspace`
2. 원본 자료 파일 (한글 PDF 텍스트 추출본):
   - `C:/Users/USER/AppData/Local/Temp/ud-pdfs/02-anseong.unpdf.txt` (안성문화장, 67p)
   - `C:/Users/USER/AppData/Local/Temp/ud-pdfs/03-seochon.unpdf.txt` (종로구 서촌, 50p)
   - `C:/Users/USER/AppData/Local/Temp/ud-pdfs/04-hanji.unpdf.txt` (한지문화상품, 34p)
   - `C:/Users/USER/AppData/Local/Temp/ud-pdfs/05-tourism.unpdf.txt` (관광공모전, 78p)
3. v1 HTML 내용 참조 자료 (사용자가 이전 대화에 공유. 요점만 재구성 OK)
4. 브랜드 자산: `src/lib/ud-brand.ts`

## 📖 Read These Files First (순서대로 전부 읽기)

1. **`.claude/agent-briefs/guidebook/README.md`** — 가이드북 정체성·상시 규칙
2. **`.claude/skills/ud-brand-voice/SKILL.md`** — 톤·용어·금지 목록 (§11 중요)
3. **`.claude/skills/ud-design-system/SKILL.md`** — §8 타이포그래피 (마크다운 레벨 결정 참고)
4. **`src/lib/ud-brand.ts`** — 수치·자체도구·Core Values·키 메시지 패턴
5. **`docs/journey/2026-04-15-redesign-kickoff.md`** — 재설계 철학
6. **`docs/journey/2026-04-16-guidebook-review.md`** — v1 리뷰·가이드북 정체성 확정
7. **4개 PDF 원본 (`/tmp/ud-pdfs/` 경로는 아님. `C:/Users/USER/AppData/Local/Temp/ud-pdfs/`):**
   - 02-anseong.unpdf.txt
   - 03-seochon.unpdf.txt
   - 04-hanji.unpdf.txt
   - 05-tourism.unpdf.txt

**읽기 팁:** PDF 추출본은 한글 띄어쓰기가 깨져 있음. 원문 인용 시 조심 — 의미가 명확한 부분만 발췌.

## 🎯 Scope

### ✅ You CAN create
- `docs/guidebook/README.md` — 목차 + 읽는 법
- `docs/guidebook/01-start/*.md`
- `docs/guidebook/02-field/*.md`
- `docs/guidebook/03-casebook/**/*.md`
- `docs/guidebook/04-channel-types/*.md`
- `docs/guidebook/appendix/*.md`

### ❌ You MUST NOT touch
- `src/` 전체 — 가이드북은 시스템과 별개
- `prisma/schema.prisma`
- `docs/architecture/` · `docs/decisions/` — ADR·아키텍처는 별도 트랙
- `docs/journey/` 기존 파일 — 신규 기록은 메인이 담당
- `.claude/` — 브리프/스킬 수정 금지
- `package.json` — 의존성 추가 ❌
- **Git 커밋 금지** — 메인 세션이 담당

## 🛠 Tasks

### Step 1: 구조 파일 생성

`docs/guidebook/README.md`:

```markdown
# 언더독스 제안서 기획 가이드북 v2

> OJT 배포용. 신입 PM 이 이걸 읽고 첫 RFP 받았을 때 첫 주에 뭘 할지 알게 되는 것이 목표.

## 이걸 왜 읽어요
[한 문단 요약 — Part 1 Ch.1 로 링크]

## 얼마나 걸려요
- 처음 읽기: Part 1~2 (30분) + 관심 있는 케이스 2~3개 (30분) = 1시간
- 실전에서 다시 꺼내 보기: 치트시트 (5분)

## 구조
[Part 1~4 + 부록 설명]

## 사례가 계속 늘어나요
Part 3 케이스북은 수주/탈락 경험마다 추가됩니다. 분기에 한 번 확인.

## 읽는 법
- 처음이면: Ch.1 → Ch.2 → 관심 영역 케이스 1~2개
- RFP 받았을 때: Ch.3 → 해당 영역 케이스 → Ch.5 (함정)
- 제출 직전: 부록 A 체크리스트
- 특정 사업 유형 조사: Ch.10 (발주처 타입) → 해당 영역 케이스 전체
```

### Step 2: Part 1 — 시작하기 (2장, 30분 분량)

**`docs/guidebook/01-start/01-why-read.md`**
- 수주 잘 하는 제안서 = 발주처 입장 정확 이해 + 근거로 답하기
- "우리가 잘한다" 가 아니라 "발주처가 원하는 걸 정확히 이해하고, 그 언어로, 근거 있게 답한다"
- 이 가이드북이 주는 것 vs 주지 않는 것 (시스템 사용법은 여기 없음)
- 분량: ~400단어

**`docs/guidebook/01-start/02-five-perspectives.md`** (5가지 관점)
v1 의 "5대 핵심역량" 을 재구성. 아래 5가지를 **질문 형태** 로:

1. **읽는 사람이 납득하는가** — RFP 키워드 그대로 받아서 답하는지, 추상적 표현 대신 수치·사례로 증명하는지
2. **디테일이 완결되어 있는가** — 강사 프로필·시간표·예산 비목·안전관리까지 "다른 사람이 이 제안서만 보고 실행 가능한가"
3. **RFP를 정확히 읽었는가** — 테이블·각주·비고란까지 반영됐는지 (v1 은 이걸 1위 실수로 강조)
4. **경쟁 맥락을 인식했는가** — 내정자 가능성·전년 수행사·경쟁사 차별화
5. **공식 밖 정보를 녹였는가** — 담당자 통화 뉘앙스·슬랙 논의·경영진 코멘트 같은 RFP 밖 정보

각 관점에 **"스스로 점검 3문항"** 넣기. 분량: ~1200단어

### Step 3: Part 2 — 현장 실전 (3장)

**`docs/guidebook/02-field/03-first-24h.md`** (RFP 받은 첫 24시간)

핵심: **담당자에게 묻는 7가지** + **RFP 정밀 분석 체크리스트**

담당자에게 묻는 7가지 (Sassac 의 proposal-planner 패턴 재구성):
1. 올해 변화 포인트는? 발주처 실제 의도는?
2. 발주처와 사전 소통 여부·분위기는?
3. 예상 경쟁사·전년 수행사는?
4. 수주 시 실제 수행 가능 여부·수익률 기대치는?
5. 꼭 넣어야 할 실적 vs 빼야 할 실적은?
6. PM 누구로 할지·투입 인력 확정 여부는?
7. 참고할 제안서·잘 먹혔던 구성·탈락 원인은?

RFP 정밀 분석 체크리스트:
- 사업 목적·과업·대상·규모·예산·기간
- 평가 기준 (항목별 배점·가중치)
- RFP 지정 목차 여부 (있으면 반드시 따름)
- 테이블·각주·비고란 필수 확인
- RFP 반복 키워드·톤

분량: ~1000단어

**`docs/guidebook/02-field/04-impact-value-chain.md`** (Impact Value Chain 사고법)

v1 Ch.3 의 핵심만 재구성 — 사례는 Part 3 로 이동:

- 5계층 정의 (Input · Activity · Output · Outcome · Impact)
- **"그래서?" 테스트** (Activity→Output→Outcome→Impact 사이에 "그래서?" 넣어 끊김 감지)
- **Output vs Outcome 구분** ("뭐가 나왔나" vs "뭐가 달라졌나")
- 이 사고법을 왜 하는가 — 어디서 많이 틀리는가
- **간단한 예 1개** (추상 예시, 아주 짧게) + "구체 사례는 Part 3 로"

분량: ~1200단어

**`docs/guidebook/02-field/05-common-pitfalls.md`** (자주 빠지는 함정)

v1 Ch.14 "Top 7" 재구성. 특히 **코오롱 프로보노 사례** 를 함정 1위로 인용:

1. **Value Chain 없이 장표부터 쓰기** — 코오롱 프로보노 실제 사례 (2주 무한수정 → VC 확정 후 1.5일 완성)
2. 이론 세션만 나열 (Action Week 누락)
3. 모호한 수량 표현 ("많은"·"다양한") vs 정량 포화
4. 예산만 보고 커리큘럼 대충 짜기 — 최고배점 항목 공략 실패
5. 서포터에게 방향 없이 리서치 시키기
6. CSR 사업인데 성과 지표 미준비
7. Section V (RFP 범위 밖 추가 제안) 누락

분량: ~900단어

### Step 4: Part 3 — 케이스북 (가장 중요, 가장 풍부)

**`docs/guidebook/03-casebook/README.md`** — 케이스북 안내

- 모든 케이스는 **동일 포맷**:
  1. 사업 한 줄 요약 (발주처·금액·기간·대상·핵심 과업)
  2. 핵심 메시지 (원문 보존 — 제안사가 쓴 슬로건·선언)
  3. Impact Value Chain 5계층
  4. 차별화 포인트 3개
  5. 언더독스 자체 도구·네트워크가 어떻게 녹았나
  6. **신입 PM 이 이 케이스에서 배울 점** (가장 중요)
- 케이스 읽을 때 유의점

**Ch.6 창업교육 영역 (기존 3건 — v1 자료에서 재구성)**

`03-casebook/06-startup-education/` 폴더에 3개 파일. v1 HTML 에 요약이 있으니 그 내용 기반:
- `nh-agritech.md` — NH 애그테크 (B2G, 농식품 창업)
- `gs-retail.md` — GS리테일 에코 소셜임팩트 (B2B)
- `kolon-probono.md` — 코오롱 프로보노 (B2B · 위 Ch.5 함정 1위로도 인용)

분량: 각 600~800단어

**Ch.7 로컬·상권 영역 (신규 1건)**

`03-casebook/07-local-commerce/jongno-seochon.md` — **2025 종로구 서촌 로컬브랜드 상권강화**
- 원본: `C:/Users/USER/AppData/Local/Temp/ud-pdfs/03-seochon.unpdf.txt`
- **이 사례는 특별히 풍부하게** — 사용자 피드백: "가장 메시지 선명"
- 핵심 메시지: "머무는 온기, 서촌" · "'머무는 장소'에서 '머물고 싶은 기억'으로"
- 구성 요소 (신입이 재사용할 부품): 상권강화기구 3원 체계, 브랜딩 액션러닝 5주, 릴레이 집들이, 서촌 집주인, 서촌 수다방, 지역경험단 4유형
- Value Chain 인과 사슬 정확히 서술
- 분량: 1200~1500단어

**Ch.8 문화·관광 영역 (신규 3건)**

- `03-casebook/08-culture-tourism/tourism-souvenir.md` — **2025 관광공모전 + 관광기념품 박람회**
  - 원본: 05-tourism.unpdf.txt (13.2억, 가장 큰 규모)
  - 핵심 메시지: "Streaming K-Souvenir — 세계인의 관광 플레이리스트에 K-Souvenir을 스트리밍"
  - 정량 목표 깔끔: 매출 6억, 수출 1억, 바이어 상담 200건
  - 공모 + 박람회 + 유통 + 글로벌 복합 과업 패턴
  - 분량: 1200~1500단어

- `03-casebook/08-culture-tourism/hanji-design.md` — **2025 한지문화상품 디자인 공모전**
  - 원본: 04-hanji.unpdf.txt (1억)
  - 핵심 메시지: "Hanji Re:Craft — 전통을 넘어, 삶에 닿다" · "한지, 가능성의 확장"
  - 특별히 주목할 것: **Startup 6 Dimension 자체 진단도구 + 맞춤형 코치 + 액션클럽 + 라이콘 투자** 4단 사후관리
  - 대중심사단 30명이 3차 최종심사에 10점 정량 반영
  - 분량: 900~1200단어

- `03-casebook/08-culture-tourism/anseong-glocal.md` — **2025 안성문화장 글로컬 특화사업**
  - 원본: 02-anseong.unpdf.txt (6.5억)
  - 핵심 메시지: "Weaving Heritage, Sharing Culture — 유산을 엮어 세계로 나누다"
  - 글로벌 인프라 (도쿄 지사·아시아투모로우·메종&오브제) 활용 패턴
  - **Value Chain 이 복잡한 편 — 신입이 배울 점에 "복잡한 사업을 어떻게 5계층으로 정리하는가" 를 포인트로**
  - 분량: 900~1200단어

**Ch.9 글로벌 진출 영역 (1건)**

- `03-casebook/09-global/yebi-global.md` — **2025 예비창업패키지 글로벌 진출 프로그램**
  - 원본 PDF 는 이미지 기반이라 텍스트 추출 거의 불가
  - 간략 요약만 (500단어 이내) + "원본 참조 필요" 명시

### Step 5: Part 4 — 발주처 타입 전략

**`docs/guidebook/04-channel-types/10-b2g-b2b-renewal.md`**

B2G · B2B · 재계약 3종 카드 (v1 Ch.12 재구성 + 풍부화). 각 타입별:
- 키 메시지 방향
- 제안서 구조 특성
- 평가위원 프로필
- 예산 톤
- 커리큘럼 설계 특성 (이론 비율·Action Week)
- **주의사항** (v1 에서 강조한 것 살림: B2G 는 "너무 혁신적 표현 위험")
- 해당 타입 케이스북 링크 (Ch.6~9 로 크로스 레퍼런스)

분량: ~1500단어

### Step 6: 부록

**`docs/guidebook/appendix/a-final-checklist.md`** — 제출 직전 체크리스트
- 구조 점검 (Value Chain 일관성·평가배점 공략·Activity/Outcome 인과)
- 콘텐츠 점검 (정량 수치 구체성·자체 도구 명칭 정확성·4중 지원 체계·Section V)
- 형식 점검 (오타·비문·파일 깨짐·디자인 정렬·연도 수치·페이지 수 제한)

각 항목 체크박스 형식.

**`docs/guidebook/appendix/b-ud-assets.md`** — 언더독스 자산 참고표
- 브랜드 수치 (UD_TRACK_RECORD 참조)
- 자체 개발 도구 (UD_PROPRIETARY_TOOLS)
- IMPACT 6단계 (I-M-P-A-C-T)
- 4중 지원 체계 (UD_SUPPORT_LAYERS)
- Core Values 4개 (UD_CORE_VALUES)

**수치는 반드시 `src/lib/ud-brand.ts` 에서 확인 후 인용** — 기억·추측 금지.

### Step 7: 교차 검증

작성 완료 후 스스로 체크:
- [ ] 오타·고유명사 확인 (코오롱 프로보노 · NH 애그테크 · ACT-PRENEURSHIP 등)
- [ ] 수치는 ud-brand.ts 와 일치
- [ ] 브랜드 보이스 SKILL §11 위반 없음 (AI 코치 별도 레이어 금지)
- [ ] 케이스 8건 전부 동일 포맷
- [ ] 파일명 kebab-case, 폴더 구조 브리프 일치
- [ ] 각 파일 상단에 **이 챕터를 읽으면 무엇을 알게 되는가** 1문장

## 🔒 Tech Constraints

- **마크다운만** (frontmatter `---` 없이 순수 본문 — 내부 문서용)
- **이미지·HTML 임베드 ❌**
- **코드 블록** 은 최소한만 (체크리스트·용어 등)
- **상대 경로 링크** 만 (외부 URL ❌)
- **최상단 제목은 `#` 하나, h2 는 `##` ...** — SKILL 타이포 스케일과 호환

## ✔️ Definition of Done

- [ ] `docs/guidebook/README.md` + 4개 Part + 부록 구조 완성
- [ ] Part 1 (Ch.1~2), Part 2 (Ch.3~5), Part 4 (Ch.10), 부록 (A·B) — 각 1~2 파일
- [ ] Part 3 케이스북 **8개 파일** (NH·GS·코오롱 + 서촌·관광·한지·안성 + 예비창업글로벌)
- [ ] 8개 케이스 모두 동일 포맷 (6개 섹션)
- [ ] 서촌·관광 케이스는 1200+ 단어 (가장 풍부)
- [ ] 고유명사 오타 0
- [ ] ud-brand-voice SKILL §11 위반 0
- [ ] 수치 인용이 ud-brand.ts 와 일치
- [ ] 상대 경로 링크 동작 (README 에서 각 챕터로)

## 📤 Return Format

```
가이드북 v2 완성.

생성 파일 (X개):
[파일 트리]

총 분량: 약 Y 단어
주요 챕터:
- Part 1 시작하기 (Ch.1~2): ...
- Part 2 현장 실전 (Ch.3~5): ...
- Part 3 케이스북 (Ch.6~9, 8 케이스): ...
- Part 4 타입 전략 (Ch.10): ...
- 부록 (A·B): ...

PDF 분석에서 새로 뽑은 것:
- 서촌: [특징]
- 관광: [특징]
- 한지: [특징]
- 안성: [특징]

검증:
- 고유명사 확인: ✅
- SKILL §11: ✅
- ud-brand.ts 수치 대조: ✅

주의 / 이슈:
- [원본 PDF 의 한글 깨짐 구간 등]
- [v1 에만 있고 원본 확보 안 된 케이스는 어떻게 처리했는지]

사용자 확인 필요 지점:
- [있다면 — 예: 특정 사례 해석이 애매한 부분]
```

## 🚫 Do NOT

- `src/` · `prisma/` · `.claude/skills/` · `.claude/agent-briefs/` (다른 곳) 수정
- Git 커밋 (메인이 담당)
- 새 의존성 설치
- 고유명사 추측으로 쓰기 — 원본 확인
- v1 의 구조를 그대로 복사 — v2 는 재구성이 핵심
- 시스템 사용법·ud-ops UI 기능 설명
- AI 코치를 별도 상품/레이어로 표현
- Underdog 을 동정 프레임으로 사용
- 사례 간 중복 문구 (각 케이스 고유 메시지 보존)
- 한 문서에 1000단어 이상 한 블록으로 넣기 — 소제목으로 쪼갤 것

## 💡 Hints

- PDF 추출본 읽을 때: 제안 목적·특징·Activity·Output·차별화 섹션 위주로 스캔. 중간 표 데이터는 띄어쓰기 깨져있어도 핵심 단어 조합으로 의미 파악 가능.
- 원문 직접 인용은 **따옴표** 로 표시: `> "머무는 온기, 서촌"`
- 신입 PM 관점으로 쓰기: "이 케이스에서 베낄 수 있는 구성 요소" 를 **반드시** 마지막 섹션에 명시
- 브랜드 수치는 `UD_TRACK_RECORD` 에서 그대로 인용 — 오래된 "800명 코치" 는 유지, "261명 액션코치" 는 사례 원문의 다른 지표
- 에이전트는 **상세함을 두려워하지 말 것** — 사용자가 "구체적일수록 좋아" 명시

## 🏁 Final Note

이 가이드북은 **계속 성장** 하는 자산. 이번이 v2 초판. 구조 (특히 케이스북 포맷) 가 안정되어야 앞으로 사례 추가가 쉬움. **포맷 일관성 > 개별 케이스의 완벽함** 이 우선.

분량 가이드: 총 15,000~20,000 단어 (v1 이 약 12,000 단어 수준). 케이스북이 절반 이상 차지.
