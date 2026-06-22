import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";

export type EvidenceItem = { key: string; url: string };

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Mirrors PG uuid().primaryKey().defaultRandom()
const uid = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

// Mirrors PG uuid() FK reference (non-PK)
const fkText = (col: string) => text(col);

// Mirrors PG timestamp().notNull().defaultNow()
const tsNow = (col: string) =>
  integer(col, { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

// Mirrors PG timestamp() (nullable)
const tsNull = (col: string) => integer(col, { mode: "timestamp_ms" });

// Mirrors PG json().$type<T>()
function jsonCol<T>(col: string) {
  return text(col, { mode: "json" }).$type<T>();
}

// ─── Tables ──────────────────────────────────────────────────────────────────

export const userAccount = sqliteTable("user_account", {
  id: uid(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  organizationName: text("organization_name"),
  createdAt: tsNow("created_at"),
});

export const customer = sqliteTable("customer", {
  id: uid(),
  userId: fkText("user_id")
    .notNull()
    .references(() => userAccount.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  contactEmail: text("contact_email"),
  createdAt: tsNow("created_at"),
});

export const playbook = sqliteTable("playbook", {
  id: uid(),
  userId: fkText("user_id").references(() => userAccount.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(false),
  createdAt: tsNow("created_at"),
});

export const playbookVersion = sqliteTable("playbook_version", {
  id: uid(),
  playbookId: fkText("playbook_id")
    .notNull()
    .references(() => playbook.id, { onDelete: "cascade" }),
  version: text("version").notNull(),
  changelog: text("changelog"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  status: text("status").notNull().default("draft"),
  createdAt: tsNow("created_at"),
});

export const playbookCategory = sqliteTable("playbook_category", {
  id: uid(),
  playbookVersionId: fkText("playbook_version_id")
    .notNull()
    .references(() => playbookVersion.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  frameworkRef: text("framework_ref"),
  displayOrder: integer("display_order").notNull().default(0),
});

export const playbookItem = sqliteTable("playbook_item", {
  id: uid(),
  categoryId: fkText("category_id")
    .notNull()
    .references(() => playbookCategory.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  defaultRemediation: text("default_remediation"),
  defaultRisk: text("default_risk")
    .$type<"high" | "medium" | "low" | "informational">()
    .notNull()
    .default("medium"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
});

// password is stored AES-256-GCM encrypted (see lib/crypto.ts); never stored plaintext
export type TestAccount = { role: string; username: string; encryptedPassword?: string };

export const project = sqliteTable("project", {
  id: uid(),
  userId: fkText("user_id")
    .notNull()
    .references(() => userAccount.id, { onDelete: "cascade" }),
  customerId: fkText("customer_id")
    .notNull()
    .references(() => customer.id, { onDelete: "restrict" }),
  playbookVersionId: fkText("playbook_version_id").references(() => playbookVersion.id, {
    onDelete: "restrict",
  }),
  name: text("name").notNull(),
  status: text("status")
    .$type<"in_progress" | "under_review" | "complete">()
    .notNull()
    .default("in_progress"),
  scope: text("scope"),
  applicationUrl: text("application_url"),
  testAccounts: jsonCol<TestAccount[]>("test_accounts"),
  startDate: tsNull("start_date"),
  endDate: tsNull("end_date"),
  createdAt: tsNow("created_at"),
});

export const finding = sqliteTable("finding", {
  id: uid(),
  projectId: fkText("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  playbookItemId: fkText("playbook_item_id").references(() => playbookItem.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  riskLevel: text("risk_level")
    .$type<"high" | "medium" | "low" | "informational">()
    .notNull()
    .default("medium"),
  cvssScore: text("cvss_score"),
  status: text("status")
    .$type<"draft" | "in_review" | "confirmed" | "informational" | "false_positive">()
    .notNull()
    .default("draft"),
  isAdhoc: integer("is_adhoc", { mode: "boolean" }).notNull().default(false),
  createdAt: tsNow("created_at"),
});

export const findingVersion = sqliteTable("finding_version", {
  id: uid(),
  findingId: fkText("finding_id")
    .notNull()
    .references(() => finding.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  remediation: text("remediation"),
  riskLevel: text("risk_level").$type<"high" | "medium" | "low" | "informational">().notNull(),
  cvssScore: text("cvss_score"),
  status: text("status")
    .$type<"draft" | "in_review" | "confirmed" | "informational" | "false_positive">()
    .notNull(),
  evidenceUrls: jsonCol<EvidenceItem[]>("evidence_urls")
    .notNull()
    .default(sql`'[]'`),
  // authorType is always set server-side; never accepted from the client
  authorType: text("author_type").$type<"human" | "ai">().notNull(),
  createdAt: tsNow("created_at"),
});

export const executiveSummaryVersion = sqliteTable("executive_summary_version", {
  id: uid(),
  projectId: fkText("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  content: text("content").notNull().default(""),
  // authorType is always set server-side; never accepted from the client
  authorType: text("author_type").$type<"human" | "ai">().notNull(),
  createdAt: tsNow("created_at"),
});

export const report = sqliteTable("report", {
  id: uid(),
  projectId: fkText("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  userId: fkText("user_id")
    .notNull()
    .references(() => userAccount.id, { onDelete: "cascade" }),
  templateId: text("template_id"),
  name: text("name").notNull(),
  createdAt: tsNow("created_at"),
});

export type FindingSnapshotItem = { findingId: string; findingVersionId: string };

export const reportVersion = sqliteTable("report_version", {
  id: uid(),
  reportId: fkText("report_id")
    .notNull()
    .references(() => report.id, { onDelete: "cascade" }),
  version: text("version").notNull(),
  status: text("status").$type<"draft" | "in_review" | "published">().notNull().default("draft"),
  execSummary: text("exec_summary").notNull().default(""),
  authorType: text("author_type").$type<"human" | "ai">().notNull().default("human"),
  findingSnapshot: jsonCol<FindingSnapshotItem[]>("finding_snapshot"),
  includedFindingIds: jsonCol<string[]>("included_finding_ids"),
  reportDate: tsNull("report_date"),
  publishedAt: tsNull("published_at"),
  createdAt: tsNow("created_at"),
});

export const reportTemplate = sqliteTable("report_template", {
  id: uid(),
  userId: fkText("user_id")
    .notNull()
    .references(() => userAccount.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  version: text("version"),
  language: text("language"),
  publishNotes: text("publish_notes"),
  blobUrl: text("blob_url").notNull(),
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(false),
  downloadCount: integer("download_count").notNull().default(0),
  uploadedAt: tsNow("uploaded_at"),
});

export const auditLog = sqliteTable("audit_log", {
  id: uid(),
  userId: fkText("user_id").references(() => userAccount.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  metadata: jsonCol<Record<string, unknown>>("metadata"),
  createdAt: tsNow("created_at"),
});

export const apiKey = sqliteTable("api_key", {
  id: uid(),
  userId: fkText("user_id")
    .notNull()
    .references(() => userAccount.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  createdAt: tsNow("created_at"),
  lastUsedAt: tsNull("last_used_at"),
  expiresAt: tsNull("expires_at"),
});

export const oauthClient = sqliteTable("oauth_client", {
  id: uid(),
  userId: fkText("user_id")
    .notNull()
    .references(() => userAccount.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  clientId: text("client_id").notNull().unique(),
  clientSecretHash: text("client_secret_hash").notNull(),
  createdAt: tsNow("created_at"),
  lastUsedAt: tsNull("last_used_at"),
});

// ─── Relations (identical structure to schema.ts) ────────────────────────────

export const userAccountRelations = relations(userAccount, ({ many }) => ({
  customers: many(customer),
  playbooks: many(playbook),
  projects: many(project),
  reportTemplates: many(reportTemplate),
  apiKeys: many(apiKey),
  oauthClients: many(oauthClient),
}));

export const reportTemplateRelations = relations(reportTemplate, ({ one }) => ({
  user: one(userAccount, { fields: [reportTemplate.userId], references: [userAccount.id] }),
}));

export const customerRelations = relations(customer, ({ one, many }) => ({
  user: one(userAccount, { fields: [customer.userId], references: [userAccount.id] }),
  projects: many(project),
}));

export const playbookRelations = relations(playbook, ({ one, many }) => ({
  user: one(userAccount, { fields: [playbook.userId], references: [userAccount.id] }),
  versions: many(playbookVersion),
}));

export const playbookVersionRelations = relations(playbookVersion, ({ one, many }) => ({
  playbook: one(playbook, { fields: [playbookVersion.playbookId], references: [playbook.id] }),
  categories: many(playbookCategory),
  projects: many(project),
}));

export const playbookCategoryRelations = relations(playbookCategory, ({ one, many }) => ({
  playbookVersion: one(playbookVersion, {
    fields: [playbookCategory.playbookVersionId],
    references: [playbookVersion.id],
  }),
  items: many(playbookItem),
}));

export const playbookItemRelations = relations(playbookItem, ({ one, many }) => ({
  category: one(playbookCategory, {
    fields: [playbookItem.categoryId],
    references: [playbookCategory.id],
  }),
  findings: many(finding),
}));

export const projectRelations = relations(project, ({ one, many }) => ({
  user: one(userAccount, { fields: [project.userId], references: [userAccount.id] }),
  customer: one(customer, { fields: [project.customerId], references: [customer.id] }),
  playbookVersion: one(playbookVersion, {
    fields: [project.playbookVersionId],
    references: [playbookVersion.id],
  }),
  findings: many(finding),
  executiveSummaryVersions: many(executiveSummaryVersion),
  reports: many(report),
}));

export const findingRelations = relations(finding, ({ one, many }) => ({
  project: one(project, { fields: [finding.projectId], references: [project.id] }),
  playbookItem: one(playbookItem, {
    fields: [finding.playbookItemId],
    references: [playbookItem.id],
  }),
  versions: many(findingVersion),
}));

export const findingVersionRelations = relations(findingVersion, ({ one }) => ({
  finding: one(finding, { fields: [findingVersion.findingId], references: [finding.id] }),
}));

export const executiveSummaryVersionRelations = relations(executiveSummaryVersion, ({ one }) => ({
  project: one(project, {
    fields: [executiveSummaryVersion.projectId],
    references: [project.id],
  }),
}));

export const reportRelations = relations(report, ({ one, many }) => ({
  project: one(project, { fields: [report.projectId], references: [project.id] }),
  user: one(userAccount, { fields: [report.userId], references: [userAccount.id] }),
  versions: many(reportVersion),
}));

export const reportVersionRelations = relations(reportVersion, ({ one }) => ({
  report: one(report, { fields: [reportVersion.reportId], references: [report.id] }),
}));

export const apiKeyRelations = relations(apiKey, ({ one }) => ({
  user: one(userAccount, { fields: [apiKey.userId], references: [userAccount.id] }),
}));

export const oauthClientRelations = relations(oauthClient, ({ one }) => ({
  user: one(userAccount, { fields: [oauthClient.userId], references: [userAccount.id] }),
}));
