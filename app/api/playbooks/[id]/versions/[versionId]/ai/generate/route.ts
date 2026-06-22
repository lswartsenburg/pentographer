import { NextRequest, NextResponse } from "next/server";
import { eq, and, asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { playbook, playbookVersion, playbookCategory, playbookItem } from "@/db/schema";
import { requireAuth } from "@/lib/auth";
import { getAnthropicClient, AI_MODEL } from "@/lib/ai/client";
import { aiErrorMessage } from "@/lib/ai/error";
import { makeSSE } from "@/lib/ai/sse";
import type Anthropic from "@anthropic-ai/sdk";

const existingItemSchema = z.object({
  name: z.string(),
  description: z.string().nullable().optional(),
  defaultRemediation: z.string().nullable().optional(),
  defaultRisk: z.enum(["high", "medium", "low", "informational"]),
});

const existingCategorySchema = z.object({
  name: z.string(),
  frameworkRef: z.string().nullable().optional(),
  items: z.array(existingItemSchema),
});

const generateSchema = z.object({
  instruction: z.string().min(1).max(2000),
  existingContent: z.array(existingCategorySchema).optional(),
});

const RISK_ENUM = ["high", "medium", "low", "informational"] as const;
const VALID_RISKS = new Set(RISK_ENUM);
function safeRisk(r: unknown): "high" | "medium" | "low" | "informational" {
  if (typeof r === "string" && (RISK_ENUM as readonly string[]).includes(r)) {
    return r as "high" | "medium" | "low" | "informational";
  }
  return "medium";
}

function toolInput(message: Anthropic.Message) {
  const block = message.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") return null;
  return block.input as Record<string, unknown>;
}

// ── Tool schemas ─────────────────────────────────────────────────────────────

const PATCH_TOOL: Anthropic.Tool = {
  name: "apply_patch",
  description: "Apply targeted changes to the security testing playbook.",
  input_schema: {
    type: "object" as const,
    properties: {
      modifyItems: {
        type: "array",
        description: "Items whose fields should be updated. Only include changed fields.",
        items: {
          type: "object",
          required: ["categoryName", "itemName"],
          properties: {
            categoryName: { type: "string", description: "Exact category name (case-sensitive)" },
            itemName: { type: "string", description: "Exact item name (case-sensitive)" },
            description: { type: "string" },
            defaultRemediation: { type: "string" },
            defaultRisk: { type: "string", enum: RISK_ENUM },
          },
        },
      },
      addItems: {
        type: "array",
        description: "New items to add to existing categories.",
        items: {
          type: "object",
          required: ["categoryName", "name", "description", "defaultRemediation", "defaultRisk"],
          properties: {
            categoryName: { type: "string" },
            name: { type: "string" },
            description: { type: "string" },
            defaultRemediation: { type: "string" },
            defaultRisk: { type: "string", enum: RISK_ENUM },
          },
        },
      },
      removeItems: {
        type: "array",
        items: {
          type: "object",
          required: ["categoryName", "itemName"],
          properties: {
            categoryName: { type: "string" },
            itemName: { type: "string" },
          },
        },
      },
      addCategories: {
        type: "array",
        description: "New categories to add.",
        items: {
          type: "object",
          required: ["name", "items"],
          properties: {
            name: { type: "string" },
            frameworkRef: { type: "string", description: "e.g. A07:2021, or omit" },
            items: {
              type: "array",
              items: {
                type: "object",
                required: ["name", "description", "defaultRemediation", "defaultRisk"],
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  defaultRemediation: { type: "string" },
                  defaultRisk: { type: "string", enum: RISK_ENUM },
                },
              },
            },
          },
        },
      },
      removeCategories: {
        type: "array",
        description: "Exact names of categories to remove.",
        items: { type: "string" },
      },
    },
  },
};

const GENERATE_TOOL: Anthropic.Tool = {
  name: "generate_playbook",
  description: "Generate a complete security testing playbook.",
  input_schema: {
    type: "object" as const,
    required: ["categories"],
    properties: {
      categories: {
        type: "array",
        items: {
          type: "object",
          required: ["name", "items"],
          properties: {
            name: { type: "string" },
            frameworkRef: { type: "string", description: "OWASP ref e.g. A07:2021" },
            items: {
              type: "array",
              items: {
                type: "object",
                required: ["name", "description", "defaultRemediation", "defaultRisk"],
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  defaultRemediation: { type: "string" },
                  defaultRisk: { type: "string", enum: RISK_ENUM },
                },
              },
            },
          },
        },
      },
    },
  },
};

// ── Route ────────────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id: playbookId, versionId } = await params;

  const client = getAnthropicClient();
  if (!client) {
    return NextResponse.json({ error: "AI_NOT_CONFIGURED" }, { status: 503 });
  }

  const [pb] = await db
    .select()
    .from(playbook)
    .where(and(eq(playbook.id, playbookId), eq(playbook.userId, session!.user.id)))
    .limit(1);
  if (!pb) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [version] = await db
    .select()
    .from(playbookVersion)
    .where(and(eq(playbookVersion.id, versionId), eq(playbookVersion.playbookId, playbookId)))
    .limit(1);
  if (!version) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (version.status !== "draft") {
    return NextResponse.json({ error: "Can only generate into a draft version" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { instruction, existingContent } = parsed.data;
  const hasExisting = existingContent && existingContent.length > 0;

  // ── UPDATE MODE: patch-based ──────────────────────────────────────────────
  if (hasExisting) {
    const existingJson = JSON.stringify(
      existingContent!.map((cat) => ({
        name: cat.name,
        frameworkRef: cat.frameworkRef ?? null,
        items: cat.items.map((i) => ({
          name: i.name,
          description: i.description ?? null,
          defaultRemediation: i.defaultRemediation ?? null,
          defaultRisk: i.defaultRisk,
        })),
      })),
      null,
      2
    );

    return makeSSE(async (send) => {
      send({ status: "Analyzing changes…" });
      try {
        const message = await client.messages.create({
          model: AI_MODEL,
          max_tokens: 4096,
          tools: [PATCH_TOOL],
          tool_choice: { type: "tool", name: "apply_patch" },
          messages: [
            {
              role: "user",
              content: `You are a senior penetration tester updating a security testing playbook.

Current playbook content:
${existingJson}

User instruction:
${instruction}

Return ONLY the changes needed to fulfil the instruction. Omit any array that would be empty. Category and item names must match the existing content exactly (case-sensitive).`,
            },
          ],
        });

        const input = toolInput(message);
        if (!input) {
          send({ error: "AI returned an unexpected response format. Please try again." });
          return;
        }

        send({ status: "Applying patch…" });

        const patch = input as {
          modifyItems?: Array<{
            categoryName: string;
            itemName: string;
            description?: string;
            defaultRemediation?: string;
            defaultRisk?: string;
          }>;
          addItems?: Array<{
            categoryName: string;
            name: string;
            description?: string;
            defaultRemediation?: string;
            defaultRisk?: string;
          }>;
          removeItems?: Array<{ categoryName: string; itemName: string }>;
          addCategories?: Array<{
            name: string;
            frameworkRef?: string;
            items?: Array<{
              name: string;
              description?: string;
              defaultRemediation?: string;
              defaultRisk?: string;
            }>;
          }>;
          removeCategories?: string[];
        };

        // Load current DB state
        const dbCategories = await db
          .select()
          .from(playbookCategory)
          .where(eq(playbookCategory.playbookVersionId, versionId))
          .orderBy(asc(playbookCategory.displayOrder));

        const dbCatByName = new Map(dbCategories.map((c) => [c.name, c]));

        const dbItemsByCategoryId = new Map<
          string,
          { id: string; name: string; displayOrder: number }[]
        >();
        for (const cat of dbCategories) {
          const items = await db
            .select({
              id: playbookItem.id,
              name: playbookItem.name,
              displayOrder: playbookItem.displayOrder,
            })
            .from(playbookItem)
            .where(eq(playbookItem.categoryId, cat.id))
            .orderBy(asc(playbookItem.displayOrder));
          dbItemsByCategoryId.set(cat.id, items);
        }

        let modified = 0;
        let added = 0;
        let removed = 0;

        await db.transaction(async (tx) => {
          for (const change of patch.modifyItems ?? []) {
            const cat = dbCatByName.get(change.categoryName);
            if (!cat) continue;
            const items = dbItemsByCategoryId.get(cat.id) ?? [];
            const item = items.find((i) => i.name === change.itemName);
            if (!item) continue;
            const updates: Partial<{
              description: string | null;
              defaultRemediation: string | null;
              defaultRisk: "high" | "medium" | "low" | "informational";
            }> = {};
            if (change.description !== undefined) updates.description = change.description.trim();
            if (change.defaultRemediation !== undefined)
              updates.defaultRemediation = change.defaultRemediation.trim();
            if (change.defaultRisk !== undefined)
              updates.defaultRisk = safeRisk(change.defaultRisk);
            if (Object.keys(updates).length > 0) {
              await tx.update(playbookItem).set(updates).where(eq(playbookItem.id, item.id));
              modified++;
            }
          }

          for (const change of patch.addItems ?? []) {
            const cat = dbCatByName.get(change.categoryName);
            if (!cat) continue;
            const items = dbItemsByCategoryId.get(cat.id) ?? [];
            const nextOrder =
              items.length > 0 ? Math.max(...items.map((i) => i.displayOrder)) + 1 : 0;
            await tx.insert(playbookItem).values({
              categoryId: cat.id,
              name: change.name.trim(),
              description: change.description?.trim() ?? null,
              defaultRemediation: change.defaultRemediation?.trim() ?? null,
              defaultRisk: safeRisk(change.defaultRisk),
              active: true,
              displayOrder: nextOrder,
            });
            added++;
          }

          for (const change of patch.removeItems ?? []) {
            const cat = dbCatByName.get(change.categoryName);
            if (!cat) continue;
            const items = dbItemsByCategoryId.get(cat.id) ?? [];
            const item = items.find((i) => i.name === change.itemName);
            if (!item) continue;
            await tx.delete(playbookItem).where(eq(playbookItem.id, item.id));
            removed++;
          }

          for (const newCat of patch.addCategories ?? []) {
            const nextOrder =
              dbCategories.length > 0
                ? Math.max(...dbCategories.map((c) => c.displayOrder)) + 1
                : 0;
            const [inserted] = await tx
              .insert(playbookCategory)
              .values({
                playbookVersionId: versionId,
                name: newCat.name.trim(),
                frameworkRef: newCat.frameworkRef ?? null,
                displayOrder: nextOrder,
              })
              .returning({ id: playbookCategory.id });
            added++;

            for (let idx = 0; idx < (newCat.items ?? []).length; idx++) {
              const item = newCat.items![idx];
              await tx.insert(playbookItem).values({
                categoryId: inserted.id,
                name: item.name.trim(),
                description: item.description?.trim() ?? null,
                defaultRemediation: item.defaultRemediation?.trim() ?? null,
                defaultRisk: safeRisk(item.defaultRisk),
                active: true,
                displayOrder: idx,
              });
              added++;
            }
          }

          for (const catName of patch.removeCategories ?? []) {
            const cat = dbCatByName.get(catName);
            if (!cat) continue;
            await tx.delete(playbookItem).where(eq(playbookItem.categoryId, cat.id));
            await tx.delete(playbookCategory).where(eq(playbookCategory.id, cat.id));
            removed++;
          }
        });

        send({ done: true, patch, counts: { modified, added, removed } });
      } catch (err) {
        send({ error: aiErrorMessage(err) });
      }
    });
  }

  // ── GENERATE MODE: full generation from scratch ───────────────────────────
  return makeSSE(async (send) => {
    send({ status: "Generating playbook…" });
    try {
      const message = await client.messages.create({
        model: AI_MODEL,
        max_tokens: 8192,
        tools: [GENERATE_TOOL],
        tool_choice: { type: "tool", name: "generate_playbook" },
        messages: [
          {
            role: "user",
            content: `You are a senior penetration tester creating a security testing playbook.

${instruction}

Generate a comprehensive security testing playbook. Include 4-8 categories relevant to the application, each with 3-6 items. Map to OWASP Top 10 2021 where applicable (use A01:2021 format for frameworkRef). Write clear, actionable descriptions and remediations (2-4 sentences each).`,
          },
        ],
      });

      const input = toolInput(message);
      if (!input) {
        send({ error: "AI returned an unexpected response format. Please try again." });
        return;
      }

      const generated = input as {
        categories: Array<{
          name: string;
          frameworkRef?: string;
          items: Array<{
            name: string;
            description: string;
            defaultRemediation: string;
            defaultRisk: string;
          }>;
        }>;
      };

      send({ status: "Saving items…" });

      await db.delete(playbookCategory).where(eq(playbookCategory.playbookVersionId, versionId));

      let totalCategories = 0;
      let totalItems = 0;

      await db.transaction(async (tx) => {
        for (let catIdx = 0; catIdx < generated.categories.length; catIdx++) {
          const cat = generated.categories[catIdx];
          const [newCat] = await tx
            .insert(playbookCategory)
            .values({
              playbookVersionId: versionId,
              name: cat.name.trim(),
              frameworkRef: cat.frameworkRef ?? null,
              displayOrder: catIdx,
            })
            .returning({ id: playbookCategory.id });
          totalCategories++;

          for (let itemIdx = 0; itemIdx < (cat.items ?? []).length; itemIdx++) {
            const item = cat.items[itemIdx];
            await tx.insert(playbookItem).values({
              categoryId: newCat.id,
              name: item.name.trim(),
              description: item.description?.trim() ?? null,
              defaultRemediation: item.defaultRemediation?.trim() ?? null,
              defaultRisk: safeRisk(item.defaultRisk),
              active: true,
              displayOrder: itemIdx,
            });
            totalItems++;
          }
        }
      });

      send({ done: true, created: { categories: totalCategories, items: totalItems } });
    } catch (err) {
      send({ error: aiErrorMessage(err) });
    }
  });
}
