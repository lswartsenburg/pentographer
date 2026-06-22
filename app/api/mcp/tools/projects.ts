import { z } from "zod";
import { eq, and, or } from "drizzle-orm";
import { db } from "@/db/client";
import { customer, project } from "@/db/schema";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerProjectTools(server: McpServer, userId: string) {
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
}
