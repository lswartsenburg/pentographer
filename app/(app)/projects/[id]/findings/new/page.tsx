import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db/client";
import { project, playbookCategory, playbookItem } from "@/db/schema";
import { eq, and, asc, inArray } from "drizzle-orm";
import { NewFindingForm } from "./new-finding-form";

export type PlaybookItemOption = {
  id: string;
  name: string;
  categoryName: string;
  defaultRisk: "high" | "medium" | "low" | "informational";
  description: string | null;
  defaultRemediation: string | null;
};

export default async function NewFindingPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id: projectId } = await params;

  const [proj] = await db
    .select({ id: project.id, name: project.name, playbookVersionId: project.playbookVersionId })
    .from(project)
    .where(and(eq(project.id, projectId), eq(project.userId, session.user.id)))
    .limit(1);

  if (!proj) notFound();

  let playbookItems: PlaybookItemOption[] = [];

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
      <header className="flex items-center gap-2 border-b border-border h-12 px-5 bg-background">
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/projects" className="hover:text-foreground">Projects</Link>
          <span>/</span>
          <Link href={`/projects/${projectId}`} className="hover:text-foreground">{proj.name}</Link>
          <span>/</span>
          <span className="text-foreground font-medium">New finding</span>
        </nav>
      </header>

      <div className="flex-1 p-5">
        <NewFindingForm projectId={projectId} playbookItems={playbookItems} />
      </div>
    </div>
  );
}
