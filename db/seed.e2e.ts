/**
 * Creates the minimum fixtures needed for E2E tests:
 *   - A test user (TEST_EMAIL / TEST_PASSWORD) with a personal org
 *   - A test customer
 *   - A test project
 *
 * When running in CI (GITHUB_ENV is set), writes TEST_PROJECT_ID directly
 * to the Actions env file so dotenvx stdout noise can't corrupt it.
 */
import fs from "fs";
import bcrypt from "bcryptjs";
import { db } from "./client";
import { userAccount, customer, project, organization, organizationMember } from "./schema";
import { eq } from "drizzle-orm";

const email = process.env.TEST_EMAIL;
const password = process.env.TEST_PASSWORD;

if (!email || !password) {
  console.error("TEST_EMAIL and TEST_PASSWORD must be set");
  process.exit(1);
}

async function seed() {
  const passwordHash = await bcrypt.hash(password!, 10);

  const result = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(userAccount)
      .values({ name: "CI Test User", email: email!, passwordHash })
      .returning();

    const [org] = await tx
      .insert(organization)
      .values({ name: "CI Test User's Organization" })
      .returning();

    await tx
      .insert(organizationMember)
      .values({ organizationId: org.id, userId: user.id, role: "owner" });

    await tx.update(userAccount).set({ personalOrgId: org.id }).where(eq(userAccount.id, user.id));

    const [cust] = await tx
      .insert(customer)
      .values({ organizationId: org.id, userId: user.id, name: "CI Test Customer" })
      .returning();

    const [proj] = await tx
      .insert(project)
      .values({
        organizationId: org.id,
        userId: user.id,
        customerId: cust.id,
        name: "CI Test Project",
      })
      .returning();

    return { proj };
  });

  const line = `TEST_PROJECT_ID=${result.proj.id}`;
  if (process.env.GITHUB_ENV) {
    fs.appendFileSync(process.env.GITHUB_ENV, `${line}\n`);
    console.log("Wrote TEST_PROJECT_ID to GITHUB_ENV");
  } else {
    console.log(line);
  }

  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
