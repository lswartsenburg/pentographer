"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DisabledTooltip } from "@/components/ui/disabled-tooltip";
import { PlaybookItemCombobox } from "@/components/playbook-item-combobox";
import { IconSparkles } from "@tabler/icons-react";
import type { PlaybookItemOption } from "./page";

interface NewFindingFormProps {
  projectId: string;
  playbookItems: PlaybookItemOption[];
}

export function NewFindingForm({ projectId, playbookItems }: NewFindingFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [riskLevel, setRiskLevel] = useState("medium");
  const [riskSource, setRiskSource] = useState<"playbook" | "manual">("manual");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const hasPlaybook = playbookItems.length > 0;
  const selectedItem = playbookItems.find((i) => i.id === selectedItemId) ?? null;

  function handleItemSelect(itemId: string | null) {
    setSelectedItemId(itemId);
    if (!itemId) {
      setRiskSource("manual");
      return;
    }
    const item = playbookItems.find((i) => i.id === itemId);
    if (!item) return;
    setTitle(item.name);
    setRiskLevel(item.defaultRisk);
    setRiskSource("playbook");
  }

  function handleRiskChange(value: string) {
    setRiskLevel(value);
    setRiskSource("manual");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch(`/api/projects/${projectId}/findings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        riskLevel,
        isAdhoc: !selectedItemId,
        playbookItemId: selectedItemId ?? null,
        description: selectedItem?.description ?? null,
        remediation: selectedItem?.defaultRemediation ?? null,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to create finding.");
      return;
    }

    const created = await res.json();
    router.push(`/projects/${projectId}/findings/${created.id}`);
  }

  return (
    <div className="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-5">
        {hasPlaybook && (
          <div className="space-y-1.5">
            <Label>
              Playbook item <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <PlaybookItemCombobox
              items={playbookItems}
              value={selectedItemId}
              onChange={handleItemSelect}
            />
            {selectedItem && (
              <p className="text-xs text-muted-foreground">
                Title, risk level, description and remediation pre-filled from the playbook.
              </p>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="title">Finding title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="SQL Injection in /api/users"
            required
            autoFocus={!hasPlaybook}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="riskLevel">Risk level</Label>
            {selectedItem && riskSource === "playbook" && (
              <span className="flex items-center gap-1 text-[10px] text-primary font-medium">
                <IconSparkles size={10} />
                From playbook
              </span>
            )}
            {selectedItem && riskSource === "manual" && (
              <span className="text-[10px] text-muted-foreground">Manually set</span>
            )}
          </div>
          <select
            id="riskLevel"
            value={riskLevel}
            onChange={(e) => handleRiskChange(e.target.value)}
            className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="informational">Informational</option>
          </select>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Link href={`/projects/${projectId}`}>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <DisabledTooltip label="Enter a finding title to continue">
            <Button type="submit" disabled={loading || !title.trim()}>
              {loading ? "Creating…" : "Create finding"}
            </Button>
          </DisabledTooltip>
        </div>
      </form>
    </div>
  );
}
