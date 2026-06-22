"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import Fuse from "fuse.js";
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
  IconSearch,
  IconX,
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
import { DisabledTooltip } from "@/components/ui/disabled-tooltip";

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

  const [panelOpen, setPanelOpen] = useState(resolvedInitial !== null);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  type SearchEntry = PlaybookItem & { categoryName: string };

  const fuse = useMemo(() => {
    const entries: SearchEntry[] = localCategories.flatMap((cat) =>
      cat.items.map((item) => ({ ...item, categoryName: cat.name }))
    );
    return new Fuse(entries, {
      keys: [
        { name: "name", weight: 2 },
        { name: "categoryName", weight: 1 },
        { name: "description", weight: 0.5 },
      ],
      threshold: 0.35,
      includeScore: true,
    });
  }, [localCategories]);

  const searchResults = useMemo<SearchEntry[]>(() => {
    if (!searchQuery.trim()) return [];
    return fuse.search(searchQuery).map((r) => r.item);
  }, [fuse, searchQuery]);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    searchInputRef.current?.blur();
  }, []);

  const isDraft = version?.status === "draft";
  const canEdit = isOwner && isDraft;
  const hasDraft = versions.some((v) => v.status === "draft");
  const draftVersion = versions.find((v) => v.status === "draft") ?? null;
  const publishedVersions = versions.filter((v) => v.status !== "draft");
  const latestPublished = publishedVersions[0] ?? null;

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
    setPanelOpen(true);
    router.replace(`/playbooks/${playbook.id}?item=${item.id}`, { scroll: false });
  }

  function selectOverview() {
    setSelectedItem(null);
    setItemDraft(null);
    setPanelOpen(true);
    router.replace(`/playbooks/${playbook.id}`, { scroll: false });
  }

  function closePanel() {
    setPanelOpen(false);
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
    setAiGenerating(true);
    try {
      // Auto-create a draft if we're currently on the published version
      let targetVersionId = version?.status === "draft" ? version.id : null;
      if (!targetVersionId) {
        const draftRes = await fetch(`/api/playbooks/${playbook.id}/versions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ changelog: "" }),
        });
        if (!draftRes.ok) {
          toast.error("Failed to create draft.");
          return;
        }
        const newDraft = await draftRes.json();
        targetVersionId = newDraft.id;
      }

      const existingContent = localCategories.map((cat) => ({
        name: cat.name,
        frameworkRef: cat.frameworkRef,
        items: cat.items.map((i) => ({
          name: i.name,
          description: i.description,
          defaultRemediation: i.defaultRemediation,
          defaultRisk: i.defaultRisk,
        })),
      }));

      const res = await fetch(
        `/api/playbooks/${playbook.id}/versions/${targetVersionId}/ai/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instruction: aiGenerateDesc,
            existingContent: existingContent.length > 0 ? existingContent : undefined,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.error === "AI_NOT_CONFIGURED") {
          toast.error("AI features require an ANTHROPIC_API_KEY environment variable.");
        } else {
          toast.error(data.error ?? "AI generation failed.");
        }
        return;
      }

      if (data.patch) {
        // Update mode: apply the patch directly to local state
        const p = data.patch as {
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
            frameworkRef?: string | null;
            items?: Array<{
              name: string;
              description?: string;
              defaultRemediation?: string;
              defaultRisk?: string;
            }>;
          }>;
          removeCategories?: string[];
        };

        setLocalCategories((prev) => {
          let cats = prev.map((cat) => ({ ...cat, items: [...cat.items] }));

          // modifyItems
          for (const change of p.modifyItems ?? []) {
            cats = cats.map((cat) => {
              if (cat.name !== change.categoryName) return cat;
              return {
                ...cat,
                items: cat.items.map((item) => {
                  if (item.name !== change.itemName) return item;
                  return {
                    ...item,
                    ...(change.description !== undefined
                      ? { description: change.description }
                      : {}),
                    ...(change.defaultRemediation !== undefined
                      ? { defaultRemediation: change.defaultRemediation }
                      : {}),
                    ...(change.defaultRisk !== undefined
                      ? {
                          defaultRisk: change.defaultRisk as
                            | "high"
                            | "medium"
                            | "low"
                            | "informational",
                        }
                      : {}),
                  };
                }),
              };
            });
          }

          // addItems
          for (const change of p.addItems ?? []) {
            cats = cats.map((cat) => {
              if (cat.name !== change.categoryName) return cat;
              const newItem: PlaybookItem = {
                id: `temp-${Date.now()}-${Math.random()}`,
                name: change.name,
                description: change.description ?? null,
                defaultRemediation: change.defaultRemediation ?? null,
                defaultRisk: (change.defaultRisk as PlaybookItem["defaultRisk"]) ?? "medium",
                active: true,
                displayOrder: cat.items.length,
                categoryId: cat.id,
              };
              return { ...cat, items: [...cat.items, newItem] };
            });
          }

          // removeItems
          for (const change of p.removeItems ?? []) {
            cats = cats.map((cat) => {
              if (cat.name !== change.categoryName) return cat;
              return { ...cat, items: cat.items.filter((i) => i.name !== change.itemName) };
            });
          }

          // addCategories
          for (const newCat of p.addCategories ?? []) {
            const tempId = `temp-${Date.now()}-${Math.random()}`;
            cats.push({
              id: tempId,
              name: newCat.name,
              frameworkRef: newCat.frameworkRef ?? null,
              displayOrder: cats.length,
              playbookVersionId: targetVersionId!,
              items: (newCat.items ?? []).map((item, idx) => ({
                id: `temp-${Date.now()}-${idx}-${Math.random()}`,
                name: item.name,
                description: item.description ?? null,
                defaultRemediation: item.defaultRemediation ?? null,
                defaultRisk: (item.defaultRisk as PlaybookItem["defaultRisk"]) ?? "medium",
                active: true,
                displayOrder: idx,
                categoryId: tempId,
              })),
            });
          }

          // removeCategories
          for (const catName of p.removeCategories ?? []) {
            cats = cats.filter((cat) => cat.name !== catName);
          }

          return cats;
        });

        // If the currently-selected item was modified, update itemDraft too
        if (selectedItem && p.modifyItems) {
          const change = p.modifyItems.find((c) => c.itemName === selectedItem.name);
          if (change) {
            setItemDraft((prev) =>
              prev
                ? {
                    ...prev,
                    ...(change.description !== undefined
                      ? { description: change.description }
                      : {}),
                    ...(change.defaultRemediation !== undefined
                      ? { defaultRemediation: change.defaultRemediation }
                      : {}),
                    ...(change.defaultRisk !== undefined
                      ? {
                          defaultRisk: change.defaultRisk as PlaybookItem["defaultRisk"],
                        }
                      : {}),
                  }
                : prev
            );
          }
        }

        const { modified = 0, added = 0, removed = 0 } = data.counts ?? {};
        const parts = [
          modified > 0 ? `${modified} modified` : "",
          added > 0 ? `${added} added` : "",
          removed > 0 ? `${removed} removed` : "",
        ].filter(Boolean);
        toast.success(parts.length > 0 ? `AI update: ${parts.join(", ")}.` : "No changes made.");
      } else {
        // Generate-from-scratch mode: re-fetch fresh categories
        const catRes = await fetch(
          `/api/playbooks/${playbook.id}/versions/${targetVersionId}/categories`
        );
        if (catRes.ok) {
          const freshCats: CategoryWithItems[] = await catRes.json();
          const withItems = await Promise.all(
            freshCats.map(async (cat) => {
              const itemsRes = await fetch(
                `/api/playbooks/${playbook.id}/versions/${targetVersionId}/categories/${cat.id}/items`
              );
              const items: PlaybookItem[] = itemsRes.ok ? await itemsRes.json() : [];
              return { ...cat, items };
            })
          );
          setLocalCategories(withItems);
          setExpanded(Object.fromEntries(withItems.map((c) => [c.id, true])));
          setSelectedItem(null);
          setItemDraft(null);
        } else {
          toast.error(
            "Generated successfully, but failed to reload content. Please refresh the page."
          );
          return;
        }
        toast.success(
          `Generated ${data.created.categories} categories and ${data.created.items} items.`
        );
      }

      setAiGenerateOpen(false);
      setAiGenerateDesc("");

      // If we auto-created a draft, navigate to it
      if (targetVersionId !== version?.id) {
        router.push(`/playbooks/${playbook.id}?version=${targetVersionId}`);
      }
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

  async function discardDraft() {
    if (!version || version.status !== "draft") return;
    const res = await fetch(`/api/playbooks/${playbook.id}/versions/${version.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Failed to discard draft.");
      return;
    }
    toast.success("Draft discarded.");
    router.push(`/playbooks/${playbook.id}`);
    router.refresh();
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
            {!isDraft && (
              <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2.5 py-1.5">
                A draft will be created automatically.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {localCategories.length > 0
                ? "Describe what to add, change, or improve. Existing content will be used as context."
                : "Describe the application type and tech stack to generate a playbook from scratch."}
            </p>
            <Textarea
              rows={5}
              placeholder={
                localCategories.length > 0
                  ? "e.g. Add GDPR compliance checks and expand the authentication section with OAuth2 test cases."
                  : "e.g. A Node.js REST API with JWT authentication, PostgreSQL database, and a React SPA frontend. Users can manage invoices and upload PDF documents."
              }
              value={aiGenerateDesc}
              onChange={(e) => setAiGenerateDesc(e.target.value)}
              className="text-xs resize-none"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setAiGenerateOpen(false)}>
                Cancel
              </Button>
              <DisabledTooltip label="Enter at least 5 characters to generate">
                <Button
                  size="sm"
                  onClick={handleAiGenerate}
                  disabled={aiGenerating || aiGenerateDesc.trim().length < 5}
                  className="bg-[#3C3489] text-white hover:bg-[#2e286a]"
                >
                  {aiGenerating ? (
                    <IconLoader2 size={13} className="animate-spin" />
                  ) : (
                    <IconSparkles size={13} />
                  )}
                  {aiGenerating ? "Generating…" : "Generate"}
                </Button>
              </DisabledTooltip>
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
                {publishedVersions.length > 1 ? (
                  <select
                    value={!isDraft ? (version?.id ?? latestPublished.id) : latestPublished.id}
                    onChange={(e) =>
                      router.push(`/playbooks/${playbook.id}?version=${e.target.value}`)
                    }
                    className={`px-2 h-full border-l border-border bg-background text-xs font-medium cursor-pointer focus:outline-none transition-colors ${
                      !isDraft ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {publishedVersions.map((v) => (
                      <option key={v.id} value={v.id}>
                        v{v.version}
                      </option>
                    ))}
                  </select>
                ) : (
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
                )}
              </div>
            ) : draftVersion ? (
              <span className="flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-md font-medium h-7">
                <IconPencil size={11} />
                Draft
              </span>
            ) : publishedVersions.length > 1 ? (
              <div className="flex items-center border border-border rounded-md overflow-hidden text-xs h-7">
                <select
                  value={version?.id ?? latestPublished!.id}
                  onChange={(e) =>
                    router.push(`/playbooks/${playbook.id}?version=${e.target.value}`)
                  }
                  className="px-2 h-full bg-background text-foreground text-xs font-medium cursor-pointer focus:outline-none"
                >
                  {publishedVersions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.version}
                    </option>
                  ))}
                </select>
              </div>
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

            {/* AI generate — available to owner; auto-creates draft if needed */}
            {isOwner && (
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

            {/* Discard draft — owner in draft */}
            {canEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={discardDraft}
                className="text-muted-foreground hover:text-destructive"
              >
                Discard draft
              </Button>
            )}

            {/* Publish — owner in draft */}
            {canEdit && (
              <Button variant="outline" size="sm" onClick={publishVersion}>
                Publish
              </Button>
            )}

            {/* Save — only in draft, only when panel open */}
            {canEdit && panelOpen && (
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
          <div
            className={`${panelOpen ? "w-60 shrink-0" : "flex-1"} bg-background border-r border-border overflow-y-auto flex flex-col`}
          >
            <div className="px-2.5 py-2 border-b border-border">
              <div className="relative flex items-center">
                <IconSearch
                  size={12}
                  className="absolute left-2 text-muted-foreground pointer-events-none"
                />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && clearSearch()}
                  placeholder="Search items…"
                  className="w-full h-7 pl-6 pr-6 text-xs bg-muted/60 rounded-md border border-transparent focus:border-border focus:bg-background outline-none placeholder:text-muted-foreground transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={clearSearch}
                    className="absolute right-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <IconX size={11} />
                  </button>
                )}
              </div>
            </div>

            {/* Search results */}
            {searchQuery.trim() && (
              <div className="flex-1 overflow-y-auto">
                {searchResults.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-3.5 py-3">No results.</p>
                ) : (
                  searchResults.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        selectItem(item);
                        clearSearch();
                      }}
                      className={`w-full flex flex-col gap-0.5 px-3.5 py-2 text-left border-b border-border transition-colors cursor-pointer hover:bg-muted/40 ${
                        activeItem?.id === item.id ? "bg-[#E6F1FB]" : ""
                      }`}
                    >
                      <span
                        className={`text-xs truncate ${
                          activeItem?.id === item.id
                            ? "text-[#0C447C] font-medium"
                            : "text-foreground"
                        }`}
                      >
                        {item.name}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground truncate">
                          {item.categoryName}
                        </span>
                        <span
                          className={`text-[10px] px-1 py-0 rounded-full font-medium shrink-0 ${riskColors[item.defaultRisk]}`}
                        >
                          {riskLabels[item.defaultRisk]}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            {/* Normal tree (hidden when searching) */}
            {!searchQuery.trim() && (
              <>
                {/* Overview entry */}
                <button
                  className={`w-full flex items-center gap-2 px-3.5 py-2.5 text-left text-xs border-b border-border transition-colors cursor-pointer ${
                    showOverview && panelOpen
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
                          <span className="text-[10px] text-muted-foreground">
                            {cat.items.length}
                          </span>
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
                                  panelOpen && activeItem?.id === item.id
                                    ? "bg-[#E6F1FB]"
                                    : "hover:bg-muted/30"
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
                                    panelOpen && activeItem?.id === item.id
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
              </>
            )}
          </div>

          {/* Right panel — only rendered when open */}
          {panelOpen && (
            <div className="flex-1 min-w-0 overflow-y-auto p-5">
              {showOverview ? (
                <div className="space-y-5 max-w-xl">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <h2 className="text-sm font-semibold text-foreground">Overview</h2>
                    <button
                      onClick={closePanel}
                      className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      title="Close"
                    >
                      <IconX size={14} />
                    </button>
                  </div>
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
                    <div className="flex items-center gap-1 shrink-0">
                      {canEdit && (
                        <button
                          onClick={deleteItem}
                          className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer p-0.5 rounded"
                          title="Delete item"
                        >
                          <IconTrash size={14} />
                        </button>
                      )}
                      <button
                        onClick={closePanel}
                        className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-0.5 rounded"
                        title="Close"
                      >
                        <IconX size={14} />
                      </button>
                    </div>
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
                        setItemDraft((d) =>
                          d ? { ...d, defaultRemediation: e.target.value } : null
                        )
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
                        onCheckedChange={(v) =>
                          setItemDraft((d) => (d ? { ...d, active: v } : null))
                        }
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
          )}
        </div>
      </div>
    </>
  );
}
