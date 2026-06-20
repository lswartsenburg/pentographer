import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/db/client";
import { playbook, playbookVersion, playbookCategory, playbookItem } from "@/db/schema";
import { eq, and, or, isNull, desc, asc } from "drizzle-orm";
import { PlaybookEditor } from "./playbook-editor";

export default async function PlaybookPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ item?: string; version?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const { item: initialItemId, version: versionParam } = await searchParams;

  const [pb] = await db
    .select()
    .from(playbook)
    .where(
      and(eq(playbook.id, id), or(eq(playbook.userId, session.user.id), isNull(playbook.userId)))
    )
    .limit(1);

  if (!pb) notFound();

  const versions = await db
    .select()
    .from(playbookVersion)
    .where(eq(playbookVersion.playbookId, id))
    .orderBy(desc(playbookVersion.createdAt));

  const latestVersion = versions[0] ?? null;
  const selectedVersion = versionParam
    ? (versions.find((v) => v.id === versionParam) ?? latestVersion)
    : latestVersion;

  const categories = selectedVersion
    ? await db
        .select()
        .from(playbookCategory)
        .where(eq(playbookCategory.playbookVersionId, selectedVersion.id))
        .orderBy(asc(playbookCategory.displayOrder))
    : [];

  const categoriesWithItems = await Promise.all(
    categories.map(async (cat) => {
      const items = await db
        .select()
        .from(playbookItem)
        .where(eq(playbookItem.categoryId, cat.id))
        .orderBy(asc(playbookItem.displayOrder));
      return { ...cat, items };
    })
  );

  return (
    <PlaybookEditor
      playbook={pb}
      version={selectedVersion}
      versions={versions}
      categoriesWithItems={categoriesWithItems}
      isOwner={pb.userId === session.user.id}
      initialItemId={initialItemId}
    />
  );
}
