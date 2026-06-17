# Pentographer - Product Plan

AI-assisted cybersecurity audit reporting platform

---

## Vision

Pentographer is an open-source platform for writing, managing, and exporting web application security audit reports. It streamlines the reporting workflow for security consultants and students - from organizing findings to generating polished client-ready documents - while keeping the process repeatable and intelligent.

The platform is designed to be self-hosted with a single command, requires no paid services to run, and gives the user full ownership of their data.

---

## Core Entities

### User Account

A registered individual user of the platform. Users carry their own preferences, API access, and activity history.

### Customer

An entity representing the client being assessed. A customer can have multiple projects over time. Customer records store contact details and any customer-level context relevant across engagements.

### Project

A time-bound security assessment executed for a customer. The project is the central workspace - it ties together a customer, a playbook, all findings, and the final report.

Key attributes:

- Customer reference
- Assigned playbook **version** (pinned at project creation; changing the playbook does not affect active projects)
- Scope definition (URLs, IP ranges, authenticated roles tested)
- Status (In Progress / Under Review / Complete)
- Executive Summary - human-written or AI-drafted and AI-reviewed; **fully versioned** on every explicit save, with AI edits attributed to the AI as distinct versions. Any version can be restored
- Export history

### Playbook

A reusable, versioned checklist of security issues and testing directions that guides an assessment. Playbooks are inspired by industry standards (OWASP, PTES, etc.).

Key attributes:

- Name and description
- Version number (semantic versioning: v1.0, v1.1, v2.0, etc.)
- Ordered list of **checklist items**, organized in a two-level hierarchy:
  - **Category** (e.g. OWASP Top 10 > A01 Broken Access Control)
    - **Checklist item**, each containing:
      - Issue name (e.g. _SQL Injection_, _Insufficient Account Lockout_)
      - OWASP or other framework mapping
      - Description of what to look for
      - Default remediation guidance
      - Default risk classification (High / Medium / Low)
      - Whether the issue is active in this version
- Changelog between versions

A playbook can be forked, versioned, and reused across any number of projects. When a project is created, it snapshots the playbook version in use so the audit record is stable even as the playbook evolves.

### Finding

A single documented security issue discovered during an assessment. Findings are the core output of a project.

Key attributes:

- Optional reference to a playbook checklist item - findings can be linked to a checklist item for traceability, but this is not required. Findings added outside the playbook are marked **Ad-hoc** and still appear fully in the report
- Title and detailed description
- Risk level (High / Medium / Low - overridable from playbook default)
- CVSS score (optional) - a numeric CVSS v3 score that can accompany the risk classification
- Status (Draft / In Review / Confirmed / Informational / False Positive)
- **Version history** - every explicit save creates a new version. Each version snapshots all fields (text, risk level, status) and evidence file URLs (files live in blob storage; versions store the URL, not the file itself). AI-generated drafts and AI review changes are saved as their own named versions, clearly attributed to the AI. Any version can be restored
- Evidence - one or more of:
  - Screenshots (uploaded images)
  - Raw HTTP request/response captures
  - Free-text narrative
  - Code snippets
- Description and remediation recommendation written in **Markdown**. The UI renders a side-by-side editor/preview.
- AI assistance:
  - **AI Draft** - generate a finding description from evidence and title
  - **AI Review** - validate that the written finding is coherent, complete, and consistent with the risk level
  - **AI Suggest** - recommend related issues that may also be present

### Report Template

A configuration that controls how project data is presented in the exported report.

**V1** ships with a single built-in static template modelled on the standard security assessment report format (cover page, confidentiality notice, executive summary, scope, findings table, evidence). No authoring UI in V1.

**Future versions** will introduce custom templates with configurable cover page branding, section ordering, and layout styles.

---

## AI Features

| Feature                  | Where    | Description                                                                      |
| ------------------------ | -------- | -------------------------------------------------------------------------------- |
| Executive Summary Draft  | Project  | LLM drafts a summary based on finding counts, risk levels, and key issues        |
| Executive Summary Review | Project  | LLM scores/critiques a human-written summary for clarity and accuracy            |
| Finding Draft            | Finding  | LLM writes a finding description from a title, risk level, and uploaded evidence |
| Finding Review           | Finding  | LLM checks a finding for completeness, coherence, and appropriate severity       |
| Finding Suggest          | Finding  | LLM recommends related issues that commonly co-occur                             |
| Playbook Generation      | Playbook | LLM generates a starter playbook from a description of the application type      |

All AI features require the user to supply their own LLM API key via environment variable. No AI calls are proxied through Pentographer infrastructure.

---

## Requirements

### Open Source

The entire platform is released under an OSI-approved open-source license (MIT or Apache 2.0). The codebase is publicly hosted and welcomes community contributions.

### Self-Hosted

A single `docker-compose up` brings the full stack online. Environment variables configure external services (object storage, email, LLM provider). No external accounts or paid services are required to run a fully functional instance.

### Export

- **Findings export** - individual findings exportable as JSON, CSV, or Markdown at any time.
- **Full project export** - one-click export of the complete report to:
  - Microsoft Word (.docx)
  - PDF
  - Google Docs (via Google Drive API)
- Exports respect the selected Report Template for formatting and branding.
- Raw data export (JSON) available for all projects for archival or migration.

---

## Security Considerations

Pentographer aggregates the most sensitive output of a security engagement - a complete map of a client's vulnerabilities. Its security posture must be held to a higher standard than a typical application.

### Findings Workflow Integrity

**Chain of custody.** The version history tracks saves but not views. In legal engagements and breach investigations, clients will ask who saw a finding, when, and whether it was modified between discovery and delivery. A read audit log is required alongside the write version history to provide a complete and provable chain of custody.

**Status transition controls.** Finding status transitions must be directional and controlled. Backwards status transitions (e.g. Confirmed back to Draft) must require an explicit written justification that is permanently recorded in the audit log and cannot be edited or deleted.

**Authorship integrity.** The `author_type` field must be bound server-side to the authenticated session at save time and never accepted from the client. A plain string accepted from the client can be spoofed to misattribute findings - a serious problem in any context where the report has legal or compliance weight.

### Authentication

**Session binding.** All authenticated sessions must be cryptographically bound to the user context. API tokens issued for programmatic access must support expiry, rotation, and immediate revocation.

**Evidence URL security.** Blob storage URLs for evidence files must be signed and short-lived, generated on demand rather than stored as permanent links.

### Platform Security Posture

- **Responsible disclosure policy** - a public security.txt and disclosure process is in place from day one.
- **Dependency management** - automated scanning for vulnerable dependencies (e.g. via Dependabot) is active in the repository from day one.
- **Export sanitization** - all finding content is treated as untrusted input by the export pipeline regardless of authorship. Markdown-to-DOCX conversion must sanitize content to prevent document-level injection attacks via crafted finding descriptions.

---

## Proposed Tech Stack

| Layer            | Choice                              | Rationale                                                                                                                      |
| ---------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Frontend         | Next.js (React)                     | SSR, great ecosystem, easy to self-host                                                                                        |
| Backend          | Node.js / Fastify                   | Same language as the frontend, strong ecosystem for file handling and streaming                                                |
| Database         | PostgreSQL                          | Relational, strong JSON support, widely hosted                                                                                 |
| File Storage     | S3-compatible (MinIO for self-host) | Works on any cloud; MinIO is a drop-in for on-prem                                                                             |
| Auth             | Auth.js                             | Open source, framework-native for Next.js, supports OAuth providers (Google, GitHub, etc.), email magic links, and credentials |
| LLM              | Anthropic Claude API (pluggable)    | Provider-agnostic interface; users supply their own API key                                                                    |
| Export           | docx.js + Google Drive API          | Proven libraries for Word/Google Docs generation                                                                               |
| Containerization | Docker + Docker Compose             | Single-command self-host deployment                                                                                            |

---

## High-Level Roadmap

### Phase 1 - Foundation

- User account and authentication
- Customer and project management
- Basic finding creation (text + screenshot upload)
- Playbook creation and versioning
- **Standard built-in playbook** - a pre-built, versioned playbook modelled on the OWASP Top 10 and common web application security assessment findings (SQL injection, XSS, CSRF, session management issues, etc.), ready to use out of the box
- Word/PDF export

### Phase 2 - AI Integration

- AI-assisted finding drafting and review
- AI executive summary generation and critique
- AI playbook generation from app description

### Phase 3 - Polish

- Google Docs export
- Report template builder UI
- Finding status workflow and comments

### Phase 4 - Ecosystem

- Public playbook library (community-contributed)
- Webhooks and API for third-party integrations
- Audit trail and compliance logging

---

## Entity Relationship Diagram

```
USER_ACCOUNT  ||--o{ PROJECT  : owns
USER_ACCOUNT  ||--o{ PLAYBOOK : owns

PLAYBOOK         ||--o{ PLAYBOOK_VERSION  : "versioned as"
PLAYBOOK_VERSION ||--o{ PLAYBOOK_CATEGORY : contains
PLAYBOOK_CATEGORY ||--o{ PLAYBOOK_ITEM   : contains

CUSTOMER         ||--o{ PROJECT           : "assessed in"
PLAYBOOK_VERSION ||--o{ PROJECT           : "pinned to"

PROJECT ||--o{ EXECUTIVE_SUMMARY_VERSION : "has versions"
PROJECT ||--o{ FINDING                   : contains

PLAYBOOK_ITEM ||--o{ FINDING         : "optionally linked (nullable)"
FINDING       ||--o{ FINDING_VERSION : "versioned as"
```

### Key design decisions

- **`PLAYBOOK_VERSION` is the pinned entity on `PROJECT`** - not the playbook itself. Updating a playbook never silently changes an in-progress project.
- **`PLAYBOOK_CATEGORY -> PLAYBOOK_ITEM`** provides the two-level nested structure (e.g. OWASP Top 10 > A01 Broken Access Control > specific tests).
- **`FINDING.playbook_item_id` is nullable** - loose coupling. Ad-hoc findings have no linked checklist item; standard findings do.
- **`FINDING_VERSION.evidence_urls`** is stored as JSON - an array of blob storage URLs snapshotted at save time. The files themselves live in blob storage and are never overwritten.
- **`author_type`** on both `FINDING_VERSION` and `EXECUTIVE_SUMMARY_VERSION` distinguishes `"human"` from `"ai"` so the version history UI can clearly attribute AI edits. This value is set server-side and never accepted from the client.
- **Read audit log** - a separate `AUDIT_LOG` table (not shown) records all read and write events against findings and projects, providing a complete chain of custody beyond just the version history.

### Table summaries

| Table                       | Purpose                                                         |
| --------------------------- | --------------------------------------------------------------- |
| `USER_ACCOUNT`              | Registered user; authenticated via Auth.js                      |
| `CUSTOMER`                  | Client being assessed                                           |
| `PLAYBOOK`                  | Reusable test plan; owned by a user                             |
| `PLAYBOOK_VERSION`          | Immutable snapshot of a playbook at a point in time             |
| `PLAYBOOK_CATEGORY`         | Top-level grouping within a version (e.g. OWASP category)       |
| `PLAYBOOK_ITEM`             | Individual checklist item within a category                     |
| `PROJECT`                   | A single assessment engagement; pinned to a playbook version    |
| `EXECUTIVE_SUMMARY_VERSION` | Versioned snapshot of the project executive summary             |
| `FINDING`                   | A single discovered issue; optionally linked to a playbook item |
| `FINDING_VERSION`           | Full snapshot of a finding at each explicit save                |
