# Manual Testing Checklist

Run against `http://localhost:3000` with `pnpm dev`. Each section can be tested independently; create fresh accounts where noted. Write a report to .plan/manual-test-report-{datetime}.md

---

## 1. Authentication

- [x] **Register** — fill name, email, password, confirm → lands on `/login?registered=1`
- [x] **Login** — sign in with the registered credentials → lands on `/dashboard`
- [x] **Sidebar footer** — shows `<Name>'s Workspace` (personal org created on registration)
- [x] **Duplicate email** — register again with same email → shows error, stays on `/register`
- [x] **Short password** — submit with < 8 chars → validation error shown
- [x] **Wrong password** — login with bad password → error shown, stays on `/login`
- [x] **Unauthenticated redirect** — visit `/dashboard` while logged out → redirects to `/login`
- [x] **Sign out** — click user menu → Sign out → redirected to `/login`; revisiting `/dashboard` redirects again

---

## 2. Teams & Permissions

> Use two browser profiles / incognito windows for multi-user steps.

- [x] **Team page loads** — `/settings/team` shows current user listed as **Owner (you)**, add-member form visible
- [x] **Invite by email** — enter a registered user's email, click Add → "Member added" toast; reload shows them in the list with role Member
- [x] **Unknown email** — invite a non-existent email → error toast (404) (`"No account found with that email"`)
- [x] **Duplicate invite** — invite someone already in the org → error toast (409) (`"User is already a member"`)
- [x] **Change role** — open role dropdown on a member row → select Admin → "Role updated" toast; row shows new role
- [x] **Remove member** — click Remove on a member → they disappear from the list on reload
- [x] **Sole owner protection** — try to remove yourself as the only owner → error toast (400) (`"Cannot remove the sole owner"`)
- [x] **Member cannot manage team** — log in as a Member → visit `/settings/team` → no Add form and no Remove buttons visible
- [ ] **Viewer cannot create resources** — log in as a Viewer → try POST `/api/customers` → 403 _(skipped — code path confirmed via `requireOrgRole(userId, orgId, "member")` returning false for viewer)_
- [x] **Org isolation** — register two separate users (separate orgs); User A creates a customer; User B cannot see or access it

---

## 2a. Organization Switching

> Requires a user who is a member of at least two organizations (e.g. Bob invited to Alice's org via `/settings/team`).

- [x] **Single-org user** — user belonging to only their personal org sees a single entry in the footer dropdown with a checkmark; no other orgs listed
- [x] **Multi-org user** — user invited to a second org sees both orgs listed under "Organizations" in the footer dropdown; current org has a checkmark
- [x] **Switch org** — click a different org in the dropdown → spinner shows briefly, page reloads, sidebar footer updates to the new org name; projects/customers/playbooks all reflect the new org's data
- [x] **Persist across refresh** — after switching, hard-refresh the page → still on the switched org (JWT was re-issued)
- [x] **Sign out resets** — sign out and sign back in → returns to personal org (`personalOrgId`), not the last switched org
- [x] **Non-member blocked** — `POST /api/orgs/switch` with an `orgId` the user is not a member of → 403 (`"Not a member of this organization"`)
- [x] **Org isolation after switch** — after switching to Org B, resources from Org A are not visible; switching back to Org A restores them

---

## 2b. Organization Management

> Requires at least two registered users. Use the footer dropdown "New organization" to create extra orgs.

### Create

- [x] **Create organization** — click "New organization" in the footer dropdown → enter name → org is created, session switches to it, footer shows the new org name
- [x] **Creator becomes owner** — the creating user appears as Owner in `/settings/team` for the new org
- [x] **Personal org unaffected** — sign out and sign back in → returns to personal org, not the newly created one

### Read

- [x] **Org name shown** — current org name visible in sidebar footer and in the footer dropdown with a checkmark
- [x] **Org settings page** — `/settings/organization` loads the org name in an editable field; correct org name shown after switching

### Update

- [x] **Rename organization** — Owner or Admin: change name in `/settings/organization` → "Save" → footer and switcher update immediately on next load
- [x] **Non-owner cannot rename** — log in as Member or Viewer → visit `/settings/organization` → name field is disabled / Save button absent; `PATCH /api/orgs/[id]` returns 403

### Delete

- [x] **Delete organization** — Owner: click "Delete organization" in danger zone → confirm → org deleted; session switches back to personal org; deleted org no longer appears in switcher
- [ ] **Cascade delete** — all projects, customers, playbooks, and members belonging to the org are removed from the DB when the org is deleted _(not directly tested — no resources created before delete; DB uses cascade FK)_
- [x] **Cannot delete personal org** — the danger zone (delete button) is hidden on a user's personal org; `DELETE /api/orgs/[id]` returns 400
- [x] **Non-owner cannot delete** — `DELETE /api/orgs/[id]` as Admin/Member/Viewer → 403

### Leave

- [x] **Member can leave** — log in as a Member of a non-personal org → `/settings/organization` shows "Leave organization" in danger zone → click → toast confirms → org disappears from switcher
- [x] **Sole owner cannot leave** — `POST /api/orgs/[id]/leave` as the sole owner → 400 error toast ("You are the sole owner. Transfer ownership before leaving.")
- [x] **Cannot leave personal org** — danger zone hidden on personal org; `POST /api/orgs/[id]/leave` for own personal org → 400 (`"Cannot leave your personal organization"`)

---

## 3. Customers

- [x] **Create** — `/customers` → New customer → fill name → saved, appears in list
- [x] **View** — click customer → detail page loads
- [x] **Edit** — edit name → saved
- [x] **Delete** — delete customer → removed from list
- [x] **Cross-org isolation** — customer from another org returns 404 when accessed directly by ID

---

## 4. Projects

- [x] **Create** — `/projects/new` → fill name, select customer, optionally attach playbook → saved
- [x] **List** — `/projects` shows the new project; dashboard counters update
- [x] **Edit** — update project name/status → saved
- [x] **Status forward** — advance status (e.g. in-progress → under-review) → no justification needed
- [x] **Status backward** — move status back → justification field appears, required → audit log entry created
- [x] **Delete** — delete project → removed from list

> **Bug:** `PATCH /api/projects/[id]` returns 500 when the body contains fields not in `updateSchema` (e.g. `playbookVersionId`). Zod strips unknown fields → `updateData` is empty `{}` → Drizzle throws on `set({})`. Should return 400 or silently no-op.
>
> **Gap:** Playbook can only be attached at project creation (`/projects/new`). There is no UI or API path to change `playbookVersionId` after a project is saved.

---

## 5. Findings

- [x] **Create** — inside a project → New finding → fill title, risk level → saved
- [x] **Markdown editor** — type in the description field → live preview updates on the right
- [x] **CVSS score** — enter a CVSS score → displayed _(note: field accepts numeric score; entering a full CVSS vector string parses only the version prefix "3.1", not the computed score — UX gap)_
- [x] **Risk level** — change risk level → reflected in the finding list
- [x] **Status transitions** — Draft → In Review → Confirmed (statuses: Draft, In Review, Confirmed, Informational, False Positive)
- [ ] **Evidence upload** — attach an image → thumbnail shown, URL persisted in `finding_version.evidenceUrls` on save _(not tested — requires file upload)_
- [x] **Version history** — save multiple times → version list shows all snapshots; restore an earlier version (restore creates a new version entry)
- [x] **Link to playbook item** — select a playbook item from the dropdown → link saved; auto-populates title, risk level, description, and remediation from the playbook
- [x] **Ad-hoc finding** — create without a playbook item → `isAdhoc: true` when "Ad-hoc" option selected in UI (must be explicit; not auto-derived from null playbookItemId)
- [x] **AI draft** — click "Draft with AI" → modal with optional instructions → Generate → "Drafting finding…" spinner → description + remediation filled with professional content → auto-saved as new version
- [x] **AI review** — click Review with AI → inline "AI Review" panel appears in AI TOOLS section with detailed structured feedback; "Dismiss" link closes it

> **Note:** Evidence uploaded via `POST /api/.../evidence` returns the blob URL but does NOT persist it to the DB. The URL is held in React state and only saved when the user clicks Save (creating a new `finding_version`).
>
> **Bug:** `verifyAccess` in `app/api/projects/[id]/findings/[findingId]/evidence/route.ts` checks `eq(project.userId, userId)` — this will fail for projects owned by org members other than the original creator once multi-user orgs are in full use. Should use `organizationId`-scoped access instead.

---

## 6. Executive Summary

- [x] **Edit** — open a project's executive summary → type content → save (markdown editor with live preview; inside report version editor)
- [x] **AI draft** — click "AI draft" in executive summary editor → streamed content fills the summary (references customer, project, findings by name and severity)
- [x] **AI review** — click "AI review" → inline "AI Review" panel appears below editor with structured feedback including specific improvement suggestions

---

## 7. Playbooks

- [x] **System playbooks visible** — `/playbooks` shows "OWASP Top 10 (2021)" with a "System" badge for any user, including newly registered users _(requires `pnpm db:seed` to have been run once)_
- [x] **Create** — `/playbooks` → New playbook → name → saved
- [x] **Add category** — inside playbook editor → add a category with a name
- [x] **Add item** — add a test item to a category → saved with default risk level; item detail panel opens (default risk, framework ref, description, remediation, active toggle)
- [ ] **Reorder** — drag items/categories → order persists on reload _(not tested — drag-and-drop requires real pointer interaction)_
- [x] **Publish version** — publish draft → "Draft" badge replaced with "v1.0"; "Create draft" button replaces Publish
- [x] **AI generate** — click "AI generate" → modal with optional instructions + "A draft will be created automatically." notice → Generate → draft auto-created; new "Authorization Testing" category added with 3 items (IDOR, Privilege Escalation, Broken Access Control); "4 changes" badge shown
- [x] **Import/export** — export via `GET /api/playbooks/[id]/export` returns JSON with name/categories/items; import via multipart `POST /api/playbooks/import` returns 201; imported playbook appears in list without System badge (org-scoped, not system-wide). UI also exposes Import button in header.
- [ ] **Attach to project** — select playbook at `/projects/new` → playbook items visible in findings flow _(already tested in §4 Create and §5 Link to playbook item)_

> **Note:** System playbooks (`organization_id = NULL, user_id = NULL`) are created by `pnpm db:seed`. This must be run once on any fresh database. Imported playbooks used to incorrectly land with `organization_id = NULL` (appearing as system-wide); fixed in `app/api/playbooks/import/route.ts` to always set `organizationId: orgId`.

---

## 8. Report Templates

- [x] **Upload** — `POST /api/settings/report-template` (multipart) → 201; template appears in list at `/templates` with filename, upload date, "Private" badge, and delete button
- [ ] **Set as default** — mark template as default _(NOT IMPLEMENTED — no `isDefault` column in DB or UI control)_
- [x] **Delete** — click trash icon → template removed immediately (no confirmation dialog)
- [x] **Toggle public/private** — click "Private"/"Public" badge → toggles immediately; "Public" shows download count; template appears in Community Marketplace section when public

---

## 9. Report Generation

- [x] **Create report** — inside a project → New report → saved (no template selection at creation time; template is chosen at export)
- [x] **Publish** — publish the report → finding snapshot frozen; findings checked at publish time are included regardless of draft status; Publish/Save buttons replaced by Export-only view
- [x] **Export `.docx`** — click Export → select format (DOCX/PDF/Markdown) + optional template → `POST /api/projects/[id]/export` returns 200 with correct content-type

> **Note:** Template is selected at export time, not at report creation. The checklist item "select template" belongs under Export, not Create.

---

## 10. Settings — API Keys

- [x] **Create key** — Settings → New key → name it → `ptg_`-prefixed key shown once in copy dialog
- [x] **Key in list** — after dismissing dialog, key appears in table (no secret shown; name, created date, last used, expires columns)
- [x] **Revoke** — click Revoke → key removed from list; subsequent API calls with that key return 401 (`{"error":"Unauthorized"}`)
- [x] **Admin sees all org keys** — `GET /api/settings/api-keys` as owner returns org-scoped keys (confirmed via code: `eq(apiKey.organizationId, orgId)` for admin/owner)
- [x] **Member sees own keys only** — non-admin gets `and(eq(apiKey.organizationId, orgId), eq(apiKey.userId, userId))` filter (confirmed via code at `app/api/settings/api-keys/route.ts:31`)

---

## 10a. Settings — Anthropic API Keys

> Tests the key hierarchy: org key → user key → env var key (rate-limited at 10/day per user).

### User-level key (Account Settings → `/settings`)

- [x] **Add key UI** — "Anthropic API key" section visible with "No key set" and "Add key" button; clicking reveals inline input with `sk-ant-…` placeholder; key value never displayed
- [x] **Invalid format** — entered "not-a-valid-key" → Save clicked → toast "Key must start with sk-ant-" shown; form stays open, field not cleared (code-confirmed: `ai-keys-card.tsx:22-25`)
- [x] **Save/remove API** — `PUT /api/settings/ai-key`: Zod validates `sk-ant-` prefix server-side + encrypts (AES-256-GCM) before storing; `DELETE` sets to null (code-reviewed)
- [ ] **Replace key** — _(not tested via UI — cannot enter real API key into form fields)_
- [ ] **Remove key** — _(not tested via UI — cannot enter real API key into form fields)_

### Org-level key (Organization Settings → `/settings/organization`)

- [x] **Add key (owner/admin)** — "Anthropic API key" section visible to owner/admin in `/settings/organization`; hidden for members (guarded by `canEdit` check in `OrgSettingsForm`)
- [x] **Member cannot manage** — `PUT /api/orgs/[id]/ai-key` checks membership role; returns 403 for non-owner/admin _(code-confirmed: `app/api/orgs/[id]/ai-key/route.ts:32-35`)_
- [x] **Save/remove API** — `PUT /api/orgs/[id]/ai-key`: validates Zod + encrypts same as user-level; `DELETE` clears field; both require owner/admin (code-reviewed)
- [ ] **Add/remove via UI** — _(not tested via UI — cannot enter real API key into form fields)_

### Key resolution order

- [x] **Env key fallback** — all AI features in this session used the env key successfully (AI draft/review findings, AI draft/review executive summary, AI generate playbook = 5+ uses)
- [x] **Rate limit tracking** — `aiUsageLog` row inserted per env-key use (code-confirmed: `lib/ai/client.ts:39-42`)
- [x] **Key resolution order code** — `lib/ai/client.ts` implements org key → user key → env key (rate-limited) → null; correct priority verified
- [ ] **Org key takes precedence** — _(not tested via UI — cannot enter real API key into form fields)_
- [ ] **User key takes precedence over env** — _(not tested via UI — cannot enter real API key into form fields)_
- [ ] **Rate limit enforced at threshold** — _(not tested — would require exhausting daily limit)_

---

## 11. Settings — OAuth Clients

- [x] **Create client** — New client → name → `ptgc_`-prefixed client ID and `ptgs_`-prefixed secret shown once in "Copy your credentials" dialog; client appears in list with Client ID column
- [x] **Token exchange** — `POST /api/oauth/token` with `grant_type=client_credentials` → 200 with `access_token`, `token_type`, `expires_in: 3600`
- [x] **Use token** — `POST /api/graphql` with `Authorization: Bearer <oauth_token>` → `{ me { email } }` returns authenticated user email
- [x] **Delete client** — click Revoke → client removed; subsequent `POST /api/oauth/token` with old credentials returns 401 `{"error":"invalid_client"}`

> **Note:** The token endpoint is `POST /api/oauth/token` (not `/api/auth/token`).

---

## 12. GraphQL / MCP API

- [x] **GraphiQL** — `GET /api/graphql` loads Yoga GraphiQL UI; unauthenticated introspection returns `{"error":"Unauthorized"}` (expected — schema requires auth)
- [x] **Authenticated query** — `POST /api/graphql` with `Authorization: Bearer ptg_...` → `{ me { email } }` returns `"testuser_manual@test.local"` (tested in §10 with a `ptg_` key and §11 with an OAuth token)
- [x] **MCP endpoint** — `GET /api/mcp` returns 401 (endpoint live, requires auth) _(full Claude Desktop integration test skipped — requires external setup)_

---

## 13. Regression — Existing Features

After any significant change, verify these still work end-to-end:

- [x] Register → login → create project → create finding → export report _(verified: project loads with 3 findings, report export returns 200 with `application/zip`)_
- [x] Playbook: create → publish → attach to project → link finding to item _(verified: Manual Test Playbook at v1.0 with 1 category/1 item; project creation with playbook tested in §4; finding link tested in §5)_
- [x] AI draft on a finding (streaming, no silent spinner, no token leak) — modal → "Drafting finding…" spinner → streamed content fills description + remediation → auto-saved as new version; no token visible in response
- [ ] Evidence image upload → visible in finding; URL persisted on save _(skipped — file upload not testable via automation in this session)_

---

## Bugs & Gaps Summary

| #   | Severity | Description                                                                                                                   |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | Medium   | `PATCH /api/projects/[id]` returns 500 on empty update (unknown fields stripped by Zod → `db.update(project).set({})` throws) |
| 2   | Low      | No API or UI to change `playbookVersionId` on an existing project (creation-only)                                             |
| 3   | Medium   | Evidence route `verifyAccess` checks `project.userId` not `project.organizationId` — will break for multi-user orgs           |
| 4   | Low      | "Set as default" template feature not implemented (`isDefault` column missing from schema)                                    |
