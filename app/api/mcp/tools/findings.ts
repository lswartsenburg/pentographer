import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@/db/client";
import { finding, findingVersion, project } from "@/db/schema";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const RiskLevel = z.enum(["high", "medium", "low", "informational"]);
const FindingStatus = z.enum([
  "draft",
  "in_review",
  "confirmed",
  "informational",
  "false_positive",
]);

export function registerFindingTools(server: McpServer, userId: string) {
  server.registerTool(
    "list_findings",
    {
      description: "List all findings for a project. Returns ID, title, risk level, and status.",
      inputSchema: {
        projectId: z.string().uuid().describe("The project ID"),
      },
    },
    async ({ projectId }) => {
      // Verify ownership
      const [proj] = await db
        .select({ id: project.id })
        .from(project)
        .where(and(eq(project.id, projectId), eq(project.userId, userId)))
        .limit(1);

      if (!proj) {
        return { content: [{ type: "text" as const, text: "Project not found." }] };
      }

      const rows = await db
        .select({
          id: finding.id,
          title: finding.title,
          riskLevel: finding.riskLevel,
          status: finding.status,
          isAdhoc: finding.isAdhoc,
        })
        .from(finding)
        .where(eq(finding.projectId, projectId))
        .orderBy(finding.riskLevel, finding.title);

      if (rows.length === 0) {
        return { content: [{ type: "text" as const, text: "No findings yet." }] };
      }

      const text = rows
        .map((f) => `• [${f.id}] [${f.riskLevel.toUpperCase()}] ${f.title} — ${f.status}`)
        .join("\n");

      return { content: [{ type: "text" as const, text }] };
    }
  );

  server.registerTool(
    "get_finding",
    {
      description:
        "Get the full details of a finding including its latest description and remediation.",
      inputSchema: {
        findingId: z.string().uuid().describe("The finding ID"),
      },
    },
    async ({ findingId }) => {
      const [row] = await db
        .select({
          id: finding.id,
          title: finding.title,
          riskLevel: finding.riskLevel,
          status: finding.status,
          projectId: finding.projectId,
          userId: project.userId,
        })
        .from(finding)
        .innerJoin(project, eq(finding.projectId, project.id))
        .where(and(eq(finding.id, findingId), eq(project.userId, userId)))
        .limit(1);

      if (!row) {
        return { content: [{ type: "text" as const, text: "Finding not found." }] };
      }

      const [latest] = await db
        .select()
        .from(findingVersion)
        .where(eq(findingVersion.findingId, findingId))
        .orderBy(desc(findingVersion.createdAt))
        .limit(1);

      const lines = [
        `Finding: ${row.title} [${row.id}]`,
        `Risk: ${row.riskLevel.toUpperCase()}`,
        `Status: ${row.status}`,
        latest?.cvssScore ? `CVSS: ${latest.cvssScore}` : null,
        latest?.description ? `\nDescription:\n${latest.description}` : null,
        latest?.remediation ? `\nRemediation:\n${latest.remediation}` : null,
      ].filter(Boolean);

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );

  server.registerTool(
    "create_finding",
    {
      description:
        "Create a new finding on a project. Provide the project ID, a title, risk level, and optionally a description and remediation.",
      inputSchema: {
        projectId: z.string().uuid().describe("The project ID to add the finding to"),
        title: z
          .string()
          .describe("Short title for the finding, e.g. 'SQL Injection in login form'"),
        riskLevel: RiskLevel.describe("Risk level: high, medium, low, or informational"),
        description: z.string().optional().describe("Technical description of the vulnerability"),
        remediation: z.string().optional().describe("How to fix the vulnerability"),
        cvssScore: z.number().min(0).max(10).optional().describe("CVSS score between 0 and 10"),
        playbookItemId: z.string().uuid().optional().describe("Link to a playbook item ID"),
      },
    },
    async ({
      projectId,
      title,
      riskLevel,
      description,
      remediation,
      cvssScore,
      playbookItemId,
    }) => {
      const [proj] = await db
        .select({ id: project.id })
        .from(project)
        .where(and(eq(project.id, projectId), eq(project.userId, userId)))
        .limit(1);

      if (!proj) {
        return { content: [{ type: "text" as const, text: "Project not found." }] };
      }

      const newFinding = await db.transaction(async (tx) => {
        const [f] = await tx
          .insert(finding)
          .values({
            projectId,
            title,
            riskLevel,
            status: "draft",
            isAdhoc: !playbookItemId,
            playbookItemId: playbookItemId ?? null,
          })
          .returning();

        await tx.insert(findingVersion).values({
          findingId: f.id,
          title,
          riskLevel,
          status: "draft",
          description: description ?? null,
          remediation: remediation ?? null,
          cvssScore: cvssScore != null ? String(cvssScore) : null,
          authorType: "ai",
        });

        return f;
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `Created finding [${newFinding.id}]: "${title}" (${riskLevel}) on project ${projectId}`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "update_finding_status",
    {
      description: "Update the status of a finding (e.g. confirm it, mark as false positive).",
      inputSchema: {
        findingId: z.string().uuid().describe("The finding ID"),
        status: FindingStatus.describe(
          "New status: draft, in_review, confirmed, informational, or false_positive"
        ),
      },
    },
    async ({ findingId, status }) => {
      const [row] = await db
        .select({ f: finding, userId: project.userId })
        .from(finding)
        .innerJoin(project, eq(finding.projectId, project.id))
        .where(and(eq(finding.id, findingId), eq(project.userId, userId)))
        .limit(1);

      if (!row) {
        return { content: [{ type: "text" as const, text: "Finding not found." }] };
      }

      const [latest] = await db
        .select()
        .from(findingVersion)
        .where(eq(findingVersion.findingId, findingId))
        .orderBy(desc(findingVersion.createdAt))
        .limit(1);

      await db.transaction(async (tx) => {
        await tx.update(finding).set({ status }).where(eq(finding.id, findingId));
        await tx.insert(findingVersion).values({
          findingId,
          title: latest?.title ?? row.f.title,
          riskLevel: latest?.riskLevel ?? row.f.riskLevel,
          status,
          description: latest?.description ?? null,
          remediation: latest?.remediation ?? null,
          cvssScore: latest?.cvssScore ?? null,
          authorType: "ai",
        });
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `Updated finding [${findingId}] status to "${status}".`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "update_finding",
    {
      description:
        "Update the description, remediation, or risk level of a finding (creates a new version).",
      inputSchema: {
        findingId: z.string().uuid().describe("The finding ID"),
        title: z.string().optional().describe("Updated title"),
        description: z.string().optional().describe("Updated technical description"),
        remediation: z.string().optional().describe("Updated remediation guidance"),
        riskLevel: RiskLevel.optional().describe("Updated risk level"),
        cvssScore: z.number().min(0).max(10).optional().describe("Updated CVSS score"),
      },
    },
    async ({ findingId, title, description, remediation, riskLevel, cvssScore }) => {
      const [row] = await db
        .select({ f: finding, userId: project.userId })
        .from(finding)
        .innerJoin(project, eq(finding.projectId, project.id))
        .where(and(eq(finding.id, findingId), eq(project.userId, userId)))
        .limit(1);

      if (!row) {
        return { content: [{ type: "text" as const, text: "Finding not found." }] };
      }

      const [latest] = await db
        .select()
        .from(findingVersion)
        .where(eq(findingVersion.findingId, findingId))
        .orderBy(desc(findingVersion.createdAt))
        .limit(1);

      const newRisk = riskLevel ?? latest?.riskLevel ?? row.f.riskLevel;

      await db.transaction(async (tx) => {
        if (riskLevel) await tx.update(finding).set({ riskLevel }).where(eq(finding.id, findingId));
        await tx.insert(findingVersion).values({
          findingId,
          title: title ?? latest?.title ?? row.f.title,
          riskLevel: newRisk,
          status: latest?.status ?? row.f.status,
          description: description !== undefined ? description : (latest?.description ?? null),
          remediation: remediation !== undefined ? remediation : (latest?.remediation ?? null),
          cvssScore: cvssScore != null ? String(cvssScore) : (latest?.cvssScore ?? null),
          authorType: "ai",
        });
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `Updated finding [${findingId}] with new version.`,
          },
        ],
      };
    }
  );
}
