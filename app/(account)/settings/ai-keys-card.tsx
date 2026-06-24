"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface AiKeysCardProps {
  hasKey: boolean;
}

interface UsageInfo {
  used: number | null;
  limit: number | null;
  remaining: number | null;
  activeKeyTier: "org" | "user" | "env" | "none";
}

export function AiKeysCard({ hasKey: initialHasKey }: AiKeysCardProps) {
  const [hasKey, setHasKey] = useState(initialHasKey);
  const [adding, setAdding] = useState(false);
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [usage, setUsage] = useState<UsageInfo | null>(null);

  useEffect(() => {
    fetch("/api/settings/ai-usage")
      .then((r) => r.json())
      .then(setUsage)
      .catch(() => null);
  }, [hasKey]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!key.startsWith("sk-ant-")) {
      toast.error("Key must start with sk-ant-");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/ai-key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to save key");
        return;
      }
      toast.success("Anthropic API key saved");
      setHasKey(true);
      setAdding(false);
      setKey("");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      const res = await fetch("/api/settings/ai-key", { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to remove key");
        return;
      }
      toast.success("Anthropic API key removed");
      setHasKey(false);
    } finally {
      setRemoving(false);
    }
  }

  function UsageIndicator() {
    if (!usage || usage.activeKeyTier !== "env") return null;
    const { used, limit, remaining } = usage;
    if (used === null || limit === null || remaining === null) return null;
    const pct = Math.round((used / limit) * 100);
    const colorClass =
      remaining === 0
        ? "text-destructive"
        : remaining <= 2
          ? "text-amber-600"
          : "text-muted-foreground";
    return (
      <p className={`text-xs mt-2 ${colorClass}`}>
        {remaining === 0
          ? `Daily limit reached (${limit} requests). Add your own key above for unlimited access.`
          : `${used} of ${limit} free daily requests used (${remaining} remaining).`}
        <span className="ml-1.5 inline-block w-16 h-1.5 rounded-full bg-muted align-middle overflow-hidden">
          <span
            className={`block h-full rounded-full ${remaining === 0 ? "bg-destructive" : remaining <= 2 ? "bg-amber-500" : "bg-primary"}`}
            style={{ width: `${pct}%` }}
          />
        </span>
      </p>
    );
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-foreground mb-1">Anthropic API key</h2>
      <p className="text-xs text-muted-foreground mb-4">
        Your personal key is used for AI features when your organization has no key set. Without a
        key, you get {process.env.NEXT_PUBLIC_ENV_AI_DAILY_LIMIT ?? "10"} free AI requests per day.
      </p>

      {hasKey && !adding ? (
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Key configured</span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setAdding(true)}
          >
            Replace
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
            onClick={handleRemove}
            disabled={removing}
          >
            {removing ? "Removing…" : "Remove"}
          </Button>
        </div>
      ) : !adding ? (
        <div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">No key set</span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setAdding(true)}
            >
              Add key
            </Button>
          </div>
          <UsageIndicator />
        </div>
      ) : (
        <form onSubmit={handleSave} className="flex items-end gap-3 max-w-sm">
          <div className="space-y-1.5 flex-1">
            <Label htmlFor="anthropic-key" className="text-xs">
              API key
            </Label>
            <Input
              id="anthropic-key"
              type="password"
              placeholder="sk-ant-…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="h-8 text-sm font-mono"
              autoFocus
              required
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" className="h-8" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => {
                setAdding(false);
                setKey("");
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
