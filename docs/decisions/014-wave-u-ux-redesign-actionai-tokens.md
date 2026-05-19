# ADR-014: Wave U — UX Redesign + ActionAI Design Token Migration

- **상태**: Accepted · 구현 완료 (2026-05-19)
- **결정일**: 2026-05-19
- **결정자**: udpb@udimpact.ai + AI Architect
- **관련**: ADR-011 (Express Mode 메인 패러다임), ADR-013 (Express 2.0)
- **구현 commit**: (이 ADR 과 같은 commit — U1~U7 + 토큰 + sweep)

## 배경

Wave N (Asset Architecture, 2026-05-15) · Wave M-Impact (Impact Measurement embed, 2026-05-15) · Wave C (Forecast 정밀도, 2026-05-15) · Wave P (PM Polish, 2026-05-15) · Wave Q (PM 자산 제안 → Admin 검수, 2026-05-19) 완료 후, **기능은 풍부하나 PM 이 길을 잃는 정보 과부하** 상태 도달.

### 발견된 문제 (사용자 직접 피드백)
> "지금 내용은 정말 많이 들어가있는데 PM들이 볼 때 놓치거나 직관성이 여전히 떨어지는게 너무 많아"

Express 화면 동시 정보 source: **10+개** (북극성 바 · EvaluatorScoreBar · Inspector 칩 · InspectorReportCard · ImpactForecast 카드 · 산출물 액션바 · Deep suggestions · 챗봇 · 사이드바 4탭).

### 외부 벤치마킹 (2026-05-19)
1. **AI-native RFP 도구** (Arphie/Tribble): inline source citation 자동화 + minimalist UI → Loopio(legacy) 17.5h vs Arphie 6h 동일 RFP 차이
2. **Linear/Stripe/Notion**: Progressive disclosure — "준비됐을 때만 복잡도 노출" (reveal complexity at moment of readiness)
3. **SaaS 대시보드 메타분석**: 75개 연구 — **46.7% 사용자가 information overload** 호소 (대시보드 UX 1순위 문제)
4. **Cursor**: chat sidebar + inline diff — 결정·인용·편집은 본문 inline 에서
5. **2025 그랜트 트렌드**: SMART objectives 강제 + 검증 가능한 수치 + 지속가능성

### 제안서 품질 인사이트 (S1·S2·S3)
- **S1 — Inline source citation**: AI 시대 평가위원 신뢰도 핵심. "25,000명 알럼나이" vs "25,000명 알럼나이 [Alumni Hub 2024.12]" 차이.
- **S2 — SMART checklist**: Before/After 의 5축 (Specific/Measurable/Achievable/Relevant/Time-bound) 강제.
- **S3 — Risk Mitigation**: 평가위원이 의심할 수 있는 risk 를 PM 이 능동 답변.

## 결정

**Wave U** 로 **UX 재구조화 + ActionAI 디자인 토큰 마이그레이션 + S1-S3 흡수**, 한 번에 9일 통째 진행 (B 옵션 — Sprint 분할 X).

### 7가지 변경 (U1~U7)

| # | 작업 | 시간 | 기능 영향 | 제안서 품질 영향 |
|---|---|---|---|---|
| **U1** | **Now Bar** — 단일 액션 통합 + 색상 7종 통일 | 1.5일 | 0 (보존, 동적 노출) | ⬆ PM 다음 액션 명확 |
| **U2** | **Cmd+K + "More ▾" 드롭다운** — 6 액션 → 2 primary + 4 in palette | 1일 | 0 (surface 만 변경) | 0 |
| **U3** | **S1 — Inline source citation** | 1.5일 | +추가 | ⬆⬆ verifiable proof |
| **U4** | **S2 — SMART checklist** | 1일 | +추가 | ⬆ 측정 가능한 약속 |
| **U5** | **S3 — Risk Mitigation 섹션** | 2일 | +추가 | ⬆ 평가위원 의심 선제 방어 |
| **U6** | **자산 추천 inline diff** (hover dropdown 폐지) | 1일 | 0 (visible 옵션 유지) | 0 |
| **U7** | **사이드바 Stage-aware 자동 활성 + ● active + 토스트** | 1일 | 0 (수동 클릭 가능) | 0 |

**총 9일.**

### ActionAI 디자인 토큰 채택

출처: `C:\Users\USER\ActionAI\.claude\skills\actionai-design-system\SKILL.md`

```css
--action-orange:   #FF8204;  /* 포인트·아이콘·브랜드 */
--primary-orange:  #E8541A;  /* CTA 버튼 (primary) */
--orange3:         #F05519;  /* hover·보조 primary */
--orange2:         #FFA40D;  /* 연한 오렌지·보조 강조 */
--light-orange:    #F0845A;  /* 틴트·배경 하이라이트 */
--dark-charcoal:   #373938;  /* 사이드바 배경 */
--dark2:           #2D2D2D;  /* 2차 다크 */
--cyan:            #06A9D0;  /* Team·secondary 강조 */
--green:           #2ECC71;  /* 성공·Gate 통과 */
--light-beige:     #F5F0EB;  /* 카드 배경 */
--warm-gray:       #D8D4D7;  /* 다크 배경 위 보조 */
```

**폰트**: Poppins (영문 우선, 한글 시스템 fallback)

**금지**:
- 보라 (현 violet impact 카드 → Light Beige + Action Orange 강조)
- 파랑 (현 blue PM 제안 → Cyan)
- 임의 hex 직접 입력

**사용 비율**: Action Orange 는 전체 UI 면적의 10~15% 이하.

## 안전망

1. **모든 기존 기능 보존** — surface 위치만 변경. 기능 축소 0.
2. **U2 완화**: "More ▾" 드롭다운 항상 visible (Cmd+K 모르는 PM 도 1 클릭).
3. **U7 완화**: 자동 전환 시 1회 토스트 ("Stage 3 진입 — Impact 탭 자동 전환") + 탭 라벨 "● active" 표시.
4. **PR 단위 분할 commit** — feature flag 또는 git revert 가능.
5. **Wave U 완료 후 PM 1명 풀테스트** + 15분 인터뷰.

## 영향 (Wave U 완료 후)

- ✅ 정보 과부하 70% ↓ (동시 source 10+ → 3 tier — NowBar / More palette / Sidebar)
- ✅ 평가위원 신뢰도 ↑↑ (verifiable proof = `InlineCitations` + `SmartChecklist` + `RiskMitigationCard`)
- ✅ ActionAI ↔ ud-planner 디자인 통일 (Poppins + 11 컬러 토큰 — `globals.css`)
- ✅ Cmd+K 기반 확장성 (`CommandPalette.tsx` — 향후 신규 기능 추가 시 UI 안 어지러워짐)

## 구현 산출물

### 신규 파일
- `src/components/express/NowBar.tsx` — U1
- `src/components/express/CommandPalette.tsx` — U2
- `src/components/express/InlineCitations.tsx` — U3
- `src/components/express/RiskMitigationCard.tsx` — U5 UI
- `src/lib/express/smart-check.ts` — U4 휴리스틱
- `src/app/api/express/suggest-risks/route.ts` — U5 AI 자동 제안

### 주요 변경
- `src/lib/express/schema.ts` — `risks?: RiskMitigationItemSchema[]` 추가 (optional, 기존 데이터 호환)
- `src/lib/express/prompts/turn.ts` — S1 inline citation 마커 형식 가이드 추가
- `src/components/express/NorthStarBar.tsx` — 승인 버튼 NowBar 이관 (status 전용)
- `src/components/express/ExpressShell.tsx` — Tabs controlled + auto-activation (U7)
- `src/components/express/ExpressPreview.tsx` — RenderSectionWithCitations + SmartChecklist + RiskMitigationCard
- `src/components/projects/inspector-report-card.tsx` — `RecommendationItem` inline diff (hover dropdown 폐지)
- `src/app/globals.css` — ActionAI 11 토큰 + `.now-bar-active` 유틸
- `src/app/layout.tsx` — Poppins font (Nanum_Gothic 대체)

### 색상 sweep 처리한 위치
- `ExpressShell.tsx` 의 violet impact 카드 → cyan + light-beige
- `ExternalLlmCard.tsx` 의 blue → cyan
- `content-hub/admin` 의 blue 검수 큐 → cyan + light-beige
- `impact-forecast/forecast-client.tsx` 의 violet → primary-orange (값) + cyan (보조)
- Deep track step-*.tsx 의 보라/파랑 잔존은 후속 sweep (Wave U 직접 영향 X)

## 관련 문서

- [ROADMAP.md](../../ROADMAP.md) — Wave U 섹션
- [CLAUDE.md](../../CLAUDE.md) — 명명 사전 (Compact-safe)
- ADR-011 (Express Mode 메인) · ADR-013 (Express 2.0)
- 외부 ActionAI 디자인 시스템: `C:\Users\USER\ActionAI\.claude\skills\actionai-design-system\SKILL.md`
