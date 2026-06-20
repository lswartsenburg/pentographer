/**
 * Creates the minimum fixtures needed for E2E tests:
 *   - A test user (TEST_EMAIL / TEST_PASSWORD)
 *   - A test customer
 *   - A test project
 *
 * When running in CI (GITHUB_ENV is set), writes TEST_PROJECT_ID directly
 * to the Actions env file so dotenvx stdout noise can't corrupt it.
 */
import fs from "fs";
import bcrypt from "bcryptjs";
import { db } from "./client";
import { userAccount, customer, project } from "./schema";

const email = process.env.TEST_EMAIL;
const password = process.env.TEST_PASSWORD;

if (!email || !password) {
  console.error("TEST_EMAIL and TEST_PASSWORD must be set");
  process.exit(1);
}

async function seed() {
  const passwordHash = await bcrypt.hash(password!, 10);

  const [user] = await db
    .insert(userAccount)
    .values({ name: "CI Test User", email: email!, passwordHash })
    .returning();

  const [cust] = await db
    .insert(customer)
    .values({ userId: user.id, name: "CI Test Customer" })
    .returning();

  const [proj] = await db
    .insert(project)
    .values({ userId: user.id, customerId: cust.id, name: "CI Test Project" })
    .returning();

  const line = `TEST_PROJECT_ID=${proj.id}`;
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
