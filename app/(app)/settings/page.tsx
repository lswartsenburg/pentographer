import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { userAccount, apiKey } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { SettingsForm } from "./settings-form";
import { ApiKeysCard } from "./api-keys-card";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [user] = await db
    .select({
      id: userAccount.id,
      name: userAccount.name,
      email: userAccount.email,
      organizationName: userAccount.organizationName,
    })
    .from(userAccount)
    .where(eq(userAccount.id, session.user.id))
    .limit(1);

  if (!user) redirect("/login");

  const apiKeys = await db
    .select({
      id: apiKey.id,
      name: apiKey.name,
      createdAt: apiKey.createdAt,
      lastUsedAt: apiKey.lastUsedAt,
      expiresAt: apiKey.expiresAt,
    })
    .from(apiKey)
    .where(eq(apiKey.userId, session.user.id))
    .orderBy(desc(apiKey.createdAt));

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center border-b border-border h-12 px-5 bg-background">
        <h1 className="text-sm font-medium text-foreground">Settings</h1>
      </header>
      <div className="flex-1 p-5 space-y-6">
        <SettingsForm user={user} />
        <ApiKeysCard initialKeys={apiKeys} />
      </div>
    </div>
  );
}
