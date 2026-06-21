# Contributing

## Development setup

Follow the [Getting started](README.md#getting-started) steps in the README to get a local environment running.

Always activate the correct Node.js version before running any commands:

```bash
nvm use
```

Use **pnpm** for all package operations — never `npm` or `yarn`.

## Making changes

### Branches

Create a feature branch off `main`:

```bash
git checkout -b feat/my-feature
```

### Commits

This project enforces [Conventional Commits](https://www.conventionalcommits.org). Use the interactive helper to format your commit message:

```bash
pnpm commit
```

Common types: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`, `style`, `perf`.

### Pre-commit checks

Husky runs the following automatically on every commit:

- `prettier --check` — code formatting
- `tsc --noEmit` — TypeScript type checking
- `next build` — production build

Fix any failures before committing. To auto-fix formatting run `pnpm format`.

### Pre-push checks

E2E tests run on push. The dev server starts automatically if one is not already running. See the README for required environment variables.

## Database changes

1. Edit `db/schema.ts`
2. Generate a migration: `pnpm db:generate`
3. Apply it locally: `pnpm db:migrate`
4. Commit both the schema change and the generated migration file

## Pull requests

- Target `main`
- Keep PRs focused — one logical change per PR
- All CI checks must pass before merging (commitlint, prettier, typecheck, E2E tests, Vercel preview)
- Write a clear PR description explaining what changed and why

## CI workflows

| Workflow     | Trigger   | Checks                      |
| ------------ | --------- | --------------------------- |
| `commitlint` | push / PR | Conventional commit format  |
| `prettier`   | push / PR | Code formatting             |
| `typecheck`  | push / PR | TypeScript                  |
| `e2e`        | push / PR | Playwright end-to-end tests |

## Code style

- **TypeScript** — strict mode; no `any` unless unavoidable
- **Formatting** — Prettier with project defaults; run `pnpm format` before committing
- **Comments** — only when the _why_ is non-obvious; no inline documentation of what the code does
- **No dead code** — remove unused imports, variables, and components rather than commenting them out
