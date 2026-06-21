# Export Pipeline — Gap Analysis & Plan

## Context

Analysis based on a real UC Berkeley web application security assessment report template
(Google Doc). Goal: make Pentographer's Word export capable of fully populating this
template (and templates like it) without manual editing.

Reference template structure:

1. Cover page
2. Confidentiality Notice / Disclaimer (static boilerplate)
3. Executive Summary (prose + risk count table)
4. Scope
5. Security Assessment Findings (summary table + per-finding detail table)
6. Evidence & Screenshots (per-finding subsections with embedded images)

---

## Approach: Option A — prose owns its section, data owns tables

Free-form fields (exec summary, scope) are written by the consultant in Pentographer and
replace their entire template section wholesale. Structured data (finding counts, finding
list, evidence) is auto-generated from the database. The two never fight over the same
content.

Consequence: the AI draft prompt for exec summary should note that a risk breakdown table
is auto-generated — the consultant's prose should not repeat the counts.

---

## Stream 1 — Data model gaps

Missing fields that block complete template population.

### 1a. `project` table — new fields

| Field            | Type                            | Notes                                                                                |
| ---------------- | ------------------------------- | ------------------------------------------------------------------------------------ |
| `applicationUrl` | `text` (nullable)               | Structured URL of the app under test; replaces unstructured `scope` for this purpose |
| `testAccounts`   | `json` (`[{ role, username }]`) | Accounts used during the assessment; variable-length list                            |
| `reportVersion`  | `text` (nullable)               | Defaults to `"1.0"` at export if not set                                             |

### 1b. `userAccount` / settings — new field

| Field              | Type              | Notes                                                                                              |
| ------------------ | ----------------- | -------------------------------------------------------------------------------------------------- |
| `organizationName` | `text` (nullable) | The consulting firm / team name; appears in "Prepared by" and "X performed a security assessment…" |

Likely better as a user-level setting rather than per-project, since it rarely changes.

### Migration

- New Drizzle migration adding the three project columns and one user column
- All new columns nullable — no backfill required
- Expose `applicationUrl`, `testAccounts`, `reportVersion` in the project create/edit UI
- Expose `organizationName` in Settings

---

## Stream 2 — Template authoring: Docxtemplater loop syntax

The Google Doc (and most human-authored templates) use static example rows. Docxtemplater
needs explicit loop tags in the `.docx` to generate dynamic rows.

### What consultants need to do (document in template marketplace)

Replace static example rows with loop syntax in their `.docx` before uploading:

**Findings summary table (one row per finding):**

```
{#findings}
| {number} | {title} | {riskLevelLabel} |
{/findings}
```

**Finding detail table (one row per finding):**

```
{#findings}
| {number} | {title}\n{description} | {remediation} | {riskLevelLabel} |
{/findings}
```

**Evidence section (one subsection per finding with images):**

```
{#findings}
## {number}. {title}
{#evidenceImages}{%image}{/evidenceImages}
{/findings}
```

### What we expose in templateData (additions to word-template.ts)

Current `findings` array items gain:

- `number` — sequential integer (1, 2, 3…) assigned at export time, sorted by risk level
- `applicationUrl` — from new project field
- `testAccounts` — array for its own loop `{#testAccounts}{role}: {username}{/testAccounts}`
- `reportVersion` — from new project field, defaults to `"1.0"`
- `organizationName` — from user settings
- `monthYear` — formatted `month_year_report_created` (e.g. "June 2026")
- `evidenceImages` — array of fetched image buffers (see Stream 3)

Risk count table in exec summary:

- Already exposed: `highCount`, `mediumCount`, `lowCount`, `infoCount`
- Template cells just need `{highCount}` etc. — no loop required

### What we should ship alongside

A **starter `.docx` template** in the repo (`public/templates/starter.docx`) that is
already correctly structured with all loop tags. Consultants download it, customise
branding/boilerplate, and re-upload. This removes the authoring burden for the common
case.

---

## Stream 3 — Evidence image embedding

Currently `evidenceText` in `word-template.ts` outputs plain-text URLs. The template
expects embedded images.

### Approach

Use `docxtemplater-image-module-free` (or the paid `docxtemplater-image-module`) to embed
images inline.

At export time, for each finding, for each evidence item whose content type is an image:

1. Call `getStorage().get(url)` — already available from Stream A
2. Pass the buffer to the image module
3. Skip non-image evidence (PDFs, etc.) — render as `[Attachment: filename]` text instead

### Template syntax (with image module)

```
{%image}   ← single image variable
```

In the findings loop:

```
{#evidenceImages}
{%image}
{caption}
{/evidenceImages}
```

`evidenceImages` items: `{ image: Buffer, caption: string }` where caption is the fig key
(e.g. `fig-1`).

### Constraints

- Max image dimensions should be capped (e.g. 15cm wide) to avoid overflowing page
- PDFs cannot be embedded in DOCX — render as a note: `[PDF attachment: fig-2]`
- SVGs are not supported by Word — convert to PNG at embed time using `sharp` or skip

---

## Stream 4 — UI: project fields

New fields need UI entry points.

### Project create / edit form

- `Application URL` — text input, shown below Scope
- `Report version` — text input with placeholder `1.0`, shown in export settings
- `Test accounts` — dynamic list: `+ Add account` button, each row has Role + Username
  fields, removable

### Settings page

- `Organization name` — text input under a new "Profile" or "Reporting" section
- Used as the "Prepared by" name on cover pages

---

## Token reference (complete)

All tokens available in `templateData` after all streams complete:

| Token                                                                             | Source                                                   |
| --------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `{application_name}` → `{projectName}`                                            | `project.name`                                           |
| `{report_version}` → `{reportVersion}`                                            | `project.reportVersion` \|\| `"1.0"`                     |
| `{report_date}` → `{exportDate}`                                                  | Generated at export time                                 |
| `{month_year}`                                                                    | Generated at export time                                 |
| `{author_names}` → `{organizationName}`                                           | `userAccount.organizationName`                           |
| `{presenting_to}` → `{customerName}`                                              | `customer.name`                                          |
| `{application_url}` → `{applicationUrl}`                                          | `project.applicationUrl`                                 |
| `{#testAccounts}{role}{username}{/testAccounts}`                                  | `project.testAccounts`                                   |
| `{execSummary}`                                                                   | `executiveSummaryVersion.content` (markdown stripped)    |
| `{highCount}` `{mediumCount}` `{lowCount}` `{infoCount}`                          | Computed from findings                                   |
| `{#findings}{number}{title}{riskLevelLabel}{description}{remediation}{/findings}` | `finding` + `findingVersion`                             |
| `{#findings}{#evidenceImages}{%image}{caption}{/evidenceImages}{/findings}`       | `findingVersion.evidenceUrls` fetched via `getStorage()` |

---

## Sequence

1. **Stream 1** — schema + migration + UI for new fields (no export changes, unblocks 2 & 4)
2. **Stream 2** — extend `templateData` with new tokens + ship starter `.docx` template
3. **Stream 3** — image embedding via image module
4. **Stream 4** — UI for new project fields (can run in parallel with 2 & 3)

---

## Out of scope (for now)

- PDF export image embedding (separate renderer)
- Multi-author support (team members on a project)
- Automatic scope parsing (extracting URL/accounts from free-text scope)
- Markdown-to-DOCX formatting (bold, lists inside finding descriptions — currently stripped)
