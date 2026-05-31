# Phase 5 Brief: Coach Finder UI Embedding

## 🎯 Mission (1 sentence)
Port 5 React components from the existing `underdogs-coach-finder` project into `ud-ops` as isolated components under `src/components/coach-finder/`, and create a new route `/coach-finder` that displays the 800 coaches from PostgreSQL with filtering and detail views — AI recommendation button is a stub for now.

---

## 📋 Context

You are working in the `ud-ops-workspace` project (Next.js 16 + React 19 + Tailwind + shadcn/ui + Prisma/PostgreSQL). This project has:
- 800 coaches already migrated into PostgreSQL via `prisma.coach` model
- An existing `/api/coaches` GET route that returns all active coaches
- shadcn/ui components (Card, Button, Badge, Input, Dialog, etc.) in `src/components/ui/`
- Tailwind v4 with Nanum Gothic font and custom brand color `#FF8204` (`--ud-orange`)

The `underdogs-coach-finder` project is a separate React + Vite app that has a beautiful coach discovery UI we want to reuse. You will copy its components and adapt them to Next.js.

**IMPORTANT NEXT.JS CAVEAT:** This is Next.js 16, which has breaking changes. Read `node_modules/next/dist/docs/` in the `ud-ops-workspace` directory BEFORE writing any code that uses Next.js APIs (router, navigation, server actions, etc.).

---

## ✅ Prerequisites (must be true before starting)

1. Working directory: `c:\Users\USER\projects\ud-ops-workspace`
2. PostgreSQL is running (Docker) and has 800 coaches in the `Coach` table
3. `npm run build` currently passes in the main branch
4. The file `src/app/api/coaches/route.ts` exists (you will use this, not create it)
5. shadcn/ui components exist in `src/components/ui/` (Card, Button, Badge, Input, Dialog, Checkbox, etc.)

If any prerequisite fails, STOP and report.

---

## 📖 Read These Files First (in order)

### From the source project (Coach Finder original)
1. `C:\Users\USER\.gemini\antigravity\scratch\underdogs-coach-finder\client\src\types\coach.ts` — coach type definition
2. `C:\Users\USER\.gemini\antigravity\scratch\underdogs-coach-finder\client\src\components\FilterPanel.tsx`
3. `C:\Users\USER\.gemini\antigravity\scratch\underdogs-coach-finder\client\src\components\CoachCard.tsx`
4. `C:\Users\USER\.gemini\antigravity\scratch\underdogs-coach-finder\client\src\components\CoachDetailModal.tsx`
5. `C:\Users\USER\.gemini\antigravity\scratch\underdogs-coach-finder\client\src\components\AiRecommendModal.tsx`
6. `C:\Users\USER\.gemini\antigravity\scratch\underdogs-coach-finder\client\src\components\SelectionBar.tsx`
7. `C:\Users\USER\.gemini\antigravity\scratch\underdogs-coach-finder\client\src\hooks\useCoachSearch.ts` — search/filter logic
8. `C:\Users\USER\.gemini\antigravity\scratch\underdogs-coach-finder\client\src\index.css` — for any custom styles

### From the target project (ud-ops)
1. `CLAUDE.md` — project conventions (brand colors, fonts, Claude model)
2. `AGENTS.md` — Next.js caveat
3. `prisma/schema.prisma` — the `Coach` model (see all fields)
4. `src/app/api/coaches/route.ts` — the existing API you will call
5. `src/components/ui/card.tsx`, `button.tsx`, `badge.tsx` — to confirm shadcn import patterns
6. `src/lib/utils.ts` — `cn()` helper
7. `src/app/(dashboard)/layout.tsx` — to see how Next.js App Router layouts work here
8. `tailwind.config.ts` or equivalent, `src/app/globals.css` — current Tailwind setup

---

## 🎯 Scope

### ✅ You CAN touch (create or modify)
- `src/components/coach-finder/` — new directory, create everything here
- `src/app/(lab)/coach-finder/page.tsx` — new route
- `src/app/(lab)/layout.tsx` — create if it doesn't exist (basic layout for lab routes)

### ❌ You MUST NOT touch
- `src/lib/planning-agent/` — another agent may be working there (or will be)
- `src/app/(dashboard)/projects/[id]/*` — main session is working here
- `src/app/api/coaches/route.ts` — existing API, do not modify
- `prisma/schema.prisma` — no schema changes
- `src/lib/claude.ts`, `src/lib/ud-brand.ts` — do not modify
- Any existing shadcn/ui components in `src/components/ui/*`
- `package.json` — do not add dependencies unless absolutely necessary (and ask first if you must)

---

## 🛠 Tasks (numbered steps)

### Step 1: Create directory structure
Create these directories if missing:
- `src/components/coach-finder/`
- `src/app/(lab)/`
- `src/app/(lab)/coach-finder/`

### Step 2: Copy and adapt types
1. Read the source `types/coach.ts`
2. Create `src/components/coach-finder/types.ts`
3. Adapt field names to match our Prisma `Coach` model:
   - Our Prisma uses camelCase (`photoUrl`, `careerYears`, `careerHistory`)
   - Source uses snake_case in JSON (`photo_url`, `career_years`, `career_history`)
   - Create a TypeScript `Coach` type that matches our Prisma output
4. Our enum values: `tier` is `'TIER1' | 'TIER2' | 'TIER3'`, `category` is `'PARTNER_COACH' | 'COACH' | 'GLOBAL_COACH' | 'CONSULTANT' | 'INVESTOR'`
5. Keep any search/filter-related types (CoachFilters, etc.)

### Step 3: Copy and adapt 5 components
For each of: `FilterPanel`, `CoachCard`, `CoachDetailModal`, `AiRecommendModal`, `SelectionBar`:

1. Copy the file to `src/components/coach-finder/<ComponentName>.tsx`
2. Remove `"use client"` if present, then add it back if the component uses hooks/state (it should — they all use state)
3. **Replace Wouter imports** with Next.js equivalents:
   - `import { Link } from "wouter"` → `import Link from "next/link"`
   - `useLocation` from Wouter → `usePathname` / `useRouter` from `"next/navigation"`
   - `<Link href="...">` stays the same syntax
4. **Replace Firebase/Firestore calls** with fetch to our API:
   - Anywhere coach data is loaded from Firestore or JSON → replace with `fetch('/api/coaches')`
   - Anywhere coach mutations happen → STUB for now (comment out, add TODO)
5. **AI Recommend button**: in `AiRecommendModal.tsx`, instead of calling the Gemini backend, show a message "AI 추천 엔진 준비 중 (Phase 4 완료 후 활성화)" and disable the submit button. Keep the modal layout and example prompts visible.
6. **Tier/category badge colors**: these components use custom colors. Preserve them — but if they clash with our brand (`#FF8204` orange), prioritize our brand for primary accents.
7. **Language toggle**: if the source has KO/EN/JA toggle, REMOVE it. We are Korean-only for now.
8. **Auth checks**: if the source has Firebase auth checks (edit buttons, admin gates), STUB them out — assume everyone is admin for now.
9. Fix any TypeScript errors. Add minimal type annotations where needed.

### Step 4: Create the search/filter hook
1. Read source `hooks/useCoachSearch.ts`
2. Create `src/components/coach-finder/useCoachSearch.ts`
3. Replace the data source (JSON file / Firebase) with `fetch('/api/coaches')` using `useEffect` + `useState`
4. Keep the filter/search/ranking logic (tier sort, keyword search, filter by expertise/regions/tiers)
5. Remove anything related to Firebase auth, projects context, or other external contexts

### Step 5: Create the main page
Create `src/app/(lab)/coach-finder/page.tsx`:
```tsx
'use client'

import { FilterPanel } from '@/components/coach-finder/FilterPanel'
import { CoachCard } from '@/components/coach-finder/CoachCard'
import { CoachDetailModal } from '@/components/coach-finder/CoachDetailModal'
import { AiRecommendModal } from '@/components/coach-finder/AiRecommendModal'
import { SelectionBar } from '@/components/coach-finder/SelectionBar'
import { useCoachSearch } from '@/components/coach-finder/useCoachSearch'
// ... state for selected coach, modal open, etc.

export default function CoachFinderPage() {
  // Layout: sidebar (FilterPanel, ~300px) + main (grid of CoachCard)
  // On card click → open CoachDetailModal
  // Bottom bar → SelectionBar (when any selected)
  // Top-right button → open AiRecommendModal (stub)
  // ...
}
```

Layout: left sidebar 300px fixed width (FilterPanel) + main content area (coach grid, responsive: 1/2/3/4 columns).

### Step 6: Create lab layout (if needed)
If `src/app/(lab)/layout.tsx` doesn't exist, create a minimal one:
```tsx
export default function LabLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen overflow-hidden">
      {children}
    </div>
  )
}
```

### Step 7: Verify
1. Run `npx tsc --noEmit` — must return 0 errors
2. Run `npm run build` — must pass
3. Start dev server: `npm run dev`
4. Visit `http://localhost:3000/coach-finder`
5. Verify: 800 coaches load in grid, filters work, clicking a card opens the detail modal, AI recommend button shows "준비 중" message

---

## 🔒 Tech Constraints

### Next.js 16 specifics
- This is Next.js 16 (NOT 13/14/15). READ `node_modules/next/dist/docs/` for breaking changes.
- Use the App Router (`src/app/` directory)
- Client components need `'use client'` directive at top
- Server components are default
- For navigation use `next/link` and `next/navigation` hooks
- `params` and `searchParams` in page props are now Promises in dynamic routes (await them)

### Claude model (if you happen to need it)
- Model: `claude-sonnet-4-6` (constant `CLAUDE_MODEL` in `src/lib/claude.ts`)
- JSON parsing: always use `safeParseJson()` from `src/lib/claude.ts`
- You probably DON'T need Claude for Phase 5 — the AI recommend button is a stub

### Brand guidelines (from CLAUDE.md)
- Primary color: `#FF8204` (Action Orange), class `bg-primary`, `text-primary`
- Orange usage: 10~15% of UI max (CTAs, emphasis only)
- Dark sidebar: `#373938`
- Font: Nanum Gothic (`font-sans`)
- Border radius: `rounded-md` (0.5rem) default

### Import conventions
- Use `@/` path alias for `src/` imports
- Example: `import { Button } from '@/components/ui/button'`
- Example: `import { cn } from '@/lib/utils'`

---

## ✔️ Definition of Done (checklist)

- [ ] `src/components/coach-finder/` contains 5 `.tsx` component files + `types.ts` + `useCoachSearch.ts`
- [ ] `src/app/(lab)/coach-finder/page.tsx` exists and renders
- [ ] `src/app/(lab)/layout.tsx` exists (if not already)
- [ ] `npx tsc --noEmit` returns exit code 0
- [ ] `npm run build` succeeds
- [ ] Dev server shows `/coach-finder` route with 800 coaches in grid layout
- [ ] Filter panel (left sidebar) can filter by expertise / regions / tiers (at least these three work)
- [ ] Clicking a coach card opens the detail modal with full profile info
- [ ] AI Recommend button opens a modal that shows "AI 추천 엔진 준비 중 (Phase 4 완료 후 활성화)" message
- [ ] NO changes to files outside the allowed scope
- [ ] NO new npm dependencies added (unless absolutely necessary and documented)
- [ ] Korean-only UI (no language toggle)
- [ ] Uses brand color `#FF8204` for primary accents (not Coach Finder's original indigo)

---

## 📤 Return Format (what to report back)

When done, respond with exactly this structure (under 400 words):

```
## Phase 5 Complete

### Files Created
- path/to/file1.tsx (N lines)
- path/to/file2.tsx (N lines)
- ... (list all)

### Files Modified
- (should be empty, if anything modified explain why)

### Key Adaptations Made
- Wouter → Next.js navigation: [specifics]
- Firebase → /api/coaches fetch: [specifics]
- AI Recommend stub: [how implemented]
- [any other notable changes]

### Verification Results
- npx tsc --noEmit: [PASS/FAIL + error count if fail]
- npm run build: [PASS/FAIL]
- /coach-finder route renders: [YES/NO]
- Filters work: [YES/NO + which filters tested]
- Coach detail modal: [YES/NO]

### Issues Encountered
- [anything that required judgment calls or could not be resolved]

### TODOs Left for Next Phase
- [items that need Phase 4 recommendation engine to be complete]
- [items that need Phase 6 integration]

### Merge Recommendation
- [READY TO MERGE / NEEDS REVIEW: reason]
```

---

## 🚫 Do NOT do these things

1. Do NOT modify files outside `src/components/coach-finder/` and `src/app/(lab)/coach-finder/`
2. Do NOT add new npm dependencies without explicit approval
3. Do NOT implement real AI recommendation logic (that's Phase 4)
4. Do NOT touch the main `/coaches` page under `(dashboard)` — that stays as-is
5. Do NOT add authentication or user role checks
6. Do NOT use Wouter, React Router, or any client-side routing library other than Next.js
7. Do NOT assume any database schema changes — use existing `Coach` model only
8. Do NOT run destructive commands (migrations, reset, etc.)
9. Do NOT commit changes — the main session will review and merge

---

## 💡 Hints

- The source project's `CoachCard` has a rank number in top-left and match % bar — keep them but match % should show "—" or hide for now (no recommendation scores yet)
- The source's `AiRecommendModal` has example RFP prompts — keep those, they're useful examples for later
- `useCoachSearch` probably has debouncing and memoization — keep them, they're performance-critical for 800 items
- If you see `useLanguage()` or `t('...')` translation calls, replace with hardcoded Korean strings (KR_TEXT object)
- If the source uses Framer Motion animations, KEEP them (ud-ops allows it)

---

## 🏁 Final Note

This brief is self-contained. You should have everything you need. If you genuinely cannot proceed because of missing context, STOP and report what's blocking you — do not guess or make up project conventions.

Good luck. The main session is counting on this being done cleanly so Phase 4 (recommendation engine) and Phase 6 (integration) can build on top of it.
