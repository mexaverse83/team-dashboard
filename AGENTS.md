# Repository Guidelines

## Project Structure & Module Organization

This is a Next.js 16, React 19, and TypeScript finance dashboard. App Router pages and API handlers live in `src/app/`; finance routes are grouped under `src/app/finance/` and server endpoints under `src/app/api/finance/`. Reusable domain components belong in `src/components/finance/`, shared primitives in `src/components/ui/`, and business logic or integrations in `src/lib/`. Static PWA assets are in `public/`. Tests mirror broad concerns under `tests/components/`, `tests/pages/`, and `tests/lib/`. Root-level `supabase-*.sql` files contain database migrations and policy changes; operational scripts live in `scripts/`.

## Build, Test, and Development Commands

- `npm install` installs the locked dependencies from `package-lock.json`.
- `npm run dev` starts the local Next.js server at `http://localhost:3000`.
- `npm run build` creates a production build and catches Next.js integration errors.
- `npm run lint` runs the Next.js ESLint configuration across `src` and `tests`.
- `npm test` runs the Vitest suite once; `npm run test:watch` supports local iteration.
- `npm run test:coverage` produces V8 coverage for TypeScript source files.

Run lint, tests, and a production build before submitting substantial changes.

## Coding Style & Naming Conventions

Use strict TypeScript and the `@/` alias for imports from `src/`. Follow the existing two-space indentation and component style. Name React components in PascalCase, hooks and functions in camelCase, and route/file names in lowercase kebab-case (for example, `budget-builder/` and `safe-to-spend.tsx`). Keep domain calculations in `src/lib/` instead of embedding them in page components. ESLint extends Next.js Core Web Vitals; address warnings when touching related code.

## Testing Guidelines

Vitest runs in `jsdom` with Testing Library and shared mocks from `tests/setup.ts`. Name tests `*.test.ts` or `*.test.tsx` and place them in the matching test area. Cover user-visible states, financial calculations, authorization boundaries, and regressions. Avoid live Supabase dependencies; extend the shared mock or add focused local stubs.

## Commit & Pull Request Guidelines

Recent commits use short, imperative, scope-prefixed subjects such as `Finance: add ...` and `Tests: update ...`. Keep each commit focused. Pull requests should explain the behavior change, list validation performed, link relevant issues, and include screenshots for UI work. Call out new environment variables, cron changes, or required Supabase migrations explicitly.

## Security & Configuration

Copy required environment values from the README into a local environment file; never commit secrets or service-role keys. Review row-level security implications for every schema change, and do not expose privileged Supabase operations to client components.
