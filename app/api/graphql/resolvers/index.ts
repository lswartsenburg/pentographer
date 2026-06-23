import { GraphQLError } from "graphql";
import { eq, and, or, isNull, asc, desc } from "drizzle-orm";
import { db } from "@/db/client";
import {
  userAccount,
  customer,
  project,
  finding,
  findingVersion,
  playbook,
  playbookVersion,
  playbookCategory,
  playbookItem,
} from "@/db/schema";
import type { GraphQLContext } from "../context";

export const resolvers = {
  Query: {
    me: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      if (!ctx.userId) return null;
      const [user] = await db
        .select()
        .from(userAccount)
        .where(eq(userAccount.id, ctx.userId))
        .limit(1);
      return user ?? null;
    },

    customers: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      return db
        .select()
        .from(customer)
        .where(eq(customer.organizationId, ctx.orgId))
        .orderBy(asc(customer.name));
    },

    customer: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      const [row] = await db
        .select()
        .from(customer)
        .where(and(eq(customer.id, id), eq(customer.organizationId, ctx.orgId)))
        .limit(1);
      return row ?? null;
    },

    projects: async (_: unknown, { customerId }: { customerId?: string }, ctx: GraphQLContext) => {
      const conditions = [eq(project.organizationId, ctx.orgId)];
      if (customerId) conditions.push(eq(project.customerId, customerId));
      return db
        .select()
        .from(project)
        .where(and(...conditions))
        .orderBy(desc(project.createdAt));
    },

    project: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      const [row] = await db
        .select()
        .from(project)
        .where(and(eq(project.id, id), eq(project.organizationId, ctx.orgId)))
        .limit(1);
      return row ?? null;
    },

    playbooks: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      return db
        .select()
        .from(playbook)
        .where(or(eq(playbook.organizationId, ctx.orgId), isNull(playbook.organizationId)))
        .orderBy(asc(playbook.name));
    },

    playbook: async (_: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      const [row] = await db
        .select()
        .from(playbook)
        .where(
          and(
            eq(playbook.id, id),
            or(eq(playbook.organizationId, ctx.orgId), isNull(playbook.organizationId))
          )
        )
        .limit(1);
      return row ?? null;
    },
  },

  Customer: {
    projects: async (parent: { id: string }, _: unknown, ctx: GraphQLContext) => {
      return db
        .select()
        .from(project)
        .where(and(eq(project.customerId, parent.id), eq(project.organizationId, ctx.orgId)));
    },
  },

  Project: {
    customer: async (parent: { customerId: string | null }) => {
      if (!parent.customerId) return null;
      const [row] = await db
        .select()
        .from(customer)
        .where(eq(customer.id, parent.customerId))
        .limit(1);
      return row ?? null;
    },

    findings: async (parent: { id: string }, _: unknown, ctx: GraphQLContext) => {
      return db
        .select()
        .from(finding)
        .where(and(eq(finding.projectId, parent.id)))
        .orderBy(asc(finding.createdAt));
    },
  },

  Finding: {
    latestVersion: async (parent: { id: string }) => {
      const [row] = await db
        .select()
        .from(findingVersion)
        .where(eq(findingVersion.findingId, parent.id))
        .orderBy(desc(findingVersion.createdAt))
        .limit(1);
      return row ?? null;
    },

    versions: async (parent: { id: string }) => {
      return db
        .select()
        .from(findingVersion)
        .where(eq(findingVersion.findingId, parent.id))
        .orderBy(desc(findingVersion.createdAt));
    },
  },

  Playbook: {
    versions: async (parent: { id: string }) => {
      return db
        .select()
        .from(playbookVersion)
        .where(eq(playbookVersion.playbookId, parent.id))
        .orderBy(desc(playbookVersion.createdAt));
    },

    activeVersion: async (parent: { id: string }) => {
      const [row] = await db
        .select()
        .from(playbookVersion)
        .where(and(eq(playbookVersion.playbookId, parent.id), eq(playbookVersion.isActive, true)))
        .orderBy(desc(playbookVersion.createdAt))
        .limit(1);
      return row ?? null;
    },

    categories: async (parent: { id: string }) => {
      const [activeVer] = await db
        .select()
        .from(playbookVersion)
        .where(and(eq(playbookVersion.playbookId, parent.id), eq(playbookVersion.isActive, true)))
        .orderBy(desc(playbookVersion.createdAt))
        .limit(1);
      if (!activeVer) return [];
      return db
        .select()
        .from(playbookCategory)
        .where(eq(playbookCategory.playbookVersionId, activeVer.id))
        .orderBy(asc(playbookCategory.displayOrder));
    },
  },

  PlaybookVersion: {
    categories: async (parent: { id: string }) => {
      return db
        .select()
        .from(playbookCategory)
        .where(eq(playbookCategory.playbookVersionId, parent.id))
        .orderBy(asc(playbookCategory.displayOrder));
    },
  },

  PlaybookCategory: {
    items: async (parent: { id: string }) => {
      return db
        .select()
        .from(playbookItem)
        .where(eq(playbookItem.categoryId, parent.id))
        .orderBy(asc(playbookItem.displayOrder));
    },
  },

  Mutation: {
    createFinding: async (
      _: unknown,
      {
        projectId,
        input,
      }: {
        projectId: string;
        input: {
          title: string;
          riskLevel: "high" | "medium" | "low" | "informational";
          description?: string | null;
          remediation?: string | null;
          playbookItemId?: string | null;
        };
      },
      ctx: GraphQLContext
    ) => {
      const [proj] = await db
        .select({ id: project.id })
        .from(project)
        .where(and(eq(project.id, projectId), eq(project.organizationId, ctx.orgId)))
        .limit(1);
      if (!proj) throw new GraphQLError("Project not found", { extensions: { code: "NOT_FOUND" } });

      return db.transaction(async (tx) => {
        const [newFinding] = await tx
          .insert(finding)
          .values({
            projectId,
            title: input.title.trim(),
            riskLevel: input.riskLevel,
            status: "draft",
            playbookItemId: input.playbookItemId ?? null,
            isAdhoc: !input.playbookItemId,
          })
          .returning();

        await tx.insert(findingVersion).values({
          findingId: newFinding.id,
          title: input.title.trim(),
          description: input.description ?? null,
          remediation: input.remediation ?? null,
          riskLevel: input.riskLevel,
          cvssScore: null,
          status: "draft",
          evidenceUrls: [],
          authorType: "human",
        });

        return newFinding;
      });
    },

    updateFindingStatus: async (
      _: unknown,
      {
        findingId,
        status,
        justification,
      }: {
        findingId: string;
        status: "draft" | "in_review" | "confirmed" | "informational" | "false_positive";
        justification?: string | null;
      },
      ctx: GraphQLContext
    ) => {
      // Verify org access via project
      const [row] = await db
        .select({ f: finding, projectOrgId: project.organizationId })
        .from(finding)
        .innerJoin(project, eq(finding.projectId, project.id))
        .where(and(eq(finding.id, findingId), eq(project.organizationId, ctx.orgId)))
        .limit(1);
      if (!row) throw new GraphQLError("Finding not found", { extensions: { code: "NOT_FOUND" } });

      const [updated] = await db
        .update(finding)
        .set({ status })
        .where(eq(finding.id, findingId))
        .returning();

      // Record the status change as a new version
      const [latestVersion] = await db
        .select()
        .from(findingVersion)
        .where(eq(findingVersion.findingId, findingId))
        .orderBy(desc(findingVersion.createdAt))
        .limit(1);

      await db.insert(findingVersion).values({
        findingId,
        title: latestVersion?.title ?? updated.title,
        description: latestVersion?.description ?? null,
        remediation: latestVersion?.remediation ?? null,
        riskLevel: latestVersion?.riskLevel ?? updated.riskLevel,
        cvssScore: latestVersion?.cvssScore ?? null,
        status,
        evidenceUrls: latestVersion?.evidenceUrls ?? [],
        authorType: "human",
      });

      return updated;
    },

    addFindingVersion: async (
      _: unknown,
      {
        findingId,
        input,
      }: {
        findingId: string;
        input: {
          title?: string | null;
          description?: string | null;
          remediation?: string | null;
          riskLevel?: "high" | "medium" | "low" | "informational" | null;
          cvssScore?: number | null;
        };
      },
      ctx: GraphQLContext
    ) => {
      // Verify org access via project
      const [row] = await db
        .select({ f: finding })
        .from(finding)
        .innerJoin(project, eq(finding.projectId, project.id))
        .where(and(eq(finding.id, findingId), eq(project.organizationId, ctx.orgId)))
        .limit(1);
      if (!row) throw new GraphQLError("Finding not found", { extensions: { code: "NOT_FOUND" } });

      // Base off the latest version for fields not provided
      const [latestVersion] = await db
        .select()
        .from(findingVersion)
        .where(eq(findingVersion.findingId, findingId))
        .orderBy(desc(findingVersion.createdAt))
        .limit(1);

      const [newVersion] = await db
        .insert(findingVersion)
        .values({
          findingId,
          title: input.title?.trim() ?? latestVersion?.title ?? row.f.title,
          description: input.description ?? latestVersion?.description ?? null,
          remediation: input.remediation ?? latestVersion?.remediation ?? null,
          riskLevel: input.riskLevel ?? latestVersion?.riskLevel ?? row.f.riskLevel,
          cvssScore:
            input.cvssScore != null ? String(input.cvssScore) : (latestVersion?.cvssScore ?? null),
          status: latestVersion?.status ?? row.f.status,
          evidenceUrls: latestVersion?.evidenceUrls ?? [],
          authorType: "human",
        })
        .returning();

      // Sync risk level on the finding row if changed
      if (input.riskLevel && input.riskLevel !== row.f.riskLevel) {
        await db
          .update(finding)
          .set({ riskLevel: input.riskLevel })
          .where(eq(finding.id, findingId));
      }

      return newVersion;
    },

    // ── Playbook mutations ────────────────────────────────────────────────────

    createPlaybook: async (
      _: unknown,
      {
        input,
      }: { input: { name: string; description?: string | null; isPublic?: boolean | null } },
      ctx: GraphQLContext
    ) => {
      const [pb] = await db
        .insert(playbook)
        .values({
          organizationId: ctx.orgId,
          userId: ctx.userId,
          name: input.name.trim(),
          description: input.description ?? null,
          isPublic: input.isPublic ?? false,
        })
        .returning();

      // Automatically create an initial draft version
      await db.insert(playbookVersion).values({
        playbookId: pb.id,
        version: "1.0",
        changelog: "Initial version.",
        isActive: true,
        status: "draft",
      });

      return pb;
    },

    updatePlaybook: async (
      _: unknown,
      {
        id,
        input,
      }: {
        id: string;
        input: { name?: string | null; description?: string | null; isPublic?: boolean | null };
      },
      ctx: GraphQLContext
    ) => {
      const [existing] = await db
        .select({ id: playbook.id })
        .from(playbook)
        .where(and(eq(playbook.id, id), eq(playbook.organizationId, ctx.orgId)))
        .limit(1);
      if (!existing)
        throw new GraphQLError("Playbook not found", { extensions: { code: "NOT_FOUND" } });

      const patch: Record<string, unknown> = {};
      if (input.name != null) patch.name = input.name.trim();
      if ("description" in input) patch.description = input.description ?? null;
      if (input.isPublic != null) patch.isPublic = input.isPublic;

      const [updated] = await db.update(playbook).set(patch).where(eq(playbook.id, id)).returning();
      return updated;
    },

    createPlaybookVersion: async (
      _: unknown,
      {
        playbookId,
        input,
      }: { playbookId: string; input: { version: string; changelog?: string | null } },
      ctx: GraphQLContext
    ) => {
      const [pb] = await db
        .select({ id: playbook.id })
        .from(playbook)
        .where(and(eq(playbook.id, playbookId), eq(playbook.organizationId, ctx.orgId)))
        .limit(1);
      if (!pb) throw new GraphQLError("Playbook not found", { extensions: { code: "NOT_FOUND" } });

      // Deactivate all existing versions before creating the new one
      await db
        .update(playbookVersion)
        .set({ isActive: false })
        .where(eq(playbookVersion.playbookId, playbookId));

      const [newVersion] = await db
        .insert(playbookVersion)
        .values({
          playbookId,
          version: input.version.trim(),
          changelog: input.changelog ?? null,
          isActive: true,
          status: "draft",
        })
        .returning();

      return newVersion;
    },

    publishPlaybookVersion: async (
      _: unknown,
      { versionId }: { versionId: string },
      ctx: GraphQLContext
    ) => {
      // Verify org access
      const [ver] = await db
        .select({ v: playbookVersion, orgId: playbook.organizationId })
        .from(playbookVersion)
        .innerJoin(playbook, eq(playbookVersion.playbookId, playbook.id))
        .where(and(eq(playbookVersion.id, versionId), eq(playbook.organizationId, ctx.orgId)))
        .limit(1);
      if (!ver) throw new GraphQLError("Version not found", { extensions: { code: "NOT_FOUND" } });

      const [updated] = await db
        .update(playbookVersion)
        .set({ status: "published" })
        .where(eq(playbookVersion.id, versionId))
        .returning();

      return updated;
    },

    addPlaybookCategory: async (
      _: unknown,
      {
        versionId,
        input,
      }: {
        versionId: string;
        input: { name: string; frameworkRef?: string | null; displayOrder?: number | null };
      },
      ctx: GraphQLContext
    ) => {
      // Verify org access
      const [ver] = await db
        .select({ v: playbookVersion })
        .from(playbookVersion)
        .innerJoin(playbook, eq(playbookVersion.playbookId, playbook.id))
        .where(and(eq(playbookVersion.id, versionId), eq(playbook.organizationId, ctx.orgId)))
        .limit(1);
      if (!ver) throw new GraphQLError("Version not found", { extensions: { code: "NOT_FOUND" } });

      const [cat] = await db
        .insert(playbookCategory)
        .values({
          playbookVersionId: versionId,
          name: input.name.trim(),
          frameworkRef: input.frameworkRef ?? null,
          displayOrder: input.displayOrder ?? 0,
        })
        .returning();

      return cat;
    },

    addPlaybookItem: async (
      _: unknown,
      {
        categoryId,
        input,
      }: {
        categoryId: string;
        input: {
          name: string;
          description?: string | null;
          defaultRemediation?: string | null;
          defaultRisk?: "high" | "medium" | "low" | "informational" | null;
          displayOrder?: number | null;
        };
      },
      ctx: GraphQLContext
    ) => {
      // Verify org access via category → version → playbook
      const [cat] = await db
        .select({ c: playbookCategory })
        .from(playbookCategory)
        .innerJoin(playbookVersion, eq(playbookCategory.playbookVersionId, playbookVersion.id))
        .innerJoin(playbook, eq(playbookVersion.playbookId, playbook.id))
        .where(and(eq(playbookCategory.id, categoryId), eq(playbook.organizationId, ctx.orgId)))
        .limit(1);
      if (!cat) throw new GraphQLError("Category not found", { extensions: { code: "NOT_FOUND" } });

      const [item] = await db
        .insert(playbookItem)
        .values({
          categoryId,
          name: input.name.trim(),
          description: input.description ?? null,
          defaultRemediation: input.defaultRemediation ?? null,
          defaultRisk: input.defaultRisk ?? "medium",
          active: true,
          displayOrder: input.displayOrder ?? 0,
        })
        .returning();

      return item;
    },

    updatePlaybookItem: async (
      _: unknown,
      {
        itemId,
        input,
      }: {
        itemId: string;
        input: {
          name?: string | null;
          description?: string | null;
          defaultRemediation?: string | null;
          defaultRisk?: "high" | "medium" | "low" | "informational" | null;
          active?: boolean | null;
        };
      },
      ctx: GraphQLContext
    ) => {
      const [item] = await db
        .select({ i: playbookItem })
        .from(playbookItem)
        .innerJoin(playbookCategory, eq(playbookItem.categoryId, playbookCategory.id))
        .innerJoin(playbookVersion, eq(playbookCategory.playbookVersionId, playbookVersion.id))
        .innerJoin(playbook, eq(playbookVersion.playbookId, playbook.id))
        .where(and(eq(playbookItem.id, itemId), eq(playbook.organizationId, ctx.orgId)))
        .limit(1);
      if (!item) throw new GraphQLError("Item not found", { extensions: { code: "NOT_FOUND" } });

      const patch: Record<string, unknown> = {};
      if (input.name != null) patch.name = input.name.trim();
      if ("description" in input) patch.description = input.description ?? null;
      if ("defaultRemediation" in input)
        patch.defaultRemediation = input.defaultRemediation ?? null;
      if (input.defaultRisk != null) patch.defaultRisk = input.defaultRisk;
      if (input.active != null) patch.active = input.active;

      const [updated] = await db
        .update(playbookItem)
        .set(patch)
        .where(eq(playbookItem.id, itemId))
        .returning();

      return updated;
    },
  },
};
