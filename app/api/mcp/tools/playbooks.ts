import { z } from "zod";
import { eq, and, or, isNull, asc, desc } from "drizzle-orm";
import { db } from "@/db/client";
import { playbook, playbookVersion, playbookCategory, playbookItem } from "@/db/schema";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const RiskLevel = z.enum(["high", "medium", "low", "informational"]);

export function registerPlaybookTools(server: McpServer, userId: string) {
  server.registerTool(
    "list_playbooks",
    {
      description: "List all available playbooks (owned by the user or public system playbooks).",
      inputSchema: {},
    },
    async () => {
      const rows = await db
        .select({
          id: playbook.id,
          name: playbook.name,
          description: playbook.description,
          isPublic: playbook.isPublic,
          isOwned: playbook.userId,
        })
        .from(playbook)
        .where(
          or(eq(playbook.userId, userId), isNull(playbook.userId), eq(playbook.isPublic, true))
        )
        .orderBy(asc(playbook.name));

      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: "No playbooks found." }] };
      }

      const text = rows
        .map((p) => {
          const owner = p.isOwned === userId ? "yours" : "system";
          return `• [${p.id}] ${p.name} (${owner})${p.description ? ` — ${p.description}` : ""}`;
        })
        .join("\n");

      return { content: [{ type: "text" as const, text }] };
    }
  );

  server.registerTool(
    "get_playbook",
    {
      description: "Get a playbook's full content: all categories and items in the active version.",
      inputSchema: {
        playbookId: z.string().uuid().describe("The playbook ID"),
      },
    },
    async ({ playbookId }) => {
      const [pb] = await db
        .select()
        .from(playbook)
        .where(
          and(
            eq(playbook.id, playbookId),
            or(eq(playbook.userId, userId), isNull(playbook.userId), eq(playbook.isPublic, true))
          )
        )
        .limit(1);

      if (!pb) {
        return { content: [{ type: "text" as const, text: "Playbook not found." }] };
      }

      const [activeVer] = await db
        .select()
        .from(playbookVersion)
        .where(and(eq(playbookVersion.playbookId, playbookId), eq(playbookVersion.isActive, true)))
        .orderBy(desc(playbookVersion.createdAt))
        .limit(1);

      if (!activeVer) {
        return {
          content: [{ type: "text" as const, text: `Playbook: ${pb.name}\nNo active version.` }],
        };
      }

      const categories = await db
        .select()
        .from(playbookCategory)
        .where(eq(playbookCategory.playbookVersionId, activeVer.id))
        .orderBy(asc(playbookCategory.displayOrder));

      const lines: string[] = [
        `Playbook: ${pb.name} [${pb.id}]`,
        `Version: ${activeVer.version} (${activeVer.status})`,
        `Active version ID: ${activeVer.id}`,
        "",
      ];

      for (const cat of categories) {
        lines.push(`## ${cat.name} [${cat.id}]`);
        const items = await db
          .select()
          .from(playbookItem)
          .where(eq(playbookItem.categoryId, cat.id))
          .orderBy(asc(playbookItem.displayOrder));

        for (const item of items) {
          lines.push(
            `  • [${item.id}] [${item.defaultRisk.toUpperCase()}] ${item.name}${!item.active ? " (inactive)" : ""}`
          );
        }
        lines.push("");
      }

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );

  server.registerTool(
    "create_playbook",
    {
      description:
        "Create a new playbook. Automatically creates a v1.0 draft version ready to add categories and items.",
      inputSchema: {
        name: z.string().describe("Playbook name"),
        description: z.string().optional().describe("Short description of the playbook's purpose"),
        isPublic: z
          .boolean()
          .optional()
          .describe("Whether to share this playbook with all users (default: false)"),
      },
    },
    async ({ name, description, isPublic }) => {
      const [pb] = await db
        .insert(playbook)
        .values({ userId, name, description: description ?? null, isPublic: isPublic ?? false })
        .returning();

      const [ver] = await db
        .insert(playbookVersion)
        .values({ playbookId: pb.id, version: "1.0", isActive: true, status: "draft" })
        .returning();

      return {
        content: [
          {
            type: "text" as const,
            text: `Created playbook "${name}" [${pb.id}]\nVersion 1.0 draft ready. Version ID: ${ver.id}\nUse add_playbook_category to start building it.`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "create_playbook_version",
    {
      description:
        "Create a new version of an existing playbook (e.g. v2.0). The new version becomes active and the old one is deactivated.",
      inputSchema: {
        playbookId: z.string().uuid().describe("The playbook ID"),
        version: z.string().describe("Version label, e.g. '2.0'"),
        changelog: z.string().optional().describe("What changed in this version"),
      },
    },
    async ({ playbookId, version, changelog }) => {
      const [pb] = await db
        .select({ id: playbook.id })
        .from(playbook)
        .where(and(eq(playbook.id, playbookId), eq(playbook.userId, userId)))
        .limit(1);

      if (!pb) {
        return { content: [{ type: "text" as const, text: "Playbook not found." }] };
      }

      await db
        .update(playbookVersion)
        .set({ isActive: false })
        .where(eq(playbookVersion.playbookId, playbookId));

      const [ver] = await db
        .insert(playbookVersion)
        .values({
          playbookId,
          version,
          changelog: changelog ?? null,
          isActive: true,
          status: "draft",
        })
        .returning();

      return {
        content: [
          {
            type: "text" as const,
            text: `Created version ${version} for playbook [${playbookId}]\nVersion ID: ${ver.id} (draft, active)`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "add_playbook_category",
    {
      description:
        "Add a category (e.g. 'Authentication', 'Input Validation') to a playbook version.",
      inputSchema: {
        versionId: z.string().uuid().describe("The playbook version ID"),
        name: z.string().describe("Category name"),
        frameworkRef: z
          .string()
          .optional()
          .describe("Optional framework reference, e.g. 'OWASP A01'"),
      },
    },
    async ({ versionId, name, frameworkRef }) => {
      // Verify ownership
      const [ver] = await db
        .select({ v: playbookVersion })
        .from(playbookVersion)
        .innerJoin(playbook, eq(playbookVersion.playbookId, playbook.id))
        .where(and(eq(playbookVersion.id, versionId), eq(playbook.userId, userId)))
        .limit(1);

      if (!ver) {
        return { content: [{ type: "text" as const, text: "Playbook version not found." }] };
      }

      const existing = await db
        .select({ count: playbookCategory.id })
        .from(playbookCategory)
        .where(eq(playbookCategory.playbookVersionId, versionId));

      const [cat] = await db
        .insert(playbookCategory)
        .values({
          playbookVersionId: versionId,
          name,
          frameworkRef: frameworkRef ?? null,
          displayOrder: existing.length,
        })
        .returning();

      return {
        content: [
          {
            type: "text" as const,
            text: `Added category "${name}" [${cat.id}] to version [${versionId}]`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "add_playbook_item",
    {
      description:
        "Add a check item to a playbook category (e.g. 'Test for SQL Injection', risk: high).",
      inputSchema: {
        categoryId: z.string().uuid().describe("The category ID to add the item to"),
        name: z.string().describe("Item name / check title"),
        defaultRisk: RiskLevel.describe("Default risk level: high, medium, low, or informational"),
        description: z.string().optional().describe("Testing guidance for this check"),
        defaultRemediation: z.string().optional().describe("How to fix this issue"),
      },
    },
    async ({ categoryId, name, defaultRisk, description, defaultRemediation }) => {
      // Verify ownership via category → version → playbook
      const [cat] = await db
        .select({ c: playbookCategory })
        .from(playbookCategory)
        .innerJoin(playbookVersion, eq(playbookCategory.playbookVersionId, playbookVersion.id))
        .innerJoin(playbook, eq(playbookVersion.playbookId, playbook.id))
        .where(and(eq(playbookCategory.id, categoryId), eq(playbook.userId, userId)))
        .limit(1);

      if (!cat) {
        return { content: [{ type: "text" as const, text: "Category not found." }] };
      }

      const existing = await db
        .select({ id: playbookItem.id })
        .from(playbookItem)
        .where(eq(playbookItem.categoryId, categoryId));

      const [item] = await db
        .insert(playbookItem)
        .values({
          categoryId,
          name,
          defaultRisk,
          description: description ?? null,
          defaultRemediation: defaultRemediation ?? null,
          active: true,
          displayOrder: existing.length,
        })
        .returning();

      return {
        content: [
          {
            type: "text" as const,
            text: `Added item "${name}" [${item.id}] (${defaultRisk}) to category [${categoryId}]`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "publish_playbook_version",
    {
      description: "Publish a playbook version, making it the official released version.",
      inputSchema: {
        versionId: z.string().uuid().describe("The playbook version ID to publish"),
      },
    },
    async ({ versionId }) => {
      const [ver] = await db
        .select({ v: playbookVersion })
        .from(playbookVersion)
        .innerJoin(playbook, eq(playbookVersion.playbookId, playbook.id))
        .where(and(eq(playbookVersion.id, versionId), eq(playbook.userId, userId)))
        .limit(1);

      if (!ver) {
        return { content: [{ type: "text" as const, text: "Version not found." }] };
      }

      await db
        .update(playbookVersion)
        .set({ status: "published" })
        .where(eq(playbookVersion.id, versionId));

      return {
        content: [
          {
            type: "text" as const,
            text: `Published version [${versionId}].`,
          },
        ],
      };
    }
  );
}
