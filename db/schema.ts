import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  json,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export type EvidenceItem = { key: string; url: string };

// ─── Enums ───────────────────────────────────────────────────────────────────

export const riskLevelEnum = pgEnum("risk_level", ["high", "medium", "low", "informational"]);

export const findingStatusEnum = pgEnum("finding_status", [
  "draft",
  "in_review",
  "confirmed",
  "informational",
  "false_positive",
]);

export const projectStatusEnum = pgEnum("project_status", [
  "in_progress",
  "under_review",
  "complete",
]);

export const authorTypeEnum = pgEnum("author_type", ["human", "ai"]);

export const reportVersionStatusEnum = pgEnum("report_version_status", [
  "draft",
  "in_review",
  "published",
]);

export const orgRoleEnum = pgEnum("org_role", ["owner", "admin", "member", "viewer"]);

// ─── Organization tables ──────────────────────────────────────────────────────

export const organization = pgTable("organization", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  anthropicApiKey: text("anthropic_api_key"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const organizationMember = pgTable(
  "organization_member",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    role: orgRoleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.organizationId, t.userId)]
);

export const team = pgTable("team", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const teamMember = pgTable(
  "team_member",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => userAccount.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.teamId, t.userId)]
);

// ─── Tables ──────────────────────────────────────────────────────────────────

export const userAccount = pgTable("user_account", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  companyName: text("company_name"),
  anthropicApiKey: text("anthropic_api_key"),
  // Points to the user's personal org — set on registration and during migration backfill
  personalOrgId: uuid("personal_org_id").references(() => organization.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const customer = pgTable("customer", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  // createdBy preserved for audit trail; not used for access control
  userId: uuid("user_id").references(() => userAccount.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  contactEmail: text("contact_email"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const playbook = pgTable("playbook", {
  id: uuid("id").primaryKey().defaultRandom(),
  // null = system/public playbook; set for org-owned playbooks
  organizationId: uuid("organization_id").references(() => organization.id, {
    onDelete: "cascade",
  }),
  userId: uuid("user_id").references(() => userAccount.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  isPublic: boolean("is_public").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const playbookVersion = pgTable("playbook_version", {
  id: uuid("id").primaryKey().defaultRandom(),
  playbookId: uuid("playbook_id")
    .notNull()
    .references(() => playbook.id, { onDelete: "cascade" }),
  version: text("version").notNull(),
  changelog: text("changelog"),
  isActive: boolean("is_active").notNull().default(true),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const playbookCategory = pgTable("playbook_category", {
  id: uuid("id").primaryKey().defaultRandom(),
  playbookVersionId: uuid("playbook_version_id")
    .notNull()
    .references(() => playbookVersion.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  frameworkRef: text("framework_ref"),
  displayOrder: integer("display_order").notNull().default(0),
});

export const playbookItem = pgTable("playbook_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => playbookCategory.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  defaultRemediation: text("default_remediation"),
  defaultRisk: riskLevelEnum("default_risk").notNull().default("medium"),
  active: boolean("active").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
});

// password is stored AES-256-GCM encrypted (see lib/crypto.ts); never stored plaintext
export type TestAccount = { role: string; username: string; encryptedPassword?: string };

export const project = pgTable("project", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  // createdBy preserved for audit trail; not used for access control
  userId: uuid("user_id").references(() => userAccount.id, { onDelete: "set null" }),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customer.id, { onDelete: "restrict" }),
  playbookVersionId: uuid("playbook_version_id").references(() => playbookVersion.id, {
    onDelete: "restrict",
  }),
  name: text("name").notNull(),
  status: projectStatusEnum("status").notNull().default("in_progress"),
  scope: text("scope"),
  applicationUrl: text("application_url"),
  testAccounts: json("test_accounts").$type<TestAccount[]>(),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const finding = pgTable("finding", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  playbookItemId: uuid("playbook_item_id").references(() => playbookItem.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  riskLevel: riskLevelEnum("risk_level").notNull().default("medium"),
  cvssScore: numeric("cvss_score", { precision: 4, scale: 1 }),
  status: findingStatusEnum("status").notNull().default("draft"),
  isAdhoc: boolean("is_adhoc").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const findingVersion = pgTable("finding_version", {
  id: uuid("id").primaryKey().defaultRandom(),
  findingId: uuid("finding_id")
    .notNull()
    .references(() => finding.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  remediation: text("remediation"),
  riskLevel: riskLevelEnum("risk_level").notNull(),
  cvssScore: numeric("cvss_score", { precision: 4, scale: 1 }),
  status: findingStatusEnum("status").notNull(),
  evidenceUrls: json("evidence_urls").$type<EvidenceItem[]>().notNull().default([]),
  // authorType is always set server-side; never accepted from the client
  authorType: authorTypeEnum("author_type").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const executiveSummaryVersion = pgTable("executive_summary_version", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  content: text("content").notNull().default(""),
  // authorType is always set server-side; never accepted from the client
  authorType: authorTypeEnum("author_type").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const report = pgTable("report", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => userAccount.id, { onDelete: "cascade" }),
  templateId: uuid("template_id"),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type FindingSnapshotItem = { findingId: string; findingVersionId: string };

export const reportVersion = pgTable("report_version", {
  id: uuid("id").primaryKey().defaultRandom(),
  reportId: uuid("report_id")
    .notNull()
    .references(() => report.id, { onDelete: "cascade" }),
  version: text("version").notNull(),
  status: reportVersionStatusEnum("status").notNull().default("draft"),
  execSummary: text("exec_summary").notNull().default(""),
  authorType: authorTypeEnum("author_type").notNull().default("human"),
  findingSnapshot: json("finding_snapshot").$type<FindingSnapshotItem[]>(),
  // null = "all non-draft findings"; string[] = explicit inclusion set (pre-publish)
  includedFindingIds: json("included_finding_ids").$type<string[]>(),
  reportDate: timestamp("report_date"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const reportTemplate = pgTable("report_template", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  // createdBy preserved for audit trail; not used for access control
  userId: uuid("user_id").references(() => userAccount.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  version: text("version"),
  language: text("language"),
  publishNotes: text("publish_notes"),
  blobUrl: text("blob_url").notNull(),
  isPublic: boolean("is_public").notNull().default(false),
  isDefault: boolean("is_default").notNull().default(false),
  downloadCount: integer("download_count").notNull().default(0),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organization.id, {
    onDelete: "set null",
  }),
  userId: uuid("user_id").references(() => userAccount.id, {
    onDelete: "set null",
  }),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: uuid("resource_id"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const apiKey = pgTable("api_key", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  // createdBy preserved for audit trail; not used for access control
  userId: uuid("user_id").references(() => userAccount.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
});

export const aiUsageLog = pgTable("ai_usage_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => userAccount.id, { onDelete: "set null" }),
  orgId: uuid("org_id").references(() => organization.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const oauthClient = pgTable("oauth_client", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  // createdBy preserved for audit trail; not used for access control
  userId: uuid("user_id").references(() => userAccount.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  clientId: text("client_id").notNull().unique(),
  clientSecretHash: text("client_secret_hash").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
});

export const oauthAuthCode = pgTable("oauth_auth_code", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  clientId: text("client_id").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => userAccount.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  redirectUri: text("redirect_uri").notNull(),
  codeChallenge: text("code_challenge"),
  codeChallengeMethod: text("code_challenge_method"),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
});

// ─── Relations ───────────────────────────────────────────────────────────────

export const organizationRelations = relations(organization, ({ many }) => ({
  members: many(organizationMember),
  teams: many(team),
  customers: many(customer),
  projects: many(project),
  playbooks: many(playbook),
  reportTemplates: many(reportTemplate),
  apiKeys: many(apiKey),
  oauthClients: many(oauthClient),
}));

export const organizationMemberRelations = relations(organizationMember, ({ one }) => ({
  organization: one(organization, {
    fields: [organizationMember.organizationId],
    references: [organization.id],
  }),
  user: one(userAccount, { fields: [organizationMember.userId], references: [userAccount.id] }),
}));

export const teamRelations = relations(team, ({ one, many }) => ({
  organization: one(organization, { fields: [team.organizationId], references: [organization.id] }),
  members: many(teamMember),
}));

export const teamMemberRelations = relations(teamMember, ({ one }) => ({
  team: one(team, { fields: [teamMember.teamId], references: [team.id] }),
  user: one(userAccount, { fields: [teamMember.userId], references: [userAccount.id] }),
}));

export const userAccountRelations = relations(userAccount, ({ one, many }) => ({
  personalOrg: one(organization, {
    fields: [userAccount.personalOrgId],
    references: [organization.id],
  }),
  orgMemberships: many(organizationMember),
  teamMemberships: many(teamMember),
  customers: many(customer),
  playbooks: many(playbook),
  projects: many(project),
  reportTemplates: many(reportTemplate),
  apiKeys: many(apiKey),
  oauthClients: many(oauthClient),
}));

export const reportTemplateRelations = relations(reportTemplate, ({ one }) => ({
  organization: one(organization, {
    fields: [reportTemplate.organizationId],
    references: [organization.id],
  }),
  user: one(userAccount, { fields: [reportTemplate.userId], references: [userAccount.id] }),
}));

export const customerRelations = relations(customer, ({ one, many }) => ({
  organization: one(organization, {
    fields: [customer.organizationId],
    references: [organization.id],
  }),
  user: one(userAccount, { fields: [customer.userId], references: [userAccount.id] }),
  projects: many(project),
}));

export const playbookRelations = relations(playbook, ({ one, many }) => ({
  organization: one(organization, {
    fields: [playbook.organizationId],
    references: [organization.id],
  }),
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
  organization: one(organization, {
    fields: [project.organizationId],
    references: [organization.id],
  }),
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
  project: one(project, { fields: [executiveSummaryVersion.projectId], references: [project.id] }),
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
  organization: one(organization, {
    fields: [apiKey.organizationId],
    references: [organization.id],
  }),
  user: one(userAccount, { fields: [apiKey.userId], references: [userAccount.id] }),
}));

export const oauthClientRelations = relations(oauthClient, ({ one }) => ({
  organization: one(organization, {
    fields: [oauthClient.organizationId],
    references: [organization.id],
  }),
  user: one(userAccount, { fields: [oauthClient.userId], references: [userAccount.id] }),
}));
