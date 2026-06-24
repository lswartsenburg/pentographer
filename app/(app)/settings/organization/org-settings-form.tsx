"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type OrgRole = "owner" | "admin" | "member" | "viewer";

interface OrgSettingsFormProps {
  org: { id: string; name: string };
  myRole: OrgRole;
  isPersonalOrg: boolean;
  hasOrgKey: boolean;
}

export function OrgSettingsForm({ org, myRole, isPersonalOrg, hasOrgKey }: OrgSettingsFormProps) {
  const router = useRouter();
  const { update } = useSession();
  const [name, setName] = useState(org.name);
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hasKey, setHasKey] = useState(hasOrgKey);
  const [addingKey, setAddingKey] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [removingKey, setRemovingKey] = useState(false);

  const canEdit = myRole === "owner" || myRole === "admin";
  const isOwner = myRole === "owner";

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim() === org.name) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/orgs/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to rename organization");
        return;
      }
      toast.success("Organization renamed");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveKey(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey.startsWith("sk-ant-")) {
      toast.error("Key must start with sk-ant-");
      return;
    }
    setSavingKey(true);
    try {
      const res = await fetch(`/api/orgs/${org.id}/ai-key`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: apiKey }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to save key");
        return;
      }
      toast.success("Anthropic API key saved");
      setHasKey(true);
      setAddingKey(false);
      setApiKey("");
    } finally {
      setSavingKey(false);
    }
  }

  async function handleRemoveKey() {
    setRemovingKey(true);
    try {
      const res = await fetch(`/api/orgs/${org.id}/ai-key`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to remove key");
        return;
      }
      toast.success("Anthropic API key removed");
      setHasKey(false);
    } finally {
      setRemovingKey(false);
    }
  }

  async function handleLeave() {
    if (!confirm("Leave this organization? You will lose access to all its resources.")) return;
    setLeaving(true);
    try {
      const res = await fetch(`/api/orgs/${org.id}/leave`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to leave organization");
        return;
      }
      // Switch back to personal org or refresh
      await update({});
      router.push("/dashboard");
      router.refresh();
    } finally {
      setLeaving(false);
    }
  }

  async function handleDelete() {
    if (
      !confirm(
        `Delete "${org.name}"? This will permanently delete all projects, customers, playbooks, and other data in this organization.`
      )
    )
      return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/orgs/${org.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to delete organization");
        return;
      }
      toast.success("Organization deleted");
      await update({});
      router.push("/dashboard");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h2 className="text-sm font-medium text-foreground">Organization name</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            This name appears in the organization switcher and on reports.
          </p>
        </div>
        <form onSubmit={handleRename} className="flex items-end gap-3">
          <div className="space-y-1.5 flex-1 max-w-sm">
            <Label htmlFor="org-name" className="text-xs">
              Name
            </Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 text-sm"
              disabled={!canEdit}
              required
            />
          </div>
          {canEdit && (
            <Button
              type="submit"
              size="sm"
              className="h-8"
              disabled={saving || name.trim() === org.name}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          )}
        </form>
      </div>

      {canEdit && (
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-medium text-foreground">Anthropic API key</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              When set, all members of this organization use this key for AI features.
            </p>
          </div>
          {hasKey && !addingKey ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Key configured</span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setAddingKey(true)}
              >
                Replace
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                onClick={handleRemoveKey}
                disabled={removingKey}
              >
                {removingKey ? "Removing…" : "Remove"}
              </Button>
            </div>
          ) : !addingKey ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">No key set</span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setAddingKey(true)}
              >
                Add key
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSaveKey} className="flex items-end gap-3 max-w-sm">
              <div className="space-y-1.5 flex-1">
                <Label htmlFor="org-api-key" className="text-xs">
                  API key
                </Label>
                <Input
                  id="org-api-key"
                  type="password"
                  placeholder="sk-ant-…"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="h-8 text-sm font-mono"
                  autoFocus
                  required
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" className="h-8" disabled={savingKey}>
                  {savingKey ? "Saving…" : "Save"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8"
                  onClick={() => {
                    setAddingKey(false);
                    setApiKey("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      {!isPersonalOrg && (
        <div className="rounded-md border border-destructive/40 p-4 space-y-4">
          <div>
            <h2 className="text-sm font-medium text-destructive">Danger zone</h2>
          </div>

          {!isOwner && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-foreground">Leave organization</p>
                <p className="text-xs text-muted-foreground">
                  You will lose access to all resources in this organization.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                onClick={handleLeave}
                disabled={leaving}
              >
                {leaving ? "Leaving…" : "Leave organization"}
              </Button>
            </div>
          )}

          {isOwner && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-foreground">Delete organization</p>
                <p className="text-xs text-muted-foreground">
                  Permanently deletes all projects, customers, playbooks, and members. This cannot
                  be undone.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Delete organization"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
