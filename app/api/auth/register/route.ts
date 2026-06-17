import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { userAccount } from "@/db/schema";

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input. Name, a valid email, and a password of at least 8 characters are required." },
      { status: 400 }
    );
  }

  const { name, email, password } = parsed.data;

  const [existing] = await db
    .select({ id: userAccount.id })
    .from(userAccount)
    .where(eq(userAccount.email, email.toLowerCase()))
    .limit(1);

  if (existing) {
    // Return same generic error to avoid email enumeration
    return NextResponse.json(
      { error: "Registration failed. Please check your details and try again." },
      { status: 409 }
    );
  }

  const passwordHash = await hash(password, 12);

  await db.insert(userAccount).values({
    name: name.trim(),
    email: email.toLowerCase(),
    passwordHash,
  });

  return NextResponse.json({ success: true }, { status: 201 });
}
