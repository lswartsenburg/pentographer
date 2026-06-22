import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/db/client";
import { playbook, playbookVersion } from "@/db/schema";
import { eq, or, isNull, desc, and, ne } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { IconPlus, IconBook } from "@tabler/icons-react";
import { NewPlaybookDialog } from "./new-playbook-dialog";

export default async function PlaybooksPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const playbooks = await db
    .select()
    .from(playbook)
    .where(
      or(
        eq(playbook.userId, session.user.id),
        isNull(playbook.userId),
        and(eq(playbook.isPublic, true), ne(playbook.userId, session.user.id))
      )
    )
    .orderBy(desc(playbook.createdAt));

  const withVersions = await Promise.all(
    playbooks.map(async (pb) => {
      const [latest] = await db
        .select({ version: playbookVersion.version })
        .from(playbookVersion)
        .where(eq(playbookVersion.playbookId, pb.id))
        .orderBy(desc(playbookVersion.createdAt))
        .limit(1);
      return { ...pb, latestVersion: latest?.version ?? null };
    })
  );

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between border-b border-border h-12 px-5 bg-background">
        <h1 className="text-sm font-medium text-foreground">Playbooks</h1>
        <NewPlaybookDialog>
          <Button size="sm">
            <IconPlus size={14} />
            New playbook
          </Button>
        </NewPlaybookDialog>
      </header>

      <div className="flex-1 p-5">
        <div className="grid gap-3">
          {withVersions.length === 0 ? (
            <div className="bg-card border border-border rounded-lg px-4 py-10 text-center text-sm text-muted-foreground">
              No playbooks yet.
            </div>
          ) : (
            withVersions.map((pb) => (
              <Link
                key={pb.id}
                href={`/playbooks/${pb.id}`}
                className="bg-card border border-border rounded-lg p-4 flex items-center gap-4 hover:border-primary/40 transition-colors"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#E6F1FB] shrink-0">
                  <IconBook size={18} className="text-[#0C447C]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-foreground truncate">{pb.name}</p>
                  {pb.description && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {pb.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {pb.latestVersion && (
                    <span className="text-xs bg-[#E6F1FB] text-[#0C447C] px-2 py-0.5 rounded-full font-medium">
                      v{pb.latestVersion}
                    </span>
                  )}
                  {pb.userId === null && (
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                      System
                    </span>
                  )}
                  {pb.isPublic && pb.userId !== null && pb.userId !== session.user.id && (
                    <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                      Shared
                    </span>
                  )}
                  {pb.isPublic && pb.userId === session.user.id && (
                    <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                      Public
                    </span>
                  )}
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
