"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface ApiKey {
  id: string;
  name: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
}

function fmt(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ApiKeysCard({ initialKeys }: { initialKeys: ApiKey[] }) {
  const [keys, setKeys] = useState<ApiKey[]>(initialKeys);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setCreating(true);

    const res = await fetch("/api/settings/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newKeyName.trim() }),
    });

    setCreating(false);

    if (!res.ok) {
      toast.error("Failed to create API key");
      return;
    }

    const data = await res.json();
    setCreatedKey(data.key);
    setKeys((prev) => [
      {
        id: data.id,
        name: data.name,
        createdAt: data.createdAt,
        lastUsedAt: null,
        expiresAt: data.expiresAt ?? null,
      },
      ...prev,
    ]);
    setNewKeyName("");
  }

  async function handleRevoke(id: string) {
    const res = await fetch(`/api/settings/api-keys/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to revoke key");
      return;
    }
    setKeys((prev) => prev.filter((k) => k.id !== id));
    toast.success("API key revoked");
  }

  function handleCopy() {
    if (!createdKey) return;
    navigator.clipboard.writeText(createdKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleCloseCreate() {
    setShowCreate(false);
    setCreatedKey(null);
    setCopied(false);
    setNewKeyName("");
  }

  return (
    <div className="border border-border rounded-lg bg-card">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h2 className="text-sm font-medium text-foreground">API Keys</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Use API keys to authenticate with the GraphQL API at{" "}
            <code className="font-mono">/api/graphql</code>.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          New key
        </Button>
      </div>

      {keys.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">No API keys yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="text-left font-medium px-5 py-2">Name</th>
              <th className="text-left font-medium px-5 py-2">Created</th>
              <th className="text-left font-medium px-5 py-2">Last used</th>
              <th className="text-left font-medium px-5 py-2">Expires</th>
              <th className="px-5 py-2" />
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id} className="border-b border-border last:border-0">
                <td className="px-5 py-3 font-medium text-foreground">{k.name}</td>
                <td className="px-5 py-3 text-muted-foreground">{fmt(k.createdAt)}</td>
                <td className="px-5 py-3 text-muted-foreground">{fmt(k.lastUsedAt)}</td>
                <td className="px-5 py-3 text-muted-foreground">{fmt(k.expiresAt)}</td>
                <td className="px-5 py-3 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleRevoke(k.id)}
                  >
                    Revoke
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Dialog
        open={showCreate}
        onOpenChange={(open) => {
          if (!open) handleCloseCreate();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{createdKey ? "Copy your API key" : "Create API key"}</DialogTitle>
          </DialogHeader>

          {createdKey ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                This is the only time your key will be shown. Copy it now.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono bg-muted rounded px-3 py-2 break-all">
                  {createdKey}
                </code>
                <Button size="sm" variant="outline" onClick={handleCopy}>
                  {copied ? "Copied!" : "Copy"}
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={handleCloseCreate}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="key-name">Key name</Label>
                <Input
                  id="key-name"
                  placeholder="e.g. Jira integration"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleCloseCreate}>
                  Cancel
                </Button>
                <Button type="submit" disabled={creating || !newKeyName.trim()}>
                  {creating ? "Creating…" : "Create key"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
