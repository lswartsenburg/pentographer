# Pentographer — Demo Script

**Target length:** ~4–6 minutes  
**Audience:** Security consultants, pentest team leads  
**Goal:** Show the end-to-end workflow from project setup → finding capture → published report

---

## 0. Hook (15 s)

> "Pentest reporting is the part nobody talks about — but it's what clients actually see. Pentographer is a purpose-built tool that handles the full audit lifecycle: structured findings, evidence, AI-assisted drafting, and clean Word exports. Let me show you how a real engagement looks."

---

## 1. Project setup (45 s)

**Action:** Open the Projects list, click **New project**.

> "I'll create a project for a fictional client — Acme Corp. I'll link it to the customer record and attach the playbook we use for web application audits."

- Set name: `Acme Corp — Web Application Audit Q2`
- Select customer: `Acme Corp`
- Attach playbook: `Web Application Security v1.2`
- Set application URL and start/end dates
- Add two test accounts with roles (`admin`, `standard-user`) — show that passwords are stored encrypted, not plain text.

> "Test account credentials are AES-256 encrypted at rest. No one can read the password back out of the database."

---

## 2. Playbook — finding the right checks (45 s)

**Action:** Navigate to the playbook attached to the project. Use the search box.

> "The playbook has dozens of categories and items. Instead of scrolling, I can search. Let me find the SQL injection checks."

- Type `sql` in the sidebar search — results appear instantly (Fuse.js fuzzy match).
- Click a result to open the item detail — show the description, default remediation, and risk rating.

> "Each item has a description of what to look for and a default remediation. When I log a finding from a playbook item, these pre-fill automatically."

---

## 3. Logging a finding (60 s)

**Action:** Go to the project, open the Findings tab, click **New finding**.

> "I found a SQL injection vulnerability in the login endpoint. I'll log it against the playbook item."

- Select the playbook item (SQL Injection)
- Title auto-fills from the item
- Risk level: **High**
- Upload 1–2 evidence screenshots (drag-and-drop)

> "Evidence is uploaded directly — no manual screenshot management in separate folders."

**Action:** Click **AI Draft**.

> "I can ask the AI to draft the description and remediation using the evidence I just uploaded. It reads the screenshots and writes a technical finding."

- Show the AI-generated description appearing
- Make a small manual edit to show it's editable

> "It's a starting point, not the final word. I edit it like any other text."

- Save the finding and set status to **Confirmed**

---

## 4. Executive summary (30 s)

**Action:** Open the Executive Summary tab on the project.

> "Once the findings are in, I can draft an executive summary. Again, AI can pull in the confirmed findings and write a first draft."

- Click **AI Draft** — show summary appearing
- Briefly skim the output

> "This writes to a non-technical audience. I always review and adjust tone, but the structure and statistics are pulled directly from the findings."

---

## 5. Report version (60 s)

**Action:** Go to Reports, click **New report**, then open the draft version.

> "Reports in Pentographer are versioned. I create a named report — 'Final Report' — and the first version starts as a draft."

- Show the finding inclusion panel: all confirmed findings are checked by default; draft findings are greyed out and excluded
- Uncheck one finding to demonstrate manual exclusion

> "I can include or exclude individual findings before I publish. Draft findings are excluded by default."

- Click **Publish** — show the published version with a pinned snapshot

> "Publishing creates a permanent snapshot. Even if findings change later, this version is frozen."

---

## 6. Export (30 s)

**Action:** Open the project export page, select a Word template from the template library.

> "The published report exports to Word using a custom DOCX template. The client's logo, colour scheme, and section order are all in the template. I'm not fighting with styles in Word — I'm just filling in the data."

- Select a template, click **Export**
- Show the downloaded DOCX (open briefly if possible)

> "The output is a ready-to-send report. No copy-pasting from a wiki, no manual table of contents."

---

## 7. Wrap-up (30 s)

> "Pentographer handles the full loop: structured playbooks, encrypted credentials, AI-assisted drafting, versioned reports, and clean exports. Everything in one place, nothing leaking out to a third-party note-taking tool."

> "It's open source and designed for self-hosting — your pentest data never has to leave your own infrastructure."

**End on the published report view or the project overview.**

---

## Recording notes

- Use the dark theme if available for better contrast on video
- Keep the browser window at 1280×800 or 1440×900 — avoids tiny text
- Pause 1–2 s after each major navigation so cuts are clean
- Use a real (non-lorem-ipsum) finding title and description — it reads better on camera
- If demoing AI features, have `ANTHROPIC_API_KEY` set in `.env.local` beforehand — the generation takes ~5 s and shouldn't hang mid-recording
