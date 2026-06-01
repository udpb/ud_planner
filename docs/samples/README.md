# docs/samples — 엔진 생성 샘플 (⚠️ 스펙 아님)

이 폴더의 파일은 **UD 기획 엔진(`src/lib/express/engine/`)이 자동 생성한 1차본 샘플**입니다. 품질·도식 확인용 참고 산출물이며, **제품 스펙·결정 문서가 아닙니다.**

- 스펙·방향 = `docs/UD-Engine-PRD-v1.0.html` · `UD-Engine-TechSpec-v1.0.md` · `docs/decisions/`
- 재생성: `NODE_OPTIONS=--conditions=react-server npx tsx scripts/_gen-sample.ts` (~12분, 실 Gemini)

## 파일
- `sample-draft-B2G.md` — 초기 엔진(EX-1) 생성 1차본 (B2G 청년창업).
- `sample-draft-B2G-v2.md` — QUAL-2 강화판 (named 컨셉·주차 커리큘럼표·전체 타임라인·실행계획).
- `sample-draft-B2G-v2.pptx` — slideSpecs→`buildPptx` 도식 덱 (22슬라이드, timeline·process-flow·kpi-grid 등 8패턴).

> fixture RFP + 얕은 매칭 코퍼스 기준 — 실 RFP·실 자산이면 품질 더 높음. 외부 패널 점수(~52~66)는 측정 한계(섹션 900자 절단) 영향 있음.
