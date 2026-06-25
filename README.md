# Pentographer

A penetration testing report management tool. Pentographer helps security teams manage findings, build reusable playbooks, generate AI-assisted report content, and export professional Word/PDF reports.

## Features

- **Projects & findings** — organise engagements, capture findings with risk levels, evidence screenshots, and version history
- **Playbooks** — draft/publish workflow for reusable test checklists; link playbook items directly to findings
- **AI assistance** — draft and review findings with Anthropic Claude; vision support lets the AI reference uploaded evidence images
- **Report export** — generate Word (.docx) reports; bring your own template via the personal template library
- **Template marketplace** — share and copy report templates with other users
- **Customers** — track clients and associate them with projects

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router, standalone output)
- [Drizzle ORM](https://orm.drizzle.team) + PostgreSQL
- [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) for file storage
- [NextAuth.js](https://next-auth.js.org) (credentials, JWT sessions)
- [Anthropic Claude](https://anthropic.com) for AI features
- [shadcn/ui](https://ui.shadcn.com) component library

## Getting started

### Prerequisites

- Node.js 24 (use `nvm use` if you have nvm)
- pnpm (`npm install -g pnpm`)
- PostgreSQL 16, or Docker to run it locally

### Local development

1. **Clone and install**

   ```bash
   git clone https://github.com/lswartsenburg/pentographer.git
   cd pentographer
   nvm use
   pnpm install
   ```

2. **Configure environment**

   Copy the example and fill in the values:

   ```bash
   cp .env.example .env.local
   ```

   Required variables:

   | Variable                | Description                                                                      |
   | ----------------------- | -------------------------------------------------------------------------------- |
   | `DATABASE_URL`          | PostgreSQL connection string                                                     |
   | `AUTH_SECRET`           | Random secret for NextAuth JWT signing — generate with `openssl rand -base64 32` |
   | `BLOB_READ_WRITE_TOKEN` | Vercel Blob token for file storage                                               |
   | `ANTHROPIC_API_KEY`     | Anthropic API key for AI features                                                |

3. **Start the database** (Docker)

   ```bash
   docker compose up db -d
   ```

4. **Run migrations and seed**

   ```bash
   pnpm db:migrate
   pnpm db:seed
   ```

5. **Start the dev server**

   ```bash
   pnpm dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

### Docker (all-in-one)

Starts the app, PostgreSQL, and MinIO (local blob storage):

```bash
docker compose up
```

MinIO is accessible at `http://localhost:9000` (API) and `http://localhost:9001` (web console). Default credentials are `minioadmin / minioadmin` — change them via `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` environment variables before exposing to a network.

> **Note:** File uploads are served through the app's `/api/files/` proxy, which enforces authentication. The MinIO bucket has no public access policy, so files stored in MinIO are not reachable by unauthenticated requests even if the MinIO port is exposed.

## Scripts

| Command            | Description                            |
| ------------------ | -------------------------------------- |
| `pnpm dev`         | Start development server               |
| `pnpm build`       | Production build                       |
| `pnpm type-check`  | TypeScript type checking               |
| `pnpm format`      | Format all files with Prettier         |
| `pnpm test:e2e`    | Run Playwright end-to-end tests        |
| `pnpm db:generate` | Generate Drizzle migration files       |
| `pnpm db:migrate`  | Apply pending migrations               |
| `pnpm db:studio`   | Open Drizzle Studio (database browser) |
| `pnpm db:seed`     | Seed the database with sample data     |
| `pnpm commit`      | Interactive conventional commit helper |

## End-to-end tests

E2E tests use [Playwright](https://playwright.dev) and require a running server. With a saved session file present, `pnpm test:e2e` starts the dev server automatically if one is not already running.

Some tests require additional environment variables in `.env.local`:

| Variable          | Description                                      |
| ----------------- | ------------------------------------------------ |
| `TEST_EMAIL`      | Email of the test user                           |
| `TEST_PASSWORD`   | Password of the test user                        |
| `TEST_PROJECT_ID` | ID of an existing project owned by the test user |

Tests that depend on these variables skip automatically when the variables are not set.

## Security

To report a security vulnerability, see [SECURITY.md](./SECURITY.md) or email [security@pentographer.com](mailto:security@pentographer.com).
