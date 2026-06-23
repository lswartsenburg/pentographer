# Environment Setup

Always run `nvm use` before executing any commands in this project. This ensures the correct Node.js version is active.

This project uses **pnpm** as its package manager. Always use `pnpm` instead of `npm` or `yarn` for all package operations:

- Install deps: `pnpm install`
- Add a package: `pnpm add <pkg>`
- Run scripts: `pnpm <script>` (e.g. `pnpm dev`, `pnpm build`)
- Never run `npm install`, `npm ci`, or `yarn`

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

## What this is

Pentographer is a multi-tenant penetration testing report management tool. Security teams use it to manage engagements (projects), capture findings, build reusable test playbooks, and export Word/PDF reports. AI features (Anthropic Claude) assist with drafting and reviewing finding content.

## Commands

```bash
pnpm dev            # start dev server
pnpm build          # production build
pnpm type-check     # TypeScript check (no emit)
pnpm lint           # ESLint
pnpm format         # Prettier (write)
pnpm format:check   # Prettier (check only)

pnpm db:generate    # generate Drizzle migration after schema changes
pnpm db:migrate     # apply pending migrations
pnpm db:studio      # open Drizzle Studio
pnpm db:seed        # seed sample data

pnpm test:e2e                        # run all Playwright tests
pnpm test:e2e -- --grep "test name"  # run a single test by name
pnpm test:e2e -- e2e/path/to/test.spec.ts  # run a single file
```

After modifying `db/schema.ts`, always run `pnpm db:generate` then `pnpm db:migrate` — never hand-edit migration files.

## Architecture

### Route groups

```
app/
  (auth)/        login, register — no sidebar, no session required
  (app)/         protected; layout.tsx enforces session + renders AppSidebar
    dashboard/
    projects/[id]/
    customers/
    playbooks/[id]/
    settings/
    templates/
  api/           REST handlers; handle their own auth (middleware lets all /api/* through)
  security/      public (security disclosure page)
```

`auth.config.ts` contains the NextAuth middleware callback. `auth.ts` is the full NextAuth config (credentials provider, JWT strategy). The session carries only `{ id, name, email }`.

### Auth patterns

- **Web routes**: `requireAuth()` from `lib/auth.ts` — calls `auth()` from NextAuth, returns `{ session, error }`. Error is a pre-built `NextResponse(401)`.
- **API / MCP routes**: `requireApiKey()` from `lib/api-key-auth.ts` — accepts two token types: `ptg_`-prefixed API keys (SHA-256 hashed in DB) or OAuth JWT tokens issued to registered OAuth clients.
- **GraphQL** (`/api/graphql`): uses `requireApiKey` only — it's the programmatic/MCP interface.
- **Page-level auth**: `(app)/layout.tsx` redirects to `/login` if no session; individual pages call `auth()` directly for the user's data.

### Database

Drizzle ORM + PostgreSQL. Schema in `db/schema.ts`. Client in `db/client.ts` (loads `.env.local` then `.env.development.local` automatically).

All resources are currently user-owned via a `userId` FK. Access checks are done inline in route handlers or via helpers in `lib/project-access.ts` (verify the requesting user owns the resource before returning/mutating it).

### Two API surfaces

1. **REST** (`app/api/**`): Browser-facing. Auth via NextAuth session cookie (`requireAuth`). Standard Next.js route handlers.
2. **GraphQL** (`app/api/graphql`): Programmatic/MCP-facing. Auth via API key or OAuth JWT (`requireApiKey`). Schema in `app/api/graphql/schema.ts`, resolvers split by domain in `app/api/graphql/resolvers/`.

### AI features

All AI calls go through `lib/ai/client.ts` which returns a configured `Anthropic` instance (returns `null` if `ANTHROPIC_API_KEY` is unset, so AI features degrade gracefully). Streaming responses use `lib/ai/sse.ts` (`makeSSE`) which wraps a `ReadableStream` in SSE format. Routes that stream AI content have `export const maxDuration = 120`.

### Finding versioning

Findings use an append-only version log. `finding` holds the canonical status/risk; `finding_version` holds each revision's full content. The active version is the most recent `finding_version` by `createdAt`. Status transitions are validated in `lib/finding-transitions.ts`.

### Report export

Reports snapshot finding content at publish time into `reportVersion.findingSnapshot` (array of `{ findingId, findingVersionId }`). The actual export (`.docx`) is built server-side using `docxtemplater` with user-uploaded Word templates stored in Vercel Blob.

### Playbook versioning

Playbooks use a draft/publish workflow: `playbook → playbookVersion (draft|published) → playbookCategory → playbookItem`. Only one version is `isActive` at a time. Projects reference a specific `playbookVersionId` so version upgrades are explicit.

### Component library

shadcn/ui components live in `components/ui/` (Radix primitives + Tailwind). Custom app components (sidebar, markdown editor, PDF renderer) are in `components/`. Icons from `@tabler/icons-react`.

## Key conventions

- Zod schemas validate all API inputs at the boundary; internal code trusts validated data.
- `userId` ownership checks are always done before any DB mutation — never trust a resource ID from the request alone.
- `authorType` on `findingVersion` and `executiveSummaryVersion` is always set server-side; never accepted from the client.
- Passwords are bcrypt-hashed. Encrypted fields (test account passwords) use AES-256-GCM via `lib/crypto.ts`.
