"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IconPlus, IconX, IconEye, IconEyeOff, IconPencil } from "@tabler/icons-react";

interface TestAccount {
  role: string;
  username: string;
  password?: string;
}

interface ProjectSidebarProps {
  projectId: string;
  status: string;
  customerName: string | null;
  playbookName: string | null;
  playbookVersion: string | null;
  scope: string | null;
  applicationUrl: string | null;
  testAccounts: TestAccount[] | null;
  startDate: string | null;
  endDate: string | null;
  highCount: number;
  medCount: number;
  lowCount: number;
}

const STATUS_STYLES: Record<string, string> = {
  in_progress: "bg-[#E6F1FB] text-[#0C447C]",
  under_review: "bg-[#FAEEDA] text-[#633806]",
  complete: "bg-[#EAF3DE] text-[#27500A]",
};

const STATUS_LABELS: Record<string, string> = {
  in_progress: "In Progress",
  under_review: "Under Review",
  complete: "Complete",
};

export function ProjectSidebar({
  projectId,
  status,
  customerName,
  playbookName,
  playbookVersion,
  scope,
  applicationUrl: initialApplicationUrl,
  testAccounts: initialTestAccounts,
  startDate,
  endDate,
  highCount,
  medCount,
  lowCount,
}: ProjectSidebarProps) {
  const router = useRouter();
  const [applicationUrl, setApplicationUrl] = useState(initialApplicationUrl ?? "");
  const [saving, setSaving] = useState(false);

  // Test accounts dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogAccounts, setDialogAccounts] = useState<TestAccount[]>(initialTestAccounts ?? []);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<number>>(new Set());
  const [savingAccounts, setSavingAccounts] = useState(false);

  // Committed accounts shown in the sidebar (only updated after a successful save)
  const [committedAccounts, setCommittedAccounts] = useState<TestAccount[]>(
    initialTestAccounts ?? []
  );

  function openDialog() {
    setDialogAccounts(committedAccounts.map((a) => ({ ...a })));
    setVisiblePasswords(new Set());
    setDialogOpen(true);
  }

  function addAccount() {
    setDialogAccounts((prev) => [...prev, { role: "", username: "" }]);
  }

  function removeAccount(i: number) {
    setDialogAccounts((prev) => prev.filter((_, idx) => idx !== i));
    setVisiblePasswords((prev) => {
      const next = new Set<number>();
      for (const idx of prev) {
        if (idx < i) next.add(idx);
        else if (idx > i) next.add(idx - 1);
      }
      return next;
    });
  }

  function updateAccount(i: number, field: keyof TestAccount, value: string) {
    setDialogAccounts((prev) => prev.map((a, idx) => (idx === i ? { ...a, [field]: value } : a)));
  }

  function toggleVisible(i: number) {
    setVisiblePasswords((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  async function saveAccounts() {
    setSavingAccounts(true);
    const accounts = dialogAccounts
      .filter((a) => a.role.trim() || a.username.trim())
      .map(({ role, username, password }) => ({
        role,
        username,
        ...(password ? { password } : {}),
      }));
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testAccounts: accounts }),
    });
    setSavingAccounts(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Failed to save.");
      return;
    }
    const saved: TestAccount[] = dialogAccounts.filter((a) => a.role.trim() || a.username.trim());
    setCommittedAccounts(saved);
    setDialogOpen(false);
    toast.success("Test accounts saved.");
    router.refresh();
  }

  async function saveSettings() {
    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationUrl: applicationUrl.trim() || null }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Failed to save.");
      return;
    }
    toast.success("Settings saved.");
    router.refresh();
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <>
      <div className="w-64 shrink-0 bg-background border-r border-border overflow-y-auto p-4">
        <div className="space-y-3 text-sm">
          {/* Static metadata */}
          <div>
            <p className="text-[11px] text-muted-foreground mb-0.5">Status</p>
            <span
              className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_STYLES[status] ?? "bg-muted text-muted-foreground"}`}
            >
              {STATUS_LABELS[status] ?? status}
            </span>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground mb-0.5">Customer</p>
            <p className="text-foreground font-medium">{customerName ?? "—"}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground mb-0.5">Playbook</p>
            <p className="text-foreground">
              {playbookName ? `${playbookName} — v${playbookVersion}` : "—"}
            </p>
          </div>
          {scope && (
            <div>
              <p className="text-[11px] text-muted-foreground mb-0.5">Scope</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{scope}</p>
            </div>
          )}
          {startDate && (
            <div>
              <p className="text-[11px] text-muted-foreground mb-0.5">Start date</p>
              <p className="text-foreground">{formatDate(startDate)}</p>
            </div>
          )}
          {endDate && (
            <div>
              <p className="text-[11px] text-muted-foreground mb-0.5">End date</p>
              <p className="text-foreground">{formatDate(endDate)}</p>
            </div>
          )}

          {/* Risk summary */}
          <div className="pt-2 border-t border-border">
            <p className="text-[11px] text-muted-foreground mb-2 uppercase tracking-wide font-medium">
              Risk summary
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              <div className="bg-[#FCEBEB] rounded-md p-2 text-center">
                <p className="text-lg font-semibold text-[#A32D2D]">{highCount}</p>
                <p className="text-[10px] text-[#A32D2D]">High</p>
              </div>
              <div className="bg-[#FAEEDA] rounded-md p-2 text-center">
                <p className="text-lg font-semibold text-[#633806]">{medCount}</p>
                <p className="text-[10px] text-[#633806]">Med</p>
              </div>
              <div className="bg-[#EAF3DE] rounded-md p-2 text-center">
                <p className="text-lg font-semibold text-[#27500A]">{lowCount}</p>
                <p className="text-[10px] text-[#27500A]">Low</p>
              </div>
            </div>
          </div>

          {/* Report settings */}
          <div className="pt-2 border-t border-border space-y-3">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">
              Report settings
            </p>

            <div className="space-y-1">
              <Label className="text-[11px]" htmlFor="app-url">
                Application URL
              </Label>
              <Input
                id="app-url"
                value={applicationUrl}
                onChange={(e) => setApplicationUrl(e.target.value)}
                onBlur={saveSettings}
                placeholder="https://app.example.com"
                className="h-7 text-xs"
                disabled={saving}
              />
            </div>

            {/* Test accounts — read-only list + edit button */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[11px]">Test accounts</Label>
                <button
                  onClick={openDialog}
                  className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <IconPencil size={11} />
                  {committedAccounts.length === 0 ? "Add" : "Edit"}
                </button>
              </div>
              {committedAccounts.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic">None added</p>
              ) : (
                <div className="space-y-1">
                  {committedAccounts.map((acc, i) => (
                    <div key={i} className="text-xs text-foreground">
                      <span className="text-muted-foreground">{acc.role}</span>
                      {acc.role && " — "}
                      {acc.username}
                      {acc.password && <span className="text-muted-foreground ml-1">••••</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Test accounts dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Test accounts</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            {dialogAccounts.length === 0 && (
              <p className="text-sm text-muted-foreground">No accounts yet.</p>
            )}
            {dialogAccounts.map((acc, i) => (
              <div key={i} className="rounded-md border border-border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Account {i + 1}</span>
                  <button
                    onClick={() => removeAccount(i)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <IconX size={13} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Role</Label>
                    <Input
                      value={acc.role}
                      onChange={(e) => updateAccount(i, "role", e.target.value)}
                      placeholder="e.g. Admin"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Username</Label>
                    <Input
                      value={acc.username}
                      onChange={(e) => updateAccount(i, "username", e.target.value)}
                      placeholder="e.g. admin@acme.com"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Password</Label>
                  <div className="relative">
                    <Input
                      type={visiblePasswords.has(i) ? "text" : "password"}
                      value={acc.password ?? ""}
                      onChange={(e) => updateAccount(i, "password", e.target.value)}
                      placeholder="Optional"
                      className="h-8 text-sm pr-8"
                    />
                    <button
                      type="button"
                      onClick={() => toggleVisible(i)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {visiblePasswords.has(i) ? <IconEyeOff size={14} /> : <IconEye size={14} />}
                    </button>
                  </div>
                </div>
              </div>
            ))}

            <button
              onClick={addAccount}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <IconPlus size={13} /> Add account
            </button>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={saveAccounts} disabled={savingAccounts}>
                {savingAccounts ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
