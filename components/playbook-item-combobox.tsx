"use client";

import { useState, useRef, useEffect } from "react";
import * as Popover from "@radix-ui/react-popover";
import { IconChevronDown, IconSearch, IconX, IconCheck } from "@tabler/icons-react";
import { cn } from "@/components/ui/utils";

export interface PlaybookItemOption {
  id: string;
  name: string;
  categoryName: string;
  defaultRisk: "high" | "medium" | "low" | "informational";
  description: string | null;
  defaultRemediation: string | null;
}

interface PlaybookItemComboboxProps {
  items: PlaybookItemOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function PlaybookItemCombobox({
  items,
  value,
  onChange,
  placeholder = "Link to playbook item…",
  disabled = false,
  className,
}: PlaybookItemComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedItem = items.find((i) => i.id === value) ?? null;

  const filtered = search.trim()
    ? items.filter(
        (i) =>
          i.name.toLowerCase().includes(search.toLowerCase()) ||
          i.categoryName.toLowerCase().includes(search.toLowerCase())
      )
    : items;

  const grouped = filtered.reduce((acc, item) => {
    const group = acc.get(item.categoryName) ?? [];
    group.push(item);
    acc.set(item.categoryName, group);
    return acc;
  }, new Map<string, PlaybookItemOption[]>());

  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 50);
    } else {
      setSearch("");
    }
  }, [open]);

  function select(id: string | null) {
    onChange(id);
    setOpen(false);
  }

  return (
    <Popover.Root open={open} onOpenChange={disabled ? undefined : setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-3 text-sm text-foreground transition-colors hover:bg-accent/40 focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
            className
          )}
          aria-expanded={open}
        >
          <span className={cn("truncate", !selectedItem && "text-muted-foreground")}>
            {selectedItem ? selectedItem.name : placeholder}
          </span>
          <IconChevronDown size={12} className="shrink-0 text-muted-foreground" />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          style={{ width: "var(--radix-popover-trigger-width)" }}
          className="z-50 rounded-lg border border-border bg-popover shadow-lg outline-none animate-in fade-in-0 zoom-in-95"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Search */}
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <IconSearch size={13} className="shrink-0 text-muted-foreground" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items…"
              className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-muted-foreground hover:text-foreground"
              >
                <IconX size={12} />
              </button>
            )}
          </div>

          {/* Options */}
          <div className="max-h-64 overflow-y-auto py-1">
            {/* None option */}
            <button
              type="button"
              onClick={() => select(null)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                !value && "font-medium text-foreground"
              )}
            >
              <IconCheck
                size={12}
                className={cn("shrink-0", value ? "opacity-0" : "opacity-100")}
              />
              <span className="truncate">Ad-hoc (not from playbook)</span>
            </button>

            {grouped.size === 0 && (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">No items match.</p>
            )}

            {Array.from(grouped.entries()).map(([categoryName, groupItems]) => (
              <div key={categoryName}>
                <p className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {categoryName}
                </p>
                {groupItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => select(item.id)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent/50",
                      item.id === value ? "font-medium text-foreground" : "text-foreground"
                    )}
                  >
                    <IconCheck
                      size={12}
                      className={cn("shrink-0", item.id === value ? "opacity-100" : "opacity-0")}
                    />
                    <span className="truncate">{item.name}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
