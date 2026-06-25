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
- [x] Should draft findings appear in a report?
- [x] Lots of buttons that don't update to pointer when hovering. Like the tabs in the project, or the "+ New version" button. Check all possible buttons and make sure they are updated

- [x] BYOT Word export (template library + marketplace + metadata fields)

- [ ] More secure login features
- [x] Make sure that we can upload multiple files at a time for a finding
- [x] Make sure that all github workflows use node 24

- [x] Export (Google Docs, PDF, Word) — needs design thought: template customisation, section ordering, branding. Do this last.
- [x] How does a user actually create an export from a report? How do they select a template?
- [x] Should we store the full credentials for accounts? Or make it optional? I see some security concerns
- [x] Build a markdown export. The export should create a zip that contains the markdown, and images
- [x] Export history should include more details. Like, who exported the document? Which report was it?
- [ ] Add seach to the customer page
- [ ] Add search to the templates page
- [ ] Add search to the playbook page
- [x] Create external GraphQL API
- [x] Create an MCP
- [x] AI features take a long time and there is no indication of progress aside from a spinner
- [x] Change report export log to "Activites" where users can see the entire audit log for a project
- [ ] Actually implement the local storage solution. It's not showing in docker-compose.yml. Run it and verify it works
- [ ] Verify playbook management in an org
- [ ] Instead of using the Anthropic API key set in an env variable, users should be able to set up their own keys on a user account, and on a organization level. If an organization doesn't have a key, the user key should be used. If none are available, we can use the api key set on the env variable, but we should restrict how many prompts can be send using that
- [x] I still don't see hte system playbook OWASP in ALice's account. Make sure that testing if the system playbooks exist is part of the manual  
       testing
- [x] Pointer doesn't change on the left bottom dropdown
- [x] Clicking on the logo should go to the dashboard of the currently active project
- [ ] What happens if the owner of a project quits an organization?
- [x] Organization name appears in user settings instead of organization settings (doesn't exist yet). What should happen to API keys and OAuth?
- [x] Why are we using "Workspace" in parts of the UI? We should either standardize on "Organization" or "Workspace"
- [x] Add by email form is misaligned on members page
- [x] When you open user settings, should the left sidebar still show? It sesm that everything in the left sidebar is organization level

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
