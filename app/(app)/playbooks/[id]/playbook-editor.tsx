"use client";

import { useState } from "react";
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
  createdAt: Date;
};

type Playbook = {
  id: string;
  name: string;
  description: string | null;
  userId: string | null;
};

interface PlaybookEditorProps {
  playbook: Playbook;
  version: PlaybookVersion | null;
  versions: PlaybookVersion[];
  categoriesWithItems: CategoryWithItems[];
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
  isOwner,
  initialItemId,
}: PlaybookEditorProps) {
  const router = useRouter();

  const allItems = categoriesWithItems.flatMap((c) => c.items);
  const resolvedInitial =
    (initialItemId ? allItems.find((i) => i.id === initialItemId) : null) ?? allItems[0] ?? null;

  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    Object.fromEntries(categoriesWithItems.map((c) => [c.id, true]))
  );
  const [selectedItem, setSelectedItem] = useState<PlaybookItem | null>(resolvedInitial);
  const [savingItem, setSavingItem] = useState(false);
  const [itemDraft, setItemDraft] = useState<PlaybookItem | null>(null);

  const activeItem = itemDraft ?? selectedItem;

  function selectItem(item: PlaybookItem) {
    setSelectedItem(item);
    setItemDraft({ ...item });
    router.replace(`/playbooks/${playbook.id}?item=${item.id}`, { scroll: false });
  }

  async function saveItem() {
    if (!activeItem || !version) return;
    setSavingItem(true);

    const cat = categoriesWithItems.find((c) => c.id === activeItem.categoryId);
    if (!cat) return;

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

    toast.success("Item saved.");
    router.refresh();
  }

  async function newVersion() {
    const res = await fetch(`/api/playbooks/${playbook.id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changelog: "" }),
    });

    if (!res.ok) {
      toast.error("Failed to create new version.");
      return;
    }

    toast.success("New version created.");
    router.refresh();
  }

  return (
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
          <Button variant="outline" size="sm" disabled>
            <IconSparkles size={14} />
            AI generate
          </Button>
          {isOwner && (
            <Button variant="outline" size="sm" onClick={newVersion}>
              <IconGitBranch size={14} />
              New version
            </Button>
          )}
          {isOwner && (
            <Button size="sm" onClick={saveItem} disabled={savingItem || !activeItem}>
              <IconDeviceFloppy size={14} />
              Save
            </Button>
          )}
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Left panel — structure tree */}
        <div className="w-60 shrink-0 bg-background border-r border-border overflow-y-auto">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border">
            <span className="text-xs font-medium text-foreground">Structure</span>
            {version && (
              <span className="text-[11px] bg-[#E6F1FB] text-[#0C447C] px-2 py-0.5 rounded-full font-medium">
                v{version.version}
              </span>
            )}
          </div>

          {categoriesWithItems.map((cat) => (
            <div key={cat.id} className="border-b border-border">
              <button
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
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
                <span className="text-[10px] text-muted-foreground">{cat.items.length}</span>
              </button>

              {expanded[cat.id] && (
                <>
                  {cat.items.map((item) => (
                    <button
                      key={item.id}
                      className={`w-full flex items-center gap-2 pl-6 pr-3 py-1.5 text-left border-b border-border last:border-0 transition-colors ${
                        activeItem?.id === item.id ? "bg-[#E6F1FB]" : "hover:bg-muted/30"
                      }`}
                      onClick={() => selectItem(item)}
                    >
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
                  ))}
                  {isOwner && (
                    <div className="pl-6 pr-3 py-1.5 text-[11px] text-muted-foreground">
                      + Add item
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        {/* Right panel — item detail */}
        <div className="flex-1 overflow-y-auto p-5">
          {!activeItem ? (
            <p className="text-sm text-muted-foreground">
              Select an item from the list to edit it.
            </p>
          ) : (
            <div className="space-y-5">
              <h2 className="text-sm font-semibold text-foreground border-b border-border pb-3">
                {activeItem.name}
              </h2>

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
                    disabled={!isOwner}
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
                  disabled={!isOwner}
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
                  disabled={!isOwner}
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
                    disabled={!isOwner}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
