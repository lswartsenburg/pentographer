import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { userAccount } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SettingsForm } from "./settings-form";

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

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center border-b border-border h-12 px-5 bg-background">
        <h1 className="text-sm font-medium text-foreground">Settings</h1>
      </header>
      <div className="flex-1 p-5">
        <SettingsForm user={user} />
      </div>
    </div>
  );
}
