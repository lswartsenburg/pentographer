"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IconPlus, IconX } from "@tabler/icons-react";

interface TestAccount {
  role: string;
  username: string;
}

interface ProjectSidebarProps {
  projectId: string;
  status: string;
  customerName: string | null;
  playbookName: string | null;
  playbookVersion: string | null;
  scope: string | null;
  applicationUrl: string | null;
  reportVersion: string | null;
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
  reportVersion: initialReportVersion,
  testAccounts: initialTestAccounts,
  startDate,
  endDate,
  highCount,
  medCount,
  lowCount,
}: ProjectSidebarProps) {
  const router = useRouter();
  const [applicationUrl, setApplicationUrl] = useState(initialApplicationUrl ?? "");
  const [reportVersion, setReportVersion] = useState(initialReportVersion ?? "");
  const [testAccounts, setTestAccounts] = useState<TestAccount[]>(initialTestAccounts ?? []);
  const [saving, setSaving] = useState(false);

  function addTestAccount() {
    setTestAccounts((prev) => [...prev, { role: "", username: "" }]);
  }

  function removeTestAccount(index: number) {
    setTestAccounts((prev) => prev.filter((_, i) => i !== index));
  }

  function updateTestAccount(index: number, field: keyof TestAccount, value: string) {
    setTestAccounts((prev) => prev.map((a, i) => (i === index ? { ...a, [field]: value } : a)));
  }

  async function handleSave() {
    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicationUrl: applicationUrl.trim() || null,
        reportVersion: reportVersion.trim() || null,
        testAccounts: testAccounts.filter((a) => a.role.trim() || a.username.trim()),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Failed to save.");
      return;
    }
    toast.success("Report settings saved.");
    router.refresh();
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
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

        {/* Report settings — editable */}
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
              placeholder="https://app.example.com"
              className="h-7 text-xs"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[11px]" htmlFor="report-ver">
              Report version
            </Label>
            <Input
              id="report-ver"
              value={reportVersion}
              onChange={(e) => setReportVersion(e.target.value)}
              placeholder="1.0"
              className="h-7 text-xs w-24"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Test accounts</Label>
              <button
                onClick={addTestAccount}
                className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <IconPlus size={11} /> Add
              </button>
            </div>
            {testAccounts.map((acc, i) => (
              <div key={i} className="flex gap-1 items-center">
                <Input
                  value={acc.role}
                  onChange={(e) => updateTestAccount(i, "role", e.target.value)}
                  placeholder="Role"
                  className="h-6 text-[11px] w-20 shrink-0"
                />
                <Input
                  value={acc.username}
                  onChange={(e) => updateTestAccount(i, "username", e.target.value)}
                  placeholder="Username"
                  className="h-6 text-[11px] flex-1 min-w-0"
                />
                <button
                  onClick={() => removeTestAccount(i)}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <IconX size={12} />
                </button>
              </div>
            ))}
          </div>

          <Button size="sm" className="w-full h-7 text-xs" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
