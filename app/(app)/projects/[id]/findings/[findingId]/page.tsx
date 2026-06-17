import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/db/client";
import { project, finding, findingVersion, playbookCategory, playbookItem, auditLog } from "@/db/schema";
import { eq, and, desc, asc, inArray } from "drizzle-orm";
import { FindingEditor } from "./finding-editor";

export default async function FindingDetailPage({
  params,
}: {
  params: Promise<{ id: string; findingId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id: projectId, findingId } = await params;

  const [proj] = await db
    .select({ id: project.id, name: project.name, userId: project.userId, playbookVersionId: project.playbookVersionId })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, session.user.id)))
    .limit(1);

  if (!proj) notFound();

  const [f] = await db
    .select()
    .from(finding)
    .where(and(eq(finding.id, findingId), eq(finding.projectId, projectId)))
    .limit(1);

  if (!f) notFound();

  // Audit log: write on every page load
  await db.insert(auditLog).values({
    userId: session.user.id,
    action: "read",
    resourceType: "finding",
    resourceId: findingId,
    metadata: { projectId },
  });

  const versions = await db
    .select()
    .from(findingVersion)
    .where(eq(findingVersion.findingId, findingId))
    .orderBy(desc(findingVersion.createdAt));

  const latestVersion = versions[0] ?? null;

  // Load playbook items for this project's linked playbook version
  let playbookItems: Array<{
    id: string;
    name: string;
    categoryName: string;
    defaultRisk: "high" | "medium" | "low" | "informational";
    description: string | null;
    defaultRemediation: string | null;
  }> = [];

  if (proj.playbookVersionId) {
    const categories = await db
      .select()
      .from(playbookCategory)
      .where(eq(playbookCategory.playbookVersionId, proj.playbookVersionId))
      .orderBy(asc(playbookCategory.displayOrder));

    const categoryIds = categories.map((c) => c.id);
    const items = categoryIds.length > 0
      ? await db
          .select()
          .from(playbookItem)
          .where(inArray(playbookItem.categoryId, categoryIds))
          .orderBy(asc(playbookItem.displayOrder))
      : [];

    playbookItems = items
      .filter((item) => item.active)
      .map((item) => {
        const cat = categories.find((c) => c.id === item.categoryId);
        return {
          id: item.id,
          name: item.name,
          categoryName: cat?.name ?? "",
          defaultRisk: item.defaultRisk,
          description: item.description,
          defaultRemediation: item.defaultRemediation,
        };
      });
  }

  return (
    <div className="flex flex-col h-full">
      <FindingEditor
        projectId={projectId}
        projectName={proj.name}
        playbookItems={playbookItems}
        finding={{
          id: f.id,
          title: f.title,
          riskLevel: f.riskLevel,
          cvssScore: f.cvssScore,
          status: f.status,
          isAdhoc: f.isAdhoc,
          playbookItemId: f.playbookItemId,
        }}
        latestVersion={
          latestVersion
            ? {
                id: latestVersion.id,
                title: latestVersion.title,
                description: latestVersion.description,
                remediation: latestVersion.remediation,
                riskLevel: latestVersion.riskLevel,
                cvssScore: latestVersion.cvssScore,
                status: latestVersion.status,
                evidenceUrls: latestVersion.evidenceUrls,
                authorType: latestVersion.authorType,
                createdAt: latestVersion.createdAt.toISOString(),
              }
            : null
        }
        versions={versions.map((v) => ({
          id: v.id,
          title: v.title,
          riskLevel: v.riskLevel,
          status: v.status,
          authorType: v.authorType,
          createdAt: v.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
