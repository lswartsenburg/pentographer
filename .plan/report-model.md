# Report & Report Version — New Core Concept

## Why

A pentest engagement (project) produces multiple deliverables: an interim report when
critical findings need immediate escalation, a final report at close, a re-test report
after remediation. These are distinct documents with different audiences, different exec
summaries, and different finding states. The current model collapses all of this into a
single export from the project, which doesn't reflect how the work actually flows.

---

## New mental model

| Concept            | What it is                                                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Project**        | The engagement — customer, scope, dates, playbook, findings                                                                               |
| **Report**         | A named deliverable from a project ("Final Report", "Re-test Report")                                                                     |
| **Report version** | A draft or published revision of a report — owns the exec summary and, at publish time, a snapshot of which finding versions were current |

One project → many reports. One report → many versions.

---

## Schema

### `report` table

```ts
export const report = pgTable("report", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => userAccount.id, { onDelete: "cascade" }),
  templateId: uuid("template_id").references(() => reportTemplate.id, { onDelete: "set null" }),
  name: text("name").notNull(), // "Final Report", "Re-test Report", …
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

### `report_version` table

```ts
export const reportVersionStatusEnum = pgEnum("report_version_status", [
  "draft",
  "in_review",
  "published",
]);

export const reportVersion = pgTable("report_version", {
  id: uuid("id").primaryKey().defaultRandom(),
  reportId: uuid("report_id")
    .notNull()
    .references(() => report.id, { onDelete: "cascade" }),
  version: text("version").notNull(), // "1.0", "1.1", "2.0"
  status: reportVersionStatusEnum("status").notNull().default("draft"),
  execSummary: text("exec_summary").notNull().default(""),
  authorType: authorTypeEnum("author_type").notNull().default("human"),
  // null while draft — populated at publish time
  findingSnapshot: json("finding_snapshot")
    .$type<{ findingId: string; findingVersionId: string }[]>()
    .default(null),
  reportDate: timestamp("report_date"), // the date shown on the cover; defaults to publishedAt
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

### What disappears

`executiveSummaryVersion` table is removed. Its data migrates into `reportVersion.execSummary`.

---

## Finding snapshot mechanism

| Status                | Export uses                                                                 |
| --------------------- | --------------------------------------------------------------------------- |
| `draft` / `in_review` | Latest `findingVersion` for each finding (live state)                       |
| `published`           | The specific `findingVersionId` stored in `findingSnapshot` at publish time |

**Publish action (server-side):**

1. For each finding in the project, find its latest `findingVersion.id`
2. Write `{ findingId, findingVersionId }[]` into `reportVersion.findingSnapshot`
3. Set `status = "published"`, `publishedAt = now()`
4. Set `reportDate` to now() if not already set

Once published, a report version is immutable. Further edits require creating a new version.

---

## Migration

For each project that has `executiveSummaryVersion` records:

1. Create a `report` row: `name = "Final Report"`, `templateId = null`
2. Create a `reportVersion` row: `version = "1.0"`, `status = "draft"`,
   `execSummary = latest executiveSummaryVersion.content`

Projects with no exec summary still get a default `report` + `reportVersion` (empty exec summary).

Drop `executive_summary_version` table after migration is verified.

---

## API routes

### Reports (CRUD)

| Method   | Path                                    | Action                         |
| -------- | --------------------------------------- | ------------------------------ |
| `GET`    | `/api/projects/[id]/reports`            | List all reports for a project |
| `POST`   | `/api/projects/[id]/reports`            | Create a new report            |
| `GET`    | `/api/projects/[id]/reports/[reportId]` | Get report + its versions      |
| `PATCH`  | `/api/projects/[id]/reports/[reportId]` | Update name / templateId       |
| `DELETE` | `/api/projects/[id]/reports/[reportId]` | Delete report (and versions)   |

### Report versions (CRUD)

| Method   | Path                                                         | Action                                             |
| -------- | ------------------------------------------------------------ | -------------------------------------------------- |
| `GET`    | `/api/projects/[id]/reports/[reportId]/versions`             | List versions                                      |
| `POST`   | `/api/projects/[id]/reports/[reportId]/versions`             | Create new version (optionally fork from existing) |
| `GET`    | `/api/projects/[id]/reports/[reportId]/versions/[versionId]` | Get version                                        |
| `PATCH`  | `/api/projects/[id]/reports/[reportId]/versions/[versionId]` | Save exec summary / reportDate                     |
| `DELETE` | `/api/projects/[id]/reports/[reportId]/versions/[versionId]` | Delete (only if not published)                     |

### Report version actions

| Method | Path                                 | Action                             |
| ------ | ------------------------------------ | ---------------------------------- |
| `POST` | `.../versions/[versionId]/publish`   | Snapshot findings + mark published |
| `POST` | `.../versions/[versionId]/ai/draft`  | AI-draft exec summary              |
| `POST` | `.../versions/[versionId]/ai/review` | AI-review exec summary             |
| `POST` | `.../versions/[versionId]/export`    | Export DOCX or PDF                 |

### Routes that go away

- `GET/POST /api/projects/[id]/executive-summary` → absorbed into report version
- `POST /api/projects/[id]/executive-summary/ai/draft` → moved to report version
- `POST /api/projects/[id]/executive-summary/ai/review` → moved to report version
- `POST /api/projects/[id]/export` → moved to report version

---

## UI

### Project page

Replace the current "Executive Summary" panel with a **Reports** section.

**Reports list (within project):**

- Each report shown as a card: name, template name, list of versions with status badges
- "New report" button → name input + optional template picker
- Click a version → opens the report version editor

**Report version editor (new page: `/projects/[id]/reports/[reportId]/versions/[versionId]`):**

- Header: report name, version string, status badge, "Publish" button, "Export" button
- Exec summary editor (same markdown editor as today, with AI draft / AI review buttons)
- Read-only finding summary: counts by risk level, list of findings included
- If published: banner "Published on [date] — create a new version to make changes"

**New version flow:**

- From the report page: "New version" button
- Modal: version string (pre-filled with next increment), option to fork exec summary
  from an existing version

### Project page sidebar / nav

Remove "Executive Summary" link. Add "Reports" link pointing to the reports section of
the project page.

### Export flow

Export is now initiated from within a report version, not from the project. The export
button on the project page (current `/projects/[id]/export`) is removed.

---

## Export changes (ties into export.md)

`generateDocxFromTemplate` receives a `reportVersion` instead of raw project data:

```ts
interface ReportExportData {
  // From project
  projectName: string;
  customerName: string;
  scope: string | null;
  applicationUrl: string | null; // new field (see export.md Stream 1)
  testAccounts: { role: string; username: string }[]; // new field
  organizationName: string | null; // from userAccount settings

  // From report
  reportName: string;
  templateId: string | null;

  // From report version
  version: string;
  reportDate: string;
  execSummary: string;

  // Findings — either live or from snapshot
  findings: ExportFinding[];
}
```

The export route resolves findings differently based on publish status:

- Draft: `SELECT * FROM finding_version WHERE finding_id = X ORDER BY created_at DESC LIMIT 1`
- Published: `SELECT * FROM finding_version WHERE id IN (snapshot[*].findingVersionId)`

---

## Sequence

1. Schema + migration (new tables, migrate exec summary data, drop old table)
2. API routes (CRUD + publish + export)
3. UI — Reports section on project page + report version editor page
4. Remove old executive summary routes + export route
5. Update export pipeline to consume ReportExportData

---

## Open questions

- **Who can see reports?** Currently everything is scoped to `userId`. If multi-user teams
  are ever added, reports may need their own access model. For now: same owner as project.
- **Re-test reports and findings scope:** A re-test report might only cover a subset of
  findings. Future feature: allow a report to include only selected findings.
- **Version numbering:** Auto-increment from last version, or always manual? Suggest
  auto-incrementing the minor version (1.0 → 1.1) with the option to override.
