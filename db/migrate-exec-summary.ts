/**
 * One-time data migration: seed report + report_version from existing
 * executive_summary_version records.
 *
 * Run once after deploying the 0005 schema migration:
 *   pnpm tsx db/migrate-exec-summary.ts
 *
 * Safe to re-run — skips projects that already have a report.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env.development.local" });

import { db } from "./client";
import { project, executiveSummaryVersion, report, reportVersion } from "./schema";
import { eq, desc } from "drizzle-orm";

async function run() {
  const projects = await db.select().from(project);
  console.log(`Found ${projects.length} projects`);

  for (const proj of projects) {
    // Skip if this project already has a report
    const existing = await db
      .select({ id: report.id })
      .from(report)
      .where(eq(report.projectId, proj.id))
      .limit(1);

    if (existing.length > 0) {
      console.log(`  [skip] project ${proj.id} already has a report`);
      continue;
    }

    // Get latest exec summary if one exists
    const [latestExecSummary] = await db
      .select()
      .from(executiveSummaryVersion)
      .where(eq(executiveSummaryVersion.projectId, proj.id))
      .orderBy(desc(executiveSummaryVersion.createdAt))
      .limit(1);

    const [newReport] = await db
      .insert(report)
      .values({
        projectId: proj.id,
        userId: proj.userId,
        name: "Final Report",
      })
      .returning({ id: report.id });

    await db.insert(reportVersion).values({
      reportId: newReport.id,
      version: "1.0",
      status: "draft",
      execSummary: latestExecSummary?.content ?? "",
      authorType: latestExecSummary?.authorType ?? "human",
    });

    console.log(`  [done] project ${proj.id} → report ${newReport.id}`);
  }

  console.log("Migration complete.");
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
