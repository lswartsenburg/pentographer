"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  IconChevronDown,
  IconChevronRight,
  IconPlus,
  IconDeviceFloppy,
  IconGitBranch,
  IconSparkles,
  IconLoader2,
  IconEye,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type PlaybookItem = {
  id: string;
  name: string;
  description: string | null;
  defaultRemediation: string | null;
  defaultRisk: "high" | "medium" | "low" | "informational";
  active: boolean;
  displayOrder: number;
  categoryId: string;
};

type CategoryWithItems = {
  id: string;
  name: string;
  frameworkRef: string | null;
  displayOrder: number;
  playbookVersionId: string;
  items: PlaybookItem[];
};

type PlaybookVersion = {
  id: string;
  version: string;
  changelog: string | null;
  isActive: boolean;
  status: string;
  createdAt: Date;
};

type Playbook = {
  id: string;
  name: string;
  description: string | null;
  userId: string | null;
};

type ChangeStatus = "added" | "modified" | "removed" | "unchanged";

interface DiffResult {
  categoryStatus: Record<string, ChangeStatus>;
  itemStatus: Record<string, ChangeStatus>;
  // Published item matched to a draft item (for showing old values), keyed by draft item ID
  publishedItems: Record<string, PlaybookItem>;
  // Items/categories in published that were removed in the draft
  removedCategories: CategoryWithItems[];
  removedItemsByCategoryId: Record<string, PlaybookItem[]>;
  totalChanges: number;
}

function computeDiff(draft: CategoryWithItems[], published: CategoryWithItems[]): DiffResult {
  const categoryStatus: Record<string, ChangeStatus> = {};
  const itemStatus: Record<string, ChangeStatus> = {};
  const publishedItems: Record<string, PlaybookItem> = {};
  const removedItemsByCategoryId: Record<string, PlaybookItem[]> = {};

  const pubCatByName = new Map(published.map((c) => [c.name.toLowerCase(), c]));

  for (const draftCat of draft) {
    const pubCat = pubCatByName.get(draftCat.name.toLowerCase());
    if (!pubCat) {
      categoryStatus[draftCat.id] = "added";
      draftCat.items.forEach((i) => (itemStatus[i.id] = "added"));
      continue;
    }

    const pubItemByName = new Map(pubCat.items.map((i) => [i.name.toLowerCase(), i]));
    let catChanged = false;

    for (const draftItem of draftCat.items) {
      const pubItem = pubItemByName.get(draftItem.name.toLowerCase());
      if (!pubItem) {
        itemStatus[draftItem.id] = "added";
        catChanged = true;
      } else if (
        draftItem.description !== pubItem.description ||
        draftItem.defaultRemediation !== pubItem.defaultRemediation ||
        draftItem.defaultRisk !== pubItem.defaultRisk ||
        draftItem.active !== pubItem.active
      ) {
        itemStatus[draftItem.id] = "modified";
        publishedItems[draftItem.id] = pubItem;
        catChanged = true;
      } else {
        itemStatus[draftItem.id] = "unchanged";
      }
    }

    // Items in published that were removed in draft
    const draftItemNames = new Set(draftCat.items.map((i) => i.name.toLowerCase()));
    const removed = pubCat.items.filter((i) => !draftItemNames.has(i.name.toLowerCase()));
    if (removed.length > 0) {
      removedItemsByCategoryId[draftCat.id] = removed;
      catChanged = true;
    }

    categoryStatus[draftCat.id] = catChanged ? "modified" : "unchanged";
  }

  const draftCatNames = new Set(draft.map((c) => c.name.toLowerCase()));
  const removedCategories = published.filter((c) => !draftCatNames.has(c.name.toLowerCase()));

  const totalChanges =
    Object.values(categoryStatus).filter((s) => s !== "unchanged").length +
    Object.values(itemStatus).filter((s) => s !== "unchanged").length +
    removedCategories.length +
    Object.values(removedItemsByCategoryId).reduce((sum, arr) => sum + arr.length, 0);

  return {
    categoryStatus,
    itemStatus,
    publishedItems,
    removedCategories,
    removedItemsByCategoryId,
    totalChanges,
  };
}

interface PlaybookEditorProps {
  playbook: Playbook;
  version: PlaybookVersion | null;
  versions: PlaybookVersion[];
  categoriesWithItems: CategoryWithItems[];
  comparisonCategoriesWithItems?: CategoryWithItems[] | null;
  isOwner: boolean;
  initialItemId?: string;
}

const riskColors: Record<string, string> = {
  high: "bg-[#FCEBEB] text-[#A32D2D]",
  medium: "bg-[#FAEEDA] text-[#633806]",
  low: "bg-[#EAF3DE] text-[#27500A]",
  informational: "bg-muted text-muted-foreground",
};
const riskLabels: Record<string, string> = {
  high: "H",
  medium: "M",
  low: "L",
  informational: "I",
};

export function PlaybookEditor({
  playbook,
  version,
  versions,
  categoriesWithItems,
  comparisonCategoriesWithItems,
  isOwner,
  initialItemId,
}: PlaybookEditorProps) {
  const router = useRouter();

  const [localCategories, setLocalCategories] = useState<CategoryWithItems[]>(categoriesWithItems);

  const allItems = localCategories.flatMap((c) => c.items);
  const resolvedInitial =
    (initialItemId ? allItems.find((i) => i.id === initialItemId) : null) ?? null;

  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    Object.fromEntries(categoriesWithItems.map((c) => [c.id, true]))
  );
  // null = overview panel; PlaybookItem = item detail
  const [selectedItem, setSelectedItem] = useState<PlaybookItem | null>(resolvedInitial);
  const [savingItem, setSavingItem] = useState(false);
  const [itemDraft, setItemDraft] = useState<PlaybookItem | null>(resolvedInitial);

  // Playbook overview editing
  const [overviewDraft, setOverviewDraft] = useState({
    name: playbook.name,
    description: playbook.description ?? "",
  });
  const [savingOverview, setSavingOverview] = useState(false);

  // Add item inline
  const [addingItemCategoryId, setAddingItemCategoryId] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const newItemInputRef = useRef<HTMLInputElement>(null);

  // Add category inline
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const newCategoryInputRef = useRef<HTMLInputElement>(null);

  // AI generate
  const [aiGenerateOpen, setAiGenerateOpen] = useState(false);
  const [aiGenerateDesc, setAiGenerateDesc] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);

  const activeItem = itemDraft ?? selectedItem;
  const showOverview = selectedItem === null;

  const isDraft = version?.status === "draft";
  const canEdit = isOwner && isDraft;
  const hasDraft = versions.some((v) => v.status === "draft");
  const draftVersion = versions.find((v) => v.status === "draft") ?? null;
  const latestPublished = versions.find((v) => v.status !== "draft") ?? null;

  const diff = useMemo<DiffResult | null>(
    () =>
      comparisonCategoriesWithItems
        ? computeDiff(localCategories, comparisonCategoriesWithItems)
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [comparisonCategoriesWithItems, localCategories]
  );

  useEffect(() => {
    if (addingItemCategoryId) newItemInputRef.current?.focus();
  }, [addingItemCategoryId]);

  useEffect(() => {
    if (addingCategory) newCategoryInputRef.current?.focus();
  }, [addingCategory]);

  function selectItem(item: PlaybookItem) {
    setSelectedItem(item);
    setItemDraft({ ...item });
    router.replace(`/playbooks/${playbook.id}?item=${item.id}`, { scroll: false });
  }

  function selectOverview() {
    setSelectedItem(null);
    setItemDraft(null);
    router.replace(`/playbooks/${playbook.id}`, { scroll: false });
  }

  async function saveItem() {
    if (!activeItem || !version) return;
    setSavingItem(true);

    const res = await fetch(
      `/api/playbooks/${playbook.id}/versions/${version.id}/categories/${activeItem.categoryId}/items/${activeItem.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: activeItem.name,
          description: activeItem.description,
          defaultRemediation: activeItem.defaultRemediation,
          defaultRisk: activeItem.defaultRisk,
          active: activeItem.active,
        }),
      }
    );

    setSavingItem(false);

    if (!res.ok) {
      toast.error("Failed to save item.");
      return;
    }

    const updated: PlaybookItem = await res.json();
    setLocalCategories((prev) =>
      prev.map((c) =>
        c.id === updated.categoryId
          ? { ...c, items: c.items.map((i) => (i.id === updated.id ? updated : i)) }
          : c
      )
    );
    setSelectedItem(updated);
    setItemDraft({ ...updated });
    toast.success("Item saved.");
  }

  async function deleteItem() {
    if (!activeItem || !version) return;
    const res = await fetch(
      `/api/playbooks/${playbook.id}/versions/${version.id}/categories/${activeItem.categoryId}/items/${activeItem.id}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      toast.error("Failed to delete item.");
      return;
    }
    setLocalCategories((prev) =>
      prev.map((c) =>
        c.id === activeItem.categoryId
          ? { ...c, items: c.items.filter((i) => i.id !== activeItem.id) }
          : c
      )
    );
    setSelectedItem(null);
    setItemDraft(null);
    toast.success("Item deleted.");
  }

  async function saveOverview() {
    setSavingOverview(true);
    const res = await fetch(`/api/playbooks/${playbook.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: overviewDraft.name.trim() || playbook.name,
        description: overviewDraft.description || null,
      }),
    });
    setSavingOverview(false);
    if (!res.ok) {
      toast.error("Failed to save.");
      return;
    }
    toast.success("Playbook saved.");
  }

  async function addItem(categoryId: string) {
    const name = newItemName.trim();
    if (!name || !version) return;

    const res = await fetch(
      `/api/playbooks/${playbook.id}/versions/${version.id}/categories/${categoryId}/items`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, defaultRisk: "medium", active: true }),
      }
    );

    if (!res.ok) {
      toast.error("Failed to add item.");
      return;
    }

    const created: PlaybookItem = await res.json();
    setLocalCategories((prev) =>
      prev.map((c) => (c.id === categoryId ? { ...c, items: [...c.items, created] } : c))
    );
    setNewItemName("");
    setAddingItemCategoryId(null);
    selectItem(created);
  }

  async function addCategory() {
    const name = newCategoryName.trim();
    if (!name || !version) return;

    const res = await fetch(`/api/playbooks/${playbook.id}/versions/${version.id}/categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, displayOrder: localCategories.length }),
    });

    if (!res.ok) {
      toast.error("Failed to add category.");
      return;
    }

    const created = await res.json();
    const newCat: CategoryWithItems = { ...created, items: [] };
    setLocalCategories((prev) => [...prev, newCat]);
    setExpanded((e) => ({ ...e, [created.id]: true }));
    setNewCategoryName("");
    setAddingCategory(false);
  }

  async function handleAiGenerate() {
    if (!version) return;
    setAiGenerating(true);
    try {
      const res = await fetch(`/api/playbooks/${playbook.id}/versions/${version.id}/ai/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appDescription: aiGenerateDesc }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.error === "AI_NOT_CONFIGURED") {
          toast.error("AI features require an ANTHROPIC_API_KEY environment variable.");
        } else {
          toast.error(data.error ?? "AI generation failed.");
        }
        return;
      }
      toast.success(
        `Generated ${data.created.categories} categories and ${data.created.items} items.`
      );
      setAiGenerateOpen(false);
      setAiGenerateDesc("");
      router.refresh();
    } catch {
      toast.error("AI generation failed.");
    } finally {
      setAiGenerating(false);
    }
  }

  async function createDraft() {
    const res = await fetch(`/api/playbooks/${playbook.id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changelog: "" }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Failed to create draft.");
      return;
    }

    toast.success("Draft created.");
    router.push(`/playbooks/${playbook.id}?version=${data.id}`);
  }

  async function publishVersion() {
    if (!version) return;
    const res = await fetch(`/api/playbooks/${playbook.id}/versions/${version.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "published" }),
    });

    if (!res.ok) {
      toast.error("Failed to publish.");
      return;
    }

    toast.success("Published.");
    router.refresh();
  }

  return (
    <>
      <Dialog open={aiGenerateOpen} onOpenChange={setAiGenerateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>AI Generate Playbook</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {localCategories.length > 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
                This version already has {localCategories.length} categories. Generating will
                replace all existing content.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Describe the application type and tech stack. The AI will generate categories and
              checklist items tailored to it.
            </p>
            <Textarea
              rows={5}
              placeholder="e.g. A Node.js REST API with JWT authentication, PostgreSQL database, and a React SPA frontend. Users can manage invoices and upload PDF documents."
              value={aiGenerateDesc}
              onChange={(e) => setAiGenerateDesc(e.target.value)}
              className="text-xs resize-none"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setAiGenerateOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleAiGenerate}
                disabled={aiGenerating || aiGenerateDesc.trim().length < 10}
                className="bg-[#3C3489] text-white hover:bg-[#2e286a]"
              >
                {aiGenerating ? (
                  <IconLoader2 size={13} className="animate-spin" />
                ) : (
                  <IconSparkles size={13} />
                )}
                {aiGenerating ? "Generating…" : "Generate"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col h-full">
        <header className="flex items-center justify-between border-b border-border h-12 px-5 bg-background">
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link href="/playbooks" className="hover:text-foreground">
              Playbooks
            </Link>
            <span>/</span>
            <span className="text-foreground font-medium">{playbook.name}</span>
          </nav>
          <div className="flex items-center gap-2">
            {/* Draft / Published toggle */}
            {draftVersion && latestPublished ? (
              <div className="flex items-center border border-border rounded-md overflow-hidden text-xs h-7">
                <button
                  onClick={() =>
                    !isDraft && router.push(`/playbooks/${playbook.id}?version=${draftVersion.id}`)
                  }
                  className={`px-3 h-full transition-colors ${
                    isDraft
                      ? "bg-amber-50 text-amber-700 font-medium cursor-default"
                      : "text-muted-foreground hover:bg-muted/60 cursor-pointer"
                  }`}
                >
                  Draft
                </button>
                <button
                  onClick={() =>
                    isDraft &&
                    router.push(`/playbooks/${playbook.id}?version=${latestPublished.id}`)
                  }
                  className={`px-3 h-full border-l border-border transition-colors ${
                    !isDraft
                      ? "bg-background text-foreground font-medium cursor-default"
                      : "text-muted-foreground hover:bg-muted/60 cursor-pointer"
                  }`}
                >
                  v{latestPublished.version}
                </button>
              </div>
            ) : draftVersion ? (
              <span className="flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-md font-medium h-7">
                <IconPencil size={11} />
                Draft
              </span>
            ) : latestPublished ? (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground bg-muted border border-border px-2.5 py-0.5 rounded-md font-medium h-7">
                <IconEye size={11} />v{latestPublished.version}
              </span>
            ) : null}

            {/* Change count badge */}
            {diff && diff.totalChanges > 0 && (
              <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                {diff.totalChanges} {diff.totalChanges === 1 ? "change" : "changes"}
              </span>
            )}
            {diff && diff.totalChanges === 0 && (
              <span className="text-[11px] text-muted-foreground">No changes</span>
            )}

            {/* AI generate — only in draft */}
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => setAiGenerateOpen(true)}>
                <IconSparkles size={14} />
                AI generate
              </Button>
            )}

            {/* Create draft — owner viewing published, no draft exists */}
            {isOwner && !isDraft && !hasDraft && (
              <Button variant="outline" size="sm" onClick={createDraft}>
                <IconGitBranch size={14} />
                Create draft
              </Button>
            )}

            {/* Publish — owner in draft */}
            {canEdit && (
              <Button variant="outline" size="sm" onClick={publishVersion}>
                Publish
              </Button>
            )}

            {/* Save — only in draft */}
            {canEdit && (
              <Button
                size="sm"
                onClick={showOverview ? saveOverview : saveItem}
                disabled={showOverview ? savingOverview : savingItem || !activeItem}
              >
                <IconDeviceFloppy size={14} />
                Save
              </Button>
            )}
          </div>
        </header>

        <div className="flex flex-1 min-h-0">
          {/* Left panel — structure tree */}
          <div className="w-60 shrink-0 bg-background border-r border-border overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border">
              <span className="text-xs font-medium text-foreground">Structure</span>
            </div>

            {/* Overview entry */}
            <button
              className={`w-full flex items-center gap-2 px-3.5 py-2.5 text-left text-xs border-b border-border transition-colors cursor-pointer ${
                showOverview
                  ? "bg-[#E6F1FB] text-[#0C447C] font-medium"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              }`}
              onClick={selectOverview}
            >
              Overview
            </button>

            <div className="flex-1">
              {localCategories.map((cat) => (
                <div key={cat.id} className="border-b border-border">
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors cursor-pointer"
                    onClick={() => setExpanded((e) => ({ ...e, [cat.id]: !e[cat.id] }))}
                  >
                    {expanded[cat.id] ? (
                      <IconChevronDown size={12} className="text-muted-foreground shrink-0" />
                    ) : (
                      <IconChevronRight size={12} className="text-muted-foreground shrink-0" />
                    )}
                    <span className="flex-1 text-xs font-medium text-foreground truncate">
                      {cat.name}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {diff?.categoryStatus[cat.id] === "added" && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      )}
                      {diff?.categoryStatus[cat.id] === "modified" && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                      )}
                      <span className="text-[10px] text-muted-foreground">{cat.items.length}</span>
                    </div>
                  </button>

                  {expanded[cat.id] && (
                    <>
                      {cat.items.map((item) => {
                        const itemStatus = diff?.itemStatus[item.id];
                        return (
                          <button
                            key={item.id}
                            className={`w-full flex items-center gap-2 pl-6 pr-3 py-1.5 text-left border-b border-border last:border-0 transition-colors cursor-pointer ${
                              activeItem?.id === item.id ? "bg-[#E6F1FB]" : "hover:bg-muted/30"
                            }`}
                            onClick={() => selectItem(item)}
                          >
                            {itemStatus === "added" && (
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                            )}
                            {itemStatus === "modified" && (
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                            )}
                            {!itemStatus || itemStatus === "unchanged" ? (
                              <span className="w-1.5 shrink-0" />
                            ) : null}
                            <span
                              className={`flex-1 text-xs truncate ${
                                activeItem?.id === item.id
                                  ? "text-[#0C447C] font-medium"
                                  : "text-foreground"
                              }`}
                            >
                              {item.name}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${riskColors[item.defaultRisk]}`}
                            >
                              {riskLabels[item.defaultRisk]}
                            </span>
                          </button>
                        );
                      })}

                      {/* Removed items (in published but not in draft) */}
                      {diff?.removedItemsByCategoryId[cat.id]?.map((item) => (
                        <div
                          key={item.id}
                          className="w-full flex items-center gap-2 pl-6 pr-3 py-1.5 border-b border-border opacity-50"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                          <span className="flex-1 text-xs truncate text-muted-foreground line-through">
                            {item.name}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${riskColors[item.defaultRisk]}`}
                          >
                            {riskLabels[item.defaultRisk]}
                          </span>
                        </div>
                      ))}

                      {/* Add item */}
                      {canEdit &&
                        (addingItemCategoryId === cat.id ? (
                          <div className="pl-6 pr-3 py-1.5 border-b border-border">
                            <input
                              ref={newItemInputRef}
                              value={newItemName}
                              onChange={(e) => setNewItemName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") addItem(cat.id);
                                if (e.key === "Escape") {
                                  setAddingItemCategoryId(null);
                                  setNewItemName("");
                                }
                              }}
                              onBlur={() => {
                                if (!newItemName.trim()) {
                                  setAddingItemCategoryId(null);
                                  setNewItemName("");
                                }
                              }}
                              placeholder="Item name…"
                              className="w-full text-[11px] bg-transparent outline-none border-b border-primary text-foreground placeholder:text-muted-foreground"
                            />
                          </div>
                        ) : (
                          <button
                            className="w-full pl-6 pr-3 py-1.5 text-left text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors cursor-pointer flex items-center gap-1"
                            onClick={() => {
                              setAddingItemCategoryId(cat.id);
                              setNewItemName("");
                            }}
                          >
                            <IconPlus size={11} />
                            Add item
                          </button>
                        ))}
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* Removed categories (in published but not in draft) */}
            {diff?.removedCategories.map((cat) => (
              <div key={cat.id} className="border-b border-border opacity-50">
                <div className="w-full flex items-center gap-2 px-3 py-2.5">
                  <IconChevronDown size={12} className="text-muted-foreground shrink-0" />
                  <span className="flex-1 text-xs font-medium text-muted-foreground line-through truncate">
                    {cat.name}
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                </div>
              </div>
            ))}

            {/* Add category */}
            {canEdit && (
              <div className="border-t border-border p-2">
                {addingCategory ? (
                  <input
                    ref={newCategoryInputRef}
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addCategory();
                      if (e.key === "Escape") {
                        setAddingCategory(false);
                        setNewCategoryName("");
                      }
                    }}
                    onBlur={() => {
                      if (!newCategoryName.trim()) {
                        setAddingCategory(false);
                        setNewCategoryName("");
                      }
                    }}
                    placeholder="Category name…"
                    className="w-full text-[11px] px-2 py-1.5 bg-transparent outline-none border border-primary rounded text-foreground placeholder:text-muted-foreground"
                  />
                ) : (
                  <button
                    className="w-full flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer px-1.5 py-1"
                    onClick={() => setAddingCategory(true)}
                  >
                    <IconPlus size={11} />
                    Add category
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Right panel */}
          <div className="flex-1 overflow-y-auto p-5">
            {showOverview ? (
              <div className="space-y-5 max-w-xl">
                <h2 className="text-sm font-semibold text-foreground border-b border-border pb-3">
                  Overview
                </h2>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                    Name
                  </Label>
                  <Input
                    value={overviewDraft.name}
                    onChange={(e) => setOverviewDraft((d) => ({ ...d, name: e.target.value }))}
                    disabled={!canEdit}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                    Instructions
                  </Label>
                  <Textarea
                    rows={6}
                    value={overviewDraft.description}
                    onChange={(e) =>
                      setOverviewDraft((d) => ({ ...d, description: e.target.value }))
                    }
                    disabled={!canEdit}
                    placeholder="Describe the scope, methodology, and any reviewer instructions for this playbook…"
                    className="text-xs resize-y"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    This is shown to reviewers when they open the playbook. Use it to explain the
                    scope, approach, and any special instructions.
                  </p>
                </div>
                {!canEdit && (
                  <p className="text-xs text-muted-foreground bg-muted rounded px-3 py-2">
                    {!isOwner
                      ? "This is a shared playbook — you can view it but not edit it."
                      : "This version is published. Create a draft to make changes."}
                  </p>
                )}
              </div>
            ) : !activeItem ? (
              <p className="text-sm text-muted-foreground">
                Select an item from the list to edit it.
              </p>
            ) : (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-2 border-b border-border pb-3">
                  <h2 className="text-sm font-semibold text-foreground">{activeItem.name}</h2>
                  {canEdit && (
                    <button
                      onClick={deleteItem}
                      className="shrink-0 text-muted-foreground hover:text-destructive transition-colors cursor-pointer p-0.5 rounded"
                      title="Delete item"
                    >
                      <IconTrash size={14} />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Default risk</Label>
                    <Select
                      value={activeItem.defaultRisk}
                      onValueChange={(v) =>
                        setItemDraft((d) =>
                          d ? { ...d, defaultRisk: v as PlaybookItem["defaultRisk"] } : null
                        )
                      }
                      disabled={!canEdit}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="informational">Informational</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Framework ref</Label>
                    <Input
                      className="h-8 text-xs"
                      value={activeItem.name}
                      disabled
                      placeholder="e.g. A03:2021"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                    Description (what to look for)
                  </Label>
                  <Textarea
                    rows={5}
                    className="text-xs font-mono resize-y"
                    value={activeItem.description ?? ""}
                    onChange={(e) =>
                      setItemDraft((d) => (d ? { ...d, description: e.target.value } : null))
                    }
                    disabled={!canEdit}
                    placeholder="Testing guidance for this issue…"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                    Default remediation
                  </Label>
                  <Textarea
                    rows={4}
                    className="text-xs font-mono resize-y"
                    value={activeItem.defaultRemediation ?? ""}
                    onChange={(e) =>
                      setItemDraft((d) => (d ? { ...d, defaultRemediation: e.target.value } : null))
                    }
                    disabled={!canEdit}
                    placeholder="How to fix this issue…"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                    Settings
                  </Label>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-foreground">Active in this version</span>
                    <Switch
                      checked={activeItem.active}
                      onCheckedChange={(v) => setItemDraft((d) => (d ? { ...d, active: v } : null))}
                      disabled={!canEdit}
                    />
                  </div>
                </div>

                {/* Changes from published */}
                {diff?.itemStatus[activeItem.id] === "modified" &&
                  diff.publishedItems[activeItem.id] &&
                  (() => {
                    const pub = diff.publishedItems[activeItem.id];
                    const changes: { field: string; from: string; to: string }[] = [];
                    if (activeItem.defaultRisk !== pub.defaultRisk)
                      changes.push({
                        field: "Risk",
                        from: pub.defaultRisk,
                        to: activeItem.defaultRisk,
                      });
                    if (activeItem.active !== pub.active)
                      changes.push({
                        field: "Active",
                        from: pub.active ? "Yes" : "No",
                        to: activeItem.active ? "Yes" : "No",
                      });
                    if (activeItem.description !== pub.description)
                      changes.push({
                        field: "Description",
                        from: pub.description ?? "(empty)",
                        to: activeItem.description ?? "(empty)",
                      });
                    if (activeItem.defaultRemediation !== pub.defaultRemediation)
                      changes.push({
                        field: "Remediation",
                        from: pub.defaultRemediation ?? "(empty)",
                        to: activeItem.defaultRemediation ?? "(empty)",
                      });
                    return changes.length > 0 ? (
                      <div className="space-y-2 pt-2 border-t border-border">
                        <Label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                          Changes from published
                        </Label>
                        <div className="space-y-2">
                          {changes.map(({ field, from, to }) => (
                            <div key={field} className="text-xs space-y-0.5">
                              <span className="font-medium text-foreground">{field}</span>
                              <div className="flex gap-2">
                                <span className="text-red-600 line-through break-all max-h-20 overflow-auto font-mono bg-red-50 rounded px-1.5 py-0.5 flex-1">
                                  {from}
                                </span>
                                <span className="text-emerald-700 break-all max-h-20 overflow-auto font-mono bg-emerald-50 rounded px-1.5 py-0.5 flex-1">
                                  {to}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null;
                  })()}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
