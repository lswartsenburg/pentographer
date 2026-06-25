import { z } from "zod";
import { eq, and, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  customer,
  project,
  playbookVersion,
  playbookCategory,
  playbookItem,
  finding,
} from "@/db/schema";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerProjectTools(server: McpServer, userId: string, orgId: string) {
  server.registerTool(
    "list_projects",
    {
      description:
        "List all penetration testing projects. Returns project IDs, names, status, and customer info.",
      inputSchema: {
        customerId: z.string().uuid().optional().describe("Filter by customer ID"),
      },
    },
    async ({ customerId }) => {
      const rows = await db
        .select({
          id: project.id,
          name: project.name,
          status: project.status,
          startDate: project.startDate,
          endDate: project.endDate,
          customerId: project.customerId,
          customerName: customer.name,
        })
        .from(project)
        .leftJoin(customer, eq(project.customerId, customer.id))
        .where(
          and(
            eq(project.userId, userId),
            customerId ? eq(project.customerId, customerId) : undefined
          )
        );

      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: "No projects found." }] };
      }

      const text = rows
        .map(
          (p) =>
            `• [${p.id}] ${p.name} — ${p.status}${p.customerName ? ` (${p.customerName})` : ""}${p.startDate ? ` | ${p.startDate}` : ""}`
        )
        .join("\n");

      return { content: [{ type: "text" as const, text }] };
    }
  );

  server.registerTool(
    "get_project",
    {
      description:
        "Get details for a specific project including scope, dates, and a summary of findings.",
      inputSchema: {
        projectId: z.string().uuid().describe("The project ID"),
      },
    },
    async ({ projectId }) => {
      const [row] = await db
        .select({
          id: project.id,
          name: project.name,
          status: project.status,
          scope: project.scope,
          applicationUrl: project.applicationUrl,
          startDate: project.startDate,
          endDate: project.endDate,
          customerName: customer.name,
        })
        .from(project)
        .leftJoin(customer, eq(project.customerId, customer.id))
        .where(and(eq(project.id, projectId), eq(project.userId, userId)));

      if (!row) {
        return { content: [{ type: "text" as const, text: "Project not found." }] };
      }

      const lines = [
        `Project: ${row.name} [${row.id}]`,
        `Status: ${row.status}`,
        row.customerName ? `Customer: ${row.customerName}` : null,
        row.scope ? `Scope: ${row.scope}` : null,
        row.applicationUrl ? `URL: ${row.applicationUrl}` : null,
        row.startDate ? `Start: ${row.startDate}` : null,
        row.endDate ? `End: ${row.endDate}` : null,
      ].filter(Boolean);

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );

  server.registerTool(
    "list_customers",
    {
      description: "List all customers.",
      inputSchema: {},
    },
    async () => {
      const rows = await db
        .select({ id: customer.id, name: customer.name, contactEmail: customer.contactEmail })
        .from(customer)
        .where(or(eq(customer.userId, userId)));

      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: "No customers found." }] };
      }

      const text = rows
        .map((c) => `• [${c.id}] ${c.name}${c.contactEmail ? ` <${c.contactEmail}>` : ""}`)
        .join("\n");

      return { content: [{ type: "text" as const, text }] };
    }
  );

  server.registerTool(
    "create_customer",
    {
      description:
        "Create a new customer (client organisation). Returns the customer ID to use when creating a project.",
      inputSchema: {
        name: z.string().describe("Customer / client organisation name"),
        contactEmail: z
          .string()
          .email()
          .optional()
          .describe("Primary contact email at the customer"),
      },
    },
    async ({ name, contactEmail }) => {
      const [c] = await db
        .insert(customer)
        .values({ organizationId: orgId, userId, name, contactEmail: contactEmail ?? null })
        .returning();

      return {
        content: [
          {
            type: "text" as const,
            text: `Created customer "${name}" [${c.id}]`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "create_project",
    {
      description:
        "Create a new penetration testing project. Requires an existing customer ID — use list_customers or create_customer first.",
      inputSchema: {
        name: z.string().describe("Project name, e.g. 'Acme Corp — Q3 Web App Pentest'"),
        customerId: z.string().uuid().describe("ID of the customer this project belongs to"),
        scope: z.string().optional().describe("In-scope assets: IP ranges, hostnames, URLs"),
        applicationUrl: z.string().optional().describe("Primary application URL"),
        startDate: z
          .string()
          .optional()
          .describe("Start date in ISO 8601 format, e.g. '2026-07-01'"),
        endDate: z.string().optional().describe("End date in ISO 8601 format, e.g. '2026-07-15'"),
        playbookVersionId: z
          .string()
          .uuid()
          .optional()
          .describe(
            "Playbook version ID to attach. Use get_playbook to find the active version ID."
          ),
      },
    },
    async ({ name, customerId, scope, applicationUrl, startDate, endDate, playbookVersionId }) => {
      const [c] = await db
        .select({ id: customer.id })
        .from(customer)
        .where(and(eq(customer.id, customerId), eq(customer.organizationId, orgId)))
        .limit(1);

      if (!c) {
        return { content: [{ type: "text" as const, text: "Customer not found." }] };
      }

      const [p] = await db
        .insert(project)
        .values({
          organizationId: orgId,
          userId,
          customerId,
          name,
          status: "in_progress",
          scope: scope ?? null,
          applicationUrl: applicationUrl ?? null,
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
          playbookVersionId: playbookVersionId ?? null,
        })
        .returning();

      const lines = [
        `Created project "${name}" [${p.id}]`,
        scope ? `Scope: ${scope}` : null,
        playbookVersionId ? `Playbook version: ${playbookVersionId}` : null,
        "Use create_finding to log vulnerabilities, or list_project_playbook_items to see what to test.",
      ].filter(Boolean);

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );

  server.registerTool(
    "list_project_playbook_items",
    {
      description:
        "List all playbook test items for a project, grouped by category. Shows whether each item has already been tested (a finding is linked to it). Use this to decide what to test next.",
      inputSchema: {
        projectId: z.string().uuid().describe("The project ID"),
      },
    },
    ({ projectId }) => listProjectPlaybookItems(userId, projectId)
  );
}

type McpContent = { content: Array<{ type: "text"; text: string }> };

export async function listProjectPlaybookItems(
  userId: string,
  projectId: string
): Promise<McpContent> {
  const [proj] = await db
    .select({
      id: project.id,
      name: project.name,
      playbookVersionId: project.playbookVersionId,
    })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, userId)))
    .limit(1);

  if (!proj) {
    return { content: [{ type: "text", text: "Project not found." }] };
  }

  if (!proj.playbookVersionId) {
    return {
      content: [
        {
          type: "text",
          text: "This project has no playbook attached. Use get_playbook to find a version ID, then create a new project with playbookVersionId set.",
        },
      ],
    };
  }

  const [ver] = await db
    .select({ id: playbookVersion.id, version: playbookVersion.version })
    .from(playbookVersion)
    .where(eq(playbookVersion.id, proj.playbookVersionId))
    .limit(1);

  const categories = await db
    .select()
    .from(playbookCategory)
    .where(eq(playbookCategory.playbookVersionId, proj.playbookVersionId));

  const projectFindings = await db
    .select({ playbookItemId: finding.playbookItemId, status: finding.status })
    .from(finding)
    .where(eq(finding.projectId, projectId));

  const testedItemIds = new Map<string, string>();
  for (const f of projectFindings) {
    if (f.playbookItemId) testedItemIds.set(f.playbookItemId, f.status);
  }

  const lines: string[] = [`Project: ${proj.name} — Playbook v${ver?.version ?? "?"}`, ""];

  let untested = 0;
  let tested = 0;

  for (const cat of categories) {
    const items = await db
      .select()
      .from(playbookItem)
      .where(and(eq(playbookItem.categoryId, cat.id), eq(playbookItem.active, true)));

    if (items.length === 0) continue;

    lines.push(`## ${cat.name}`);
    for (const item of items) {
      const findingStatus = testedItemIds.get(item.id);
      const statusTag = findingStatus ? `[${findingStatus.toUpperCase()}]` : "[NOT TESTED]";
      lines.push(
        `  ${findingStatus ? "✓" : "○"} [${item.id}] [${item.defaultRisk.toUpperCase()}] ${item.name} ${statusTag}`
      );
      if (findingStatus) tested++;
      else untested++;
    }
    lines.push("");
  }

  lines.push(`Summary: ${tested} tested, ${untested} not yet tested`);

  return { content: [{ type: "text", text: lines.join("\n") }] };
}
