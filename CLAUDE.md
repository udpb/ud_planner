@AGENTS.md

# UD-Ops Workspace — 개발 규칙

## 디자인 시스템
- **폰트**: Nanum Gothic (나눔고딕) — `font-sans` / `--font-sans` 변수
- **메인 컬러**: Action Orange `#FF8204` — `bg-primary` / `text-primary` / `--ud-orange`
- **블랙**: `#000000`, 화이트: `#FFFFFF`
- **서브 컬러**: `#FFA40D`(orange-light), `#373938`(dark/sidebar), `#D8D4D7`(gray), `#06A9D0`(cyan)
- **컬러 비율**: Action Orange는 전체 UI의 10~15% 이하 (CTA, 강조, 아이콘 등)
- **비주얼 패턴**: Spread/Scale, Repetition/Alignment, Expansion/Progress
  - 반복 정렬: `border-brand-left` 유틸리티 클래스 사용
  - 진행 상태: `progress-brand` 그라데이션 클래스
- **반경**: `--radius: 0.5rem` (rounded-md 기본)
- **사이드바**: 다크 `#373938` 배경 (`bg-sidebar`)

## 설계 철학 (PRD v4.0)
1. **Impact-First**: 임팩트 목표 → 역추적 → 커리큘럼 → 코치 → 예산 순서
2. **Action Week 강제**: 이론 3회 연속 시 경고, Action Week 삽입 제안
3. **시트는 부산물**: 기획 품질 > 시트 채우기
4. AI가 정보 부족 시 → 자동 생성 대신 질문으로 보완

## Claude API
- 모델: `claude-sonnet-4-6` (`CLAUDE_MODEL` 상수)
- JSON 파싱: 항상 `safeParseJson()` 헬퍼 사용 (src/lib/claude.ts)
- `max_tokens`: RFP 파싱 4096 / Logic Model 4096 / 커리큘럼 4096
