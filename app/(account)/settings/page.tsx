import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { userAccount, apiKey, oauthClient } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { getOrgRole } from "@/lib/org-access";
import { SettingsForm } from "./settings-form";
import { ApiKeysCard } from "./api-keys-card";
import { OAuthClientsCard } from "./oauth-clients-card";
import { AiKeysCard } from "./ai-keys-card";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [user] = await db
    .select({
      id: userAccount.id,
      name: userAccount.name,
      email: userAccount.email,
      companyName: userAccount.companyName,
      hasAnthropicKey: userAccount.anthropicApiKey,
    })
    .from(userAccount)
    .where(eq(userAccount.id, session.user.id))
    .limit(1);

  if (!user) redirect("/login");

  const role = await getOrgRole(session.user.id, session.user.orgId);
  const isAdmin = role === "admin" || role === "owner";

  const [apiKeys, oauthClients] = await Promise.all([
    db
      .select({
        id: apiKey.id,
        name: apiKey.name,
        createdAt: apiKey.createdAt,
        lastUsedAt: apiKey.lastUsedAt,
        expiresAt: apiKey.expiresAt,
        createdByName: userAccount.name,
      })
      .from(apiKey)
      .leftJoin(userAccount, eq(apiKey.userId, userAccount.id))
      .where(
        isAdmin
          ? eq(apiKey.organizationId, session.user.orgId)
          : and(eq(apiKey.organizationId, session.user.orgId), eq(apiKey.userId, session.user.id))
      )
      .orderBy(desc(apiKey.createdAt)),
    db
      .select({
        id: oauthClient.id,
        name: oauthClient.name,
        clientId: oauthClient.clientId,
        createdAt: oauthClient.createdAt,
        lastUsedAt: oauthClient.lastUsedAt,
      })
      .from(oauthClient)
      .where(eq(oauthClient.userId, session.user.id))
      .orderBy(desc(oauthClient.createdAt)),
  ]);

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center border-b border-border h-12 px-5 bg-background">
        <h1 className="text-sm font-medium text-foreground">Settings</h1>
      </header>
      <div className="flex-1 p-5 space-y-6">
        <SettingsForm user={user} />
        <div className="border-t border-border" />
        <AiKeysCard hasKey={!!user.hasAnthropicKey} />
        <div className="border-t border-border" />
        <ApiKeysCard initialKeys={apiKeys} />
        <OAuthClientsCard initialClients={oauthClients} />
      </div>
    </div>
  );
}
