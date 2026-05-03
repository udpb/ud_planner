import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Lint 정책 (ADR-002 관련, 결정일 2026-04-15):
 *
 * 구조: 전역 warn + 신규 경로만 error (유지보수 용이)
 *
 * - 레거시 코드 전체 (src/**, scripts/**, prisma/**) — `no-explicit-any` 를 warn 으로.
 *   타입 체크(tsc)는 0 에러로 실질 타입 안전성 확보됨. 재설계 Phase B~E 에서
 *   PipelineContext 가 주입되며 any 가 자연스럽게 사라짐.
 *
 * - 신규 경로 (아래 newStrictPaths) — `error` 유지. 처음부터 타입 안전.
 *   Phase 재작업 완료된 레거시 경로는 일정 기간 후 여기로 승격.
 *
 * 목표: 재작업 = 자연스러운 타입 승격. 별도 "일괄 복원" 작업 없음.
 */
const newStrictPaths = [
  "src/lib/pipeline-context.ts",
  "src/modules/**/*",
  "src/lib/ingestion/**/*",
  "src/app/api/projects/*/pipeline-context/**/*",
  // 각 스텝 폴더의 *.manifest.ts (신규, 엄격)
  "src/app/**/*.manifest.ts",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // 레거시 코드 전체: 재작업 중에 자연 정리될 룰들을 warn 으로 완화
  {
    files: [
      "src/**/*.{ts,tsx}",
      "scripts/**/*.{ts,tsx}",
      "prisma/**/*.{ts,tsx}",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "react/no-unescaped-entities": "warn",
      "prefer-const": "warn",
      "@next/next/no-html-link-for-pages": "warn",
      "@next/next/no-assign-module-variable": "warn",
    },
  },

  // 신규 경로: error 유지 (위 warn 을 덮어쓰기)
  {
    files: newStrictPaths,
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },

  // ──────────────────────────────────────────────────────────
  // Phase 3.1 (2026-05-03) — AI SDK 단일 진입점 강제
  //
  // anthropic / google-genai SDK 직접 import 는 단일 진입점 (ai-fallback.ts) 에서만.
  // 신규 코드가 다시 anthropic.messages.create / GenerativeModel 등을 직접 부르면
  // Phase L1 의 Gemini Primary + Claude Fallback 전환이 무의미.
  //
  // 예외: src/lib/ai-fallback.ts (구현체) · src/lib/claude.ts (CLAUDE_MODEL 상수만 export)
  //       · src/lib/gemini.ts (Gemini 직접 호출 — invokeAi 가 사용)
  // ──────────────────────────────────────────────────────────
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/lib/ai-fallback.ts",
      "src/lib/claude.ts",
      "src/lib/gemini.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@anthropic-ai/sdk",
              message:
                "AI 호출은 src/lib/ai-fallback.ts 의 invokeAi() 를 사용하세요. " +
                "Anthropic SDK 직접 import 는 ai-fallback / claude / gemini 에서만 허용 (Phase L1).",
            },
            {
              name: "@google/generative-ai",
              message:
                "AI 호출은 src/lib/ai-fallback.ts 의 invokeAi() 를 사용하세요. " +
                "Google Generative AI SDK 직접 import 는 ai-fallback / gemini 에서만 허용 (Phase L1).",
            },
          ],
        },
      ],
    },
  },

  // CommonJS 스크립트 (.cjs) — require 허용 (Node.js 표준)
  {
    files: ["**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
