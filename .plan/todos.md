- [x] One of the things that's missing is being able to link a finding to an item in the playbook.
- [x] The original plan mentions "Responsible disclosure policy - a public security.txt and disclosure process is in place from day one.". Lets add it
- [x] Implement commitzen. Enforce using huskey and github actions
- [x] Implement prettier. Enforce using husky and github actions
- [x] Create an svg file from the logo. Both dark and light mode and store it in the public folder

- [x] How to go see older versions of a playbook?
- [x] Not clear when in editor playbook and when in view playbook mode
- [x] We should be able to add top level instructions to a playbook, that instruct reviewers how to go about finding the vulnerabilities
- [x] Add item is not working in the playbook editor

- [x] Drop files for upload

- [x] Make sure that the drafting functionality for findings takes everything that was already inputted in the fields and was uploaded as evidence as input for drafting a new version. Maybe we can ask a user for instructions for how to draft the new thing?
- [x] Make sure that Review finding uses the evidence that was uploaded and makes sure that the description clearly explains what the evidence shows

- [x] Add typescript checks to husky / workflow
- [x] Add unit and end to end tests to husky / workflow

- [x] Identify core features for the tool that have a potential to regress. Lets implement e2e tests for them
- [x] Items in the playbook should have unique URLs
- [x] Suggest new sections in the left sidebar that group things logically together
- [x] Add hover message to disabled buttons
- [ ] Search reports and findings
- [x] Write README.md
- [x] Write CONTRIBUTING.md

- [x] BYOT Word export (template library + marketplace + metadata fields)

- [ ] More secure login features
- [ ] Make sure that we can upload multiple files at a time for a finding
- [ ] Make sure that all github workflows use node 24

- [x] Export (Google Docs, PDF, Word) — needs design thought: template customisation, section ordering, branding. Do this last.
- [x] How does a user actually create an export from a report? How do they select a template?
- [ ] Should we store the full credentials for accounts? Or make it optional? I see some security concerns
- [ ] Build a markdown export. The export should create a zip that contains the markdown, and images
- [ ] Export history should include more details. Like, who exported the document?

# Three deployment tiers (corporations are reluctant to use a cloud version with sensitive pentest data)

## Stream A — Storage abstraction (enables Docker/self-hosted, do this first)

- [x] Create lib/storage.ts adapter interface with put/get/del/copy
- [x] Implement lib/storage/vercel.ts — thin wrapper around @vercel/blob
- [x] Implement lib/storage/local.ts — reads/writes to STORAGE_PATH; urls are /api/files/<key>
- [x] Add app/api/files/[...key]/route.ts — serves local files with same auth as existing blob proxy
- [x] Update 8 API routes to use adapter instead of @vercel/blob directly
- [x] Update docker-compose.yml — mount named volume for STORAGE_PATH, remove MinIO

## Stream B — SQLite (enables Electron database)

- [ ] Add db/schema.sqlite.ts — mirrors db/schema.ts using sqliteTable (enums→text, uuid→text, timestamps→integer, json→text mode)
- [ ] Update db/client.ts — pick driver by DATABASE_URL prefix (file: → SQLite, else → PostgreSQL)
- [ ] Add drizzle.sqlite.config.ts — separate config for SQLite migration generation
- [ ] Generate db/migrations/sqlite/ from the SQLite schema

## Stream C — Electron shell (Mode 1 — fully offline)

- [ ] Set up electron-forge in electron/ directory
- [ ] Write electron/main.ts — spawns Next.js standalone server, sets env vars from userData, runs migrations on first launch
- [ ] Add keytar for OS keychain storage of Anthropic API key
- [ ] Add Settings → AI page for entering/removing the API key
- [ ] Add pnpm electron:build script (next build → copy standalone → electron-forge make → DMG/EXE/AppImage)
- [ ] Hide template marketplace in Electron builds (ELECTRON=true)
