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

interface OAuthClient {
  id: string;
  name: string;
  clientId: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

interface CreatedCredentials {
  clientId: string;
  clientSecret: string;
}

function fmt(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function OAuthClientsCard({ initialClients }: { initialClients: OAuthClient[] }) {
  const [clients, setClients] = useState<OAuthClient[]>(initialClients);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedCredentials | null>(null);
  const [copied, setCopied] = useState<"id" | "secret" | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);

    const res = await fetch("/api/oauth/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });

    setCreating(false);

    if (!res.ok) {
      toast.error("Failed to create OAuth client");
      return;
    }

    const data = await res.json();
    setCreated({ clientId: data.clientId, clientSecret: data.clientSecret });
    setClients((prev) => [
      {
        id: data.id,
        name: data.name,
        clientId: data.clientId,
        createdAt: data.createdAt,
        lastUsedAt: null,
      },
      ...prev,
    ]);
    setNewName("");
  }

  async function handleRevoke(id: string) {
    const res = await fetch(`/api/oauth/clients/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to revoke client");
      return;
    }
    setClients((prev) => prev.filter((c) => c.id !== id));
    toast.success("OAuth client revoked");
  }

  function copy(value: string, which: "id" | "secret") {
    navigator.clipboard.writeText(value);
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  }

  function handleClose() {
    setShowCreate(false);
    setCreated(null);
    setCopied(null);
    setNewName("");
  }

  return (
    <div className="border border-border rounded-lg bg-card">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h2 className="text-sm font-medium text-foreground">OAuth Clients</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Machine-to-machine credentials. Exchange <code className="font-mono">client_id</code> +{" "}
            <code className="font-mono">client_secret</code> for a short-lived Bearer token at{" "}
            <code className="font-mono">/api/oauth/token</code>.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          New client
        </Button>
      </div>

      {clients.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">No OAuth clients yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="text-left font-medium px-5 py-2">Name</th>
              <th className="text-left font-medium px-5 py-2">Client ID</th>
              <th className="text-left font-medium px-5 py-2">Created</th>
              <th className="text-left font-medium px-5 py-2">Last used</th>
              <th className="px-5 py-2" />
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0">
                <td className="px-5 py-3 font-medium text-foreground">{c.name}</td>
                <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{c.clientId}</td>
                <td className="px-5 py-3 text-muted-foreground">{fmt(c.createdAt)}</td>
                <td className="px-5 py-3 text-muted-foreground">{fmt(c.lastUsedAt)}</td>
                <td className="px-5 py-3 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleRevoke(c.id)}
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
          if (!open) handleClose();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{created ? "Copy your credentials" : "Create OAuth client"}</DialogTitle>
          </DialogHeader>

          {created ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                The client secret is shown once and cannot be retrieved. Copy both values now.
              </p>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Client ID</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono bg-muted rounded px-3 py-2 break-all">
                    {created.clientId}
                  </code>
                  <Button size="sm" variant="outline" onClick={() => copy(created.clientId, "id")}>
                    {copied === "id" ? "Copied!" : "Copy"}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Client Secret</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono bg-muted rounded px-3 py-2 break-all">
                    {created.clientSecret}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copy(created.clientSecret, "secret")}
                  >
                    {copied === "secret" ? "Copied!" : "Copy"}
                  </Button>
                </div>
              </div>

              <div className="rounded-md bg-muted px-4 py-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Usage</p>
                <p>
                  POST <code>/api/oauth/token</code> with <code>grant_type=client_credentials</code>{" "}
                  to get a 1-hour Bearer token.
                </p>
              </div>

              <DialogFooter>
                <Button onClick={handleClose}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="client-name">Client name</Label>
                <Input
                  id="client-name"
                  placeholder="e.g. Burp Suite plugin"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={creating || !newName.trim()}>
                  {creating ? "Creating…" : "Create client"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
