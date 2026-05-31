# ADR-015: Wave V — Express+Deep 완전 통합 + AI 자동 채움 패러다임

> ⚠️ **상태 정정 (2026-06-01):** 부분 구현됨(ux-v2 5 Stage). "단일 shell 동일 레이아웃" 가정은 **ADR-018 로 대체**. 통합 방향은 ADR-019(과업 레이어)/ADR-021(단일 엔진, 예정)로 계승. 원안 그대로는 진행 안 함.

- **상태**: Draft → 부분 구현/일부 대체 (ADR-018·019)
- **결정일**: 2026-05-19
- **결정자**: udpb@udimpact.ai + AI Architect
- **관련**: ADR-011 (Express 메인 패러다임), ADR-013 (Express 2.0 자동 진단), ADR-014 (Wave U UX 재설계)
- **승계**: 이 ADR 이 채택되면 ADR-011/013 의 "Express vs Deep 두 화면" 가정 폐지.

---

## 배경

Wave U (UX 재설계 + ActionAI 디자인 토큰, 2026-05-19) 완료 후 사용자 풀테스트에서 **본질적 11개 이슈** 발견.

### 사용자 직접 피드백 원문 (압축)

> 1. RFP 날짜 파싱 여전히 안 됨
> 2. 우측 탭 클릭 시 뭐가 바뀌는지 모름
> 3. 검수 카드 스크롤 안 됨
> 4. RFP 분석하면 Deep 자동으로 꽂혀야 하는데 표시 0
> 5. 외부 리서치 카드 복잡 — "이런 거 리서치할까요? Y" 하면 AI 가 자동 리서치하면 어때?
> 6. **PM 이 결정·튜닝하는 흐름이 자연스러워야 — AI 가 빠르게 60%까지 채우고, PM 은 검수·결정만**
> 7. **Express 와 Deep 통합 — 어차피 끝까지 끌고 가는 거니까**
> 8. 기획 품질 카드 순서와 Deep step 순서 mismatch
> 9. **담당자 질문 카드가 프로젝트마다 같으면 안 됨 — 진짜 궁금한 것 vs 대화 잘 되면 물어볼 것**
> 10. Cmd+K · Risk · SMART 등 Wave U 가 화면에 반영됐는지 모름
> 11. **2번 일 하는 거 최소화 — 코치도 RFP 기반 5x 자동 추천**

8·10 은 Wave U 후속 패치 (B1~B5, D1~D4, E1~E3) 로 해소.
**남은 6 개 (5·6·7·9·11 + 그 자연스러운 귀결) 는 단순 UI 패치로 해결 불가능 — 패러다임 전환 필요.**

### 본질적 문제 — ADR-013 Express 2.0 의 한계

Express 2.0 (2026-05-03) 가 "AI 는 콘텐츠 생성자 → 오케스트레이터·자동 진단자" 로 전환했지만, 여전히:
- **콘텐츠 작성 부담은 PM 에게** (12 슬롯 챗봇 답변)
- **외부 리서치는 PM 이 직접** (외부 LLM 카드 + PM 직접 카드)
- **Express vs Deep 두 화면 분리** — PM 이 어디로 가야 할지 매번 결정

사용자 통찰:
> "AI 가 빠르게 채우고 흐름 잡고 → PM 튜닝/결정/질문 답변만. 어차피 끝까지 끌고 갈 거니까 통합."

이는 ADR-013 의 자연스러운 확장 — **"AI 콘텐츠 빌더 + PM 결정자"**.

### 외부 벤치마킹 추가 (2026-05-19)

1. **Cursor / Lovable**: "Agent mode" — AI 가 통째 작성, 사용자는 review·revise. 콘텐츠 작성 부담 0.
2. **Notion AI / v0**: prompt 입력 한 번 → 완성도 70~80% 산출물 → 사용자는 inline 편집.
3. **Linear / Stripe Dashboard**: 한 페이지에 모든 stage 가 progressive disclosure 로. URL 분리 없음.
4. **arphie.ai (RFP 자동화)**: 1 RFP → 1 click → 80% 초안 + 약점 lens 알림. Loopio 17.5h → 6h.

---

## 결정

**Wave V** 로 **5 Stage 완전 통합 단일 화면 + AI 자동 채움 패러다임** 채택.

### 1. 단일 URL — Express/Deep 분리 폐지

```
이전:                                현재:
/projects/[id]            (Deep)     /projects/[id]   ← 단일 진입점
/projects/[id]/express    (Express)  /projects/[id]/express → /projects/[id] (301)
```

**한 페이지에 모든 작업**. PM 이 "어느 화면?" 결정 X.

### 2. 5 Stage Progressive Disclosure

같은 한 페이지, NorthStarBar 진행도에 따라 카드 자동 펼침/접힘. NowBar 단일 CTA 가 stage 전환의 단일 진실.

| Stage | 활성 시 펼침 | 비활성 시 접힘 (1줄 sticky) |
|---|---|---|
| **S1 — RFP 분석** | RFP 분석 결과 + 자동 채움 토글 (P2) | "RFP ✓ · 165M · B2G · 평가배점 5개" |
| **S2 — 1차본 작성** | 좌 챗봇 + 우 7섹션 미리보기 + SMART + Risk | "1차본 60% · 핵심 한 줄 + 톤" |
| **S3 — 검수** | Inspector 7 렌즈 + 약점 lens 자산 추천 (inline diff) | "검수 78점 · critical 0 · 자산 6 추가됨" |
| **S4 — 정밀 편집** | 커리큘럼·코치·예산·제안서 4 카드 (각 inline 편집) | "12회차 · 8 코치 · 마진 18% · 7/7 섹션" |
| **S5 — 최종 승인·제출** | 발주처 템플릿 + 임팩트 forecast + 검수 통과 배지 | "✓ 1차본 완성 · 사회적 가치 2.3억" |

### 3. AI 자동 채움 (Pull-Auto Mode)

**기본 ON** — RFP 업로드 직후 AI 가 자동으로:

| 자동 채움 항목 | 입력 source | 출력 |
|---|---|---|
| 사업명·발주·예산·날짜·평가배점·키워드 | RFP 본문 | Project 필드 |
| **Logic Model** (impact·outcome·activity·input) | RFP + impact-goal AI | Project.logicModel |
| **자산 매칭** (Top 10 + matchScore) | RFP keywords + ProgramProfile | matchAssetsToRfp |
| **커리큘럼 outline** (5~12회차) | RFP + Logic Model | curriculum 시드 (F2) |
| **코치 풀** (필요수×5 추천) | RFP + ProgramProfile + coaches_directory | 추천 풀 (F1) |
| **예산 시드** | 코치 수 + 회차 + 인건비 기본값 | budget AC/PC 시드 (F2 일부) |
| **사회적 가치 forecast** | curriculum + impact-measurement DB | impactForecast |
| **intent / Before·After / keyMessages / sections 1·2·6** | RFP + 자산 + 과거 수주 사례 | expressDraft 60% (F5) |
| **Risk Mitigation 3~5건** | 1차본 + 채널 | risks 시드 ✅ (Wave U U5) |
| **외부 리서치 evidence** | 채널·전략·시장 통계 키워드 | evidenceRefs 자동 누적 (F3) |

**토글 가능** — PM 이 "안 자동 채움 (수동 모드)" 으로 fallback 가능 (안전망).

### 4. PM 개입 9 지점 (콘텐츠 작성 X — 결정·튜닝·승인만)

| # | 시점 | PM 액션 | 소요 시간 | 콘텐츠 생산자 |
|---|---|---|---|---|
| **P1** | 프로젝트 생성 | RFP 파일 1개 업로드 | 30초 | — |
| **P2** | RFP 분석 직후 | "어디까지 자동 채워볼까요?" [전체 60% / 주요 섹션만 / 빈 상태] 1 선택 | 5초 | — |
| **P3** | 채널 진단 후 | AI 가 추론한 B2G/B2B/renewal **컨펌** 또는 변경 | 10초 | AI |
| **P4** | 메인 솔루션 결정 | AI 3안 (Before/After·keyMessage·기획 톤) 중 **1 선택** | 1분 | AI 3안 |
| **P5** | 차별화 자산 검토 | AI 추천 5~7건 → **토글 수락/거절** | 3분 | AI 매칭 |
| **P6** | 코치 풀 선택 | RFP 기반 필요수×5 추천 → **N명 클릭** | 5분 | AI 매칭 (F1) |
| **P7** | Risk Mitigation | AI 자동 제안 3~5건 → **수락 + 자체 추가 1~2** | 5분 | AI 제안 |
| **P8** | 검수 결과 튜닝 | Inspector 약점 lens 보강 (자산 추가 클릭) | 10분 | AI 추천 |
| **P9** | 최종 승인 | NowBar "✓ 1차본 승인 + 검수" 1 클릭 → Deep 자동 진입 → 정밀 편집 시작 | 5초 | — |

**합계 ≈ 24분 + AI 호출 대기 15~20분 = 30~45분 (북극성 충족).**
**PM 은 단 한 줄도 작성하지 않음. 결정만.**

### 5. 5 안전망 (결과물 퀄리티 보증)

| # | 안전망 | 상태 |
|---|---|---|
| **Q1 — Inline citation** | 모든 AI 작성 부분에 `[근거: 출처 \| YYYY.MM \| URL]` 마커 → 평가위원 검증 가능 | ✅ Wave U U3 |
| **Q2 — SMART checklist** | Before/After 5축 실시간 휴리스틱 | ✅ Wave U U4 |
| **Q3 — Risk Mitigation** | 평가위원 의심 능동 답변 | ✅ Wave U U5 |
| **Q4 — Inspector 7 렌즈** | 채널별 가중치, 약점 lens 자산 추천 | ✅ Phase L5 |
| **Q5 — impact-measurement** | 사회적 가치 SROI forecast (16 카테고리 정량) | ✅ Wave M-Impact |

→ AI 가 빠르게 채워도 **모든 부분 verifiable + 검수 통과 게이트** 후 승인.

### 6. 2번 일 제거 — 한 번 입력 → 모든 화면 자동 전파

| 한 번 입력 | 자동 전파 대상 |
|---|---|
| **RFP 업로드 1회** | 사업명·발주·예산·날짜·평가배점·키워드·Logic Model·자산 매칭·코치 추천 5x·커리큘럼 outline·사회적 가치 forecast |
| **채널 확정 1회** | Inspector 가중치·사이드바·진단 lens·평가표 시뮬레이션 또는 작년 자료 추출 |
| **자산 수락 1회** | 차별화 카드·sections 본문 inline citation·markdown export·엑셀 export |
| **1차본 승인 1회** | Project 필드 인계·ProposalSection 7건 시드·사전 임팩트 forecast·Deep S4 자동 진입 |
| **검수 1회** | NowBar stage 자동 전환·약점 lens 자산 추천 활성 |

**현재 70% 완성**. 신규 30% 는 F1~F5 에서 채움.

### 7. 담당자 질문 차등화 (must-ask / nice-to-ask) — F4

기존: 모든 프로젝트 동일 8개 PM 직접 카드 체크리스트.
변경:
- **must-ask** (필수): RFP 에서 누락된 정보 (예: 평가배점 가중치, 발주처 우선순위, 예산 한계 등). 프로젝트별로 자동 생성.
- **nice-to-ask** (선택): 대화 흐름이 좋을 때 추가로 물어볼 수 있는 심층 질문. 통화 시간 여유 있을 때만.
- AI 가 RFP 분석 결과 보고 자동 분류.

### 8. UI/UX 일관성 — Wave U 위에 추가 (신규 토큰 X)

| 영역 | 상태 |
|---|---|
| 단일 NowBar CTA | ✅ Wave U U1 |
| Cmd+K palette | ✅ Wave U U2 (E1 후 작동) |
| ActionAI 토큰 (Poppins + 11 컬러) | ✅ Wave U |
| Stage-aware 자동 활성 + 토스트 | ✅ Wave U U7 (5 Stage 로 확장) |
| inline diff 자산 추천 | ✅ Wave U U6 |
| Deep 자동 시드 뱃지 | ✅ B3 (5 Stage 로 흡수) |
| Express ↔ Deep 토글 | 폐지 — 통합으로 불필요 |
| **5 Stage Progressive Disclosure** | 🔲 F5 |

---

## 작업 분할 (F1~F5) — 게이트 단위, 일괄 X

**원칙**: 각 F 작업 완료 후 사용자 화면 확인 게이트 통과 → 다음 진행.

| PR | 작업 | 위임 vs 직접 | 검수 |
|---|---|---|---|
| **F1** | 코치 자동 추천 (RFP→필요수×5 + matchScore + 강점 1줄) | Agent 위임 (점수 알고리즘) + 내가 UI + 검수 | tsc·build·코드 line·화면 |
| **F2** | 커리큘럼 outline 자동 시드 + 예산 시드 | Agent 위임 (AI 프롬프트) + 내가 통합 + 검수 | 동일 |
| **F3** | 외부 리서치 자동 (PM 직접 카드 → AI 자동 evidence) | Agent 위임 + 내가 검수 | 동일 |
| **F4** | 담당자 질문 차등화 (must/nice) | Agent 위임 (휴리스틱) + 내가 통합 | 동일 |
| **F5** | 5 Stage 완전 통합 + URL 통합 + AI 자동 60% 채움 | **내가 직접** (가장 큰 변경) | tsc·build·회귀 테스트 |

**총 추정 시간**: 7~12일 (정확한 추정 어려움 — 각 게이트마다 검수 결과 따라 다름).

### 작업 순서 합리화

1. **F1** (코치) — 사용자 직접 제기, 즉시 효용. 단독 PR.
2. **F2** (커리큘럼·예산 시드) — F1 패턴 재사용. 단독 PR.
3. **F3** (외부 리서치 자동) — Express 챗봇 영향. 단독 PR.
4. **F4** (질문 차등화) — F3 와 함께 챗봇 흐름 영향. F3 다음.
5. **F5** (완전 통합 + 자동 60%) — 가장 큰 변경, F1~F4 위에 layout 재구성. 마지막.

---

## 안전망 (Wave V 자체)

1. **각 F PR 별 게이트** — 사용자 화면 확인 후 다음 진행. 통째 일괄 X.
2. **AI 자동 채움 토글** — Off 면 기존 챗봇 모드 fallback (PM 학습 안전망).
3. **Rollback 가능** — feature flag `EXPRESS_PARADIGM_V3=true/false` (운영 기본 OFF, dev/test 만 ON).
4. **회귀 테스트** — Express → Deep handoff (1차본 승인 + ProposalSection 시드) 가 통합 페이지에서도 동일 작동.
5. **데이터 호환** — expressDraft 스키마 그대로 (risks 등 신규 필드는 optional).
6. **PM 1명 풀테스트** — F5 완료 직후 (Wave V 끝나기 전) PM 실제 작성 + 15분 인터뷰. 데이터 기반으로 ADR-016 후속 결정.

---

## 영향 (Wave V 완료 후)

- ✅ PM 작성 시간 90% ↓ (12 슬롯 챗봇 답변 → 9 결정 클릭)
- ✅ 외부 LLM 왔다갔다 100% ↓ (PM 직접 카드 폐지)
- ✅ Express vs Deep 화면 결정 부담 0 (단일 URL)
- ✅ "2번 일" 0 (RFP 1회 입력 → 모든 화면 자동)
- ✅ 평가위원 신뢰도 ↑↑ (citation·SMART·Risk·Inspector + AI 콘텐츠 검증 게이트)
- ✅ 30~45분 북극성 충족 (지속)

## 위험과 완화

| 위험 | 완화책 |
|---|---|
| AI 환각 — 잘못된 사실 자동 작성 | inline citation 강제 + 검수 게이트 + PM 수정 가능 |
| PM 자동 채움 신뢰 부족 | 토글 가능 + "이거 AI 가 채웠어요" 시각적 표시 (Wave U citation 칩 재사용) |
| Layout 통합 시 회귀 | F5 PR 에서 회귀 테스트 (Express handoff·Deep step 진입 등) |
| 큰 변경 통째 — 학습 부담 | F1~F5 단계별 PR + 사용자 게이트마다 OK |
| Wave U 기능 충돌 | 신규 토큰 X · 신규 컴포넌트 최소 · 기존 컴포넌트 재사용 우선 |

---

## 관련 문서

- [ROADMAP.md](../../ROADMAP.md) — Wave V 섹션
- [CLAUDE.md](../../CLAUDE.md) — 명명 사전 (Wave V 추가)
- ADR-011 (Express 메인 패러다임) · ADR-013 (Express 2.0) · ADR-014 (Wave U)

## 사용자 인용 (의사결정 트레이스)

> "AI가 빠르게 채우고 흐름을 잡고 확인해야 할 포인트나 결정사항들을 질문 떤지는게 담당자 입장에서도 직관성이 높을 것 같은데?"
>
> "Express 랑 Deep이랑 하나로 합치는것도 고민이 필요할 것 같아. 어차피 끝까지 끌고 가야하니까"
>
> "코치도 자동으로 RFP를 기반으로 필요한 코치수의 5배수 정도를 추천해줘. 다시 검색하는 것도 2번 일을 하는거잖아."
>
> "제대로 잘 하는게 중요해. 더 걸려도 되니까 완벽하게 하나씩하고, 에이전트한테 일을 제대로 위임하고 너가 꼼꼼하게 검수해야해."
