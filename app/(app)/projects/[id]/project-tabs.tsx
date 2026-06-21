"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  IconPlus,
  IconSparkles,
  IconChevronRight,
  IconLoader2,
  IconLock,
  IconFileText,
} from "@tabler/icons-react";

type Finding = {
  id: string;
  title: string;
  riskLevel: "high" | "medium" | "low" | "informational";
  status: string;
  isAdhoc: boolean;
};

const riskBadge = (risk: Finding["riskLevel"]) => {
  const map: Record<string, string> = {
    high: "bg-[#FCEBEB] text-[#A32D2D]",
    medium: "bg-[#FAEEDA] text-[#633806]",
    low: "bg-[#EAF3DE] text-[#27500A]",
    informational: "bg-muted text-muted-foreground",
  };
  const labels: Record<string, string> = {
    high: "High",
    medium: "Med",
    low: "Low",
    informational: "Info",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${map[risk]}`}>
      {labels[risk]}
    </span>
  );
};

const statusLabel = (status: string) => {
  const map: Record<string, string> = {
    draft: "Draft",
    in_review: "In Review",
    confirmed: "Confirmed",
    informational: "Informational",
    false_positive: "False Positive",
  };
  return map[status] ?? status;
};

interface ReportVersionSummary {
  id: string;
  version: string;
  status: "draft" | "in_review" | "published";
  publishedAt: string | null;
  createdAt: string;
}

interface ReportSummary {
  id: string;
  name: string;
  createdAt: string;
  versions: ReportVersionSummary[];
}

interface ProjectTabsProps {
  projectId: string;
  findings: Finding[];
  reports: ReportSummary[];
  exportHistory: Array<{
    id: string;
    action: string;
    createdAt: string;
    format: string | null;
    exporterName: string | null;
    reportName: string | null;
    reportVersion: string | null;
  }>;
}

const VERSION_STATUS_BADGE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  in_review: "bg-[#FAEEDA] text-[#633806]",
  published: "bg-[#EAF3DE] text-[#27500A]",
};

const VERSION_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  in_review: "In Review",
  published: "Published",
};

export function ProjectTabs({ projectId, findings, reports, exportHistory }: ProjectTabsProps) {
  const router = useRouter();
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<
    Array<{ itemId: string; name: string; categoryName: string; reason: string }>
  >([]);
  const [addingFinding, setAddingFinding] = useState<string | null>(null);
  const [newReportOpen, setNewReportOpen] = useState(false);
  const [newReportName, setNewReportName] = useState("");
  const [creatingReport, setCreatingReport] = useState(false);
  const [newVersionForReport, setNewVersionForReport] = useState<{
    reportId: string;
    existingVersions: ReportVersionSummary[];
  } | null>(null);
  const [newVersionString, setNewVersionString] = useState("");
  const [newVersionForkId, setNewVersionForkId] = useState("");
  const [creatingVersion, setCreatingVersion] = useState(false);

  async function handleAiSuggest() {
    setSuggestLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/ai/suggest`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === "AI_NOT_CONFIGURED") {
          toast.error("AI features require an ANTHROPIC_API_KEY environment variable.");
        } else {
          toast.error(data.error ?? "AI suggest failed.");
        }
        return;
      }
      const data = await res.json();
      setSuggestions(data);
      setSuggestOpen(true);
    } catch {
      toast.error("AI suggest request failed.");
    } finally {
      setSuggestLoading(false);
    }
  }

  async function handleAddSuggestedFinding(suggestion: {
    itemId: string;
    name: string;
    categoryName: string;
    reason: string;
  }) {
    setAddingFinding(suggestion.itemId);
    try {
      const res = await fetch(`/api/projects/${projectId}/findings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: suggestion.name,
          playbookItemId: suggestion.itemId,
          riskLevel: "medium",
        }),
      });
      if (!res.ok) {
        toast.error("Failed to add finding.");
        return;
      }
      toast.success(`Finding "${suggestion.name}" added.`);
      setSuggestions((prev) => prev.filter((s) => s.itemId !== suggestion.itemId));
      router.refresh();
    } catch {
      toast.error("Failed to add finding.");
    } finally {
      setAddingFinding(null);
    }
  }

  async function handleCreateReport() {
    if (!newReportName.trim()) return;
    setCreatingReport(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newReportName.trim() }),
      });
      if (!res.ok) {
        toast.error("Failed to create report.");
        return;
      }
      const data = await res.json();
      setNewReportOpen(false);
      setNewReportName("");
      router.refresh();
      // Navigate directly to the first version of the new report
      if (data.versions?.[0]?.id) {
        router.push(`/projects/${projectId}/reports/${data.id}/versions/${data.versions[0].id}`);
      }
    } catch {
      toast.error("Failed to create report.");
    } finally {
      setCreatingReport(false);
    }
  }

  async function handleCreateVersion() {
    if (!newVersionForReport || !newVersionString.trim()) return;
    setCreatingVersion(true);
    try {
      const body: Record<string, string> = { version: newVersionString.trim() };
      if (newVersionForkId) body.forkFromVersionId = newVersionForkId;
      const res = await fetch(
        `/api/projects/${projectId}/reports/${newVersionForReport.reportId}/versions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        toast.error("Failed to create version.");
        return;
      }
      const data = await res.json();
      setNewVersionForReport(null);
      setNewVersionString("");
      setNewVersionForkId("");
      router.refresh();
      router.push(
        `/projects/${projectId}/reports/${newVersionForReport.reportId}/versions/${data.id}`
      );
    } catch {
      toast.error("Failed to create version.");
    } finally {
      setCreatingVersion(false);
    }
  }

  return (
    <Tabs defaultValue="findings" className="flex flex-col flex-1 min-h-0">
      <TabsList className="shrink-0 justify-start rounded-none border-b border-border bg-transparent h-auto px-5 py-0">
        <TabsTrigger
          value="findings"
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary text-muted-foreground py-2.5 px-3 text-xs"
        >
          Findings
        </TabsTrigger>
        <TabsTrigger
          value="reports"
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary text-muted-foreground py-2.5 px-3 text-xs"
        >
          Reports
        </TabsTrigger>
        <TabsTrigger
          value="export-history"
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary text-muted-foreground py-2.5 px-3 text-xs"
        >
          Export history
        </TabsTrigger>
      </TabsList>

      {/* New report dialog */}
      <Dialog open={newReportOpen} onOpenChange={setNewReportOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New report</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="report-name">Report name</Label>
              <Input
                id="report-name"
                placeholder="e.g. Final Report"
                value={newReportName}
                onChange={(e) => setNewReportName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateReport()}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setNewReportOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreateReport}
                disabled={creatingReport || !newReportName.trim()}
              >
                {creatingReport ? <IconLoader2 size={13} className="animate-spin" /> : null}
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* New version dialog */}
      <Dialog
        open={!!newVersionForReport}
        onOpenChange={(open) => !open && setNewVersionForReport(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New version</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="version-string">Version</Label>
              <Input
                id="version-string"
                placeholder="e.g. 1.1"
                value={newVersionString}
                onChange={(e) => setNewVersionString(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateVersion()}
                autoFocus
              />
            </div>
            {newVersionForReport && newVersionForReport.existingVersions.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="fork-from">Copy content from</Label>
                <select
                  id="fork-from"
                  value={newVersionForkId}
                  onChange={(e) => setNewVersionForkId(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
                >
                  <option value="">Start blank</option>
                  {newVersionForReport.existingVersions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.version} ({VERSION_STATUS_LABEL[v.status]})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setNewVersionForReport(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreateVersion}
                disabled={creatingVersion || !newVersionString.trim()}
              >
                {creatingVersion ? <IconLoader2 size={13} className="animate-spin" /> : null}
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI suggest dialog */}
      <Dialog open={suggestOpen} onOpenChange={setSuggestOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>AI Suggested Findings</DialogTitle>
          </DialogHeader>
          {suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              All playbook items are already covered, or no suggestions available.
            </p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {suggestions.map((s) => (
                <div key={s.itemId} className="border border-border rounded-lg p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground">{s.categoryName}</p>
                      <p className="text-sm font-medium text-foreground">{s.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{s.reason}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 h-7 text-xs"
                      onClick={() => handleAddSuggestedFinding(s)}
                      disabled={addingFinding === s.itemId}
                    >
                      {addingFinding === s.itemId ? (
                        <IconLoader2 size={12} className="animate-spin" />
                      ) : (
                        <IconPlus size={12} />
                      )}
                      Add
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Findings tab */}
      <TabsContent value="findings" className="flex-1 overflow-y-auto p-4 mt-0">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-muted-foreground">
            {findings.length} finding{findings.length !== 1 ? "s" : ""}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleAiSuggest}
              disabled={suggestLoading}
              className="text-[#3C3489] border-[#AFA9EC] bg-[#EEEDFE] hover:bg-[#E4E2FD]"
            >
              {suggestLoading ? (
                <IconLoader2 size={13} className="animate-spin" />
              ) : (
                <IconSparkles size={13} />
              )}
              AI suggest
            </Button>
            <Link href={`/projects/${projectId}/findings/new`}>
              <Button size="sm">
                <IconPlus size={14} />
                Add finding
              </Button>
            </Link>
          </div>
        </div>

        <div className="space-y-2">
          {findings.length === 0 ? (
            <div className="border border-dashed border-border rounded-lg px-4 py-8 text-center text-sm text-muted-foreground">
              No findings yet. Add your first finding.
            </div>
          ) : (
            findings.map((f) => (
              <Link
                key={f.id}
                href={`/projects/${projectId}/findings/${f.id}`}
                className="flex items-center gap-3 bg-background border border-border rounded-lg px-3.5 py-2.5 hover:border-border/80 hover:bg-muted/20 transition-colors"
              >
                {riskBadge(f.riskLevel)}
                <span className="flex-1 text-sm font-medium text-foreground truncate">
                  {f.title}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {statusLabel(f.status)}
                </span>
                <IconChevronRight size={14} className="text-muted-foreground shrink-0" />
              </Link>
            ))
          )}
        </div>
      </TabsContent>

      {/* Reports tab */}
      <TabsContent value="reports" className="flex-1 overflow-y-auto p-4 mt-0">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-muted-foreground">
            {reports.length} report{reports.length !== 1 ? "s" : ""}
          </span>
          <Button size="sm" onClick={() => setNewReportOpen(true)}>
            <IconPlus size={14} />
            New report
          </Button>
        </div>

        {reports.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg px-4 py-8 text-center text-sm text-muted-foreground">
            No reports yet. Create your first report to get started.
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => (
              <div key={r.id} className="border border-border rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-3.5 py-2.5 bg-muted/30">
                  <IconFileText size={14} className="text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium text-foreground flex-1">{r.name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                  <button
                    onClick={() => {
                      setNewVersionForReport({ reportId: r.id, existingVersions: r.versions });
                      setNewVersionString("");
                      setNewVersionForkId("");
                    }}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted transition-colors"
                  >
                    <IconPlus size={11} />
                    New version
                  </button>
                </div>
                {r.versions.length > 0 && (
                  <div className="divide-y divide-border">
                    {r.versions.map((v) => (
                      <Link
                        key={v.id}
                        href={`/projects/${projectId}/reports/${r.id}/versions/${v.id}`}
                        className="flex items-center gap-3 px-3.5 py-2 hover:bg-muted/20 transition-colors"
                      >
                        <span className="text-xs text-muted-foreground w-12 shrink-0">
                          v{v.version}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${VERSION_STATUS_BADGE[v.status]}`}
                        >
                          {v.status === "published" && <IconLock size={9} />}
                          {VERSION_STATUS_LABEL[v.status]}
                        </span>
                        {v.publishedAt && (
                          <span className="text-[11px] text-muted-foreground">
                            Published{" "}
                            {new Date(v.publishedAt).toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        )}
                        <IconChevronRight
                          size={13}
                          className="text-muted-foreground ml-auto shrink-0"
                        />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </TabsContent>

      {/* Export history tab */}
      <TabsContent value="export-history" className="flex-1 overflow-y-auto p-4 mt-0">
        {exportHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">No exports yet.</p>
        ) : (
          <div className="space-y-2">
            {exportHistory.map((e) => (
              <div
                key={e.id}
                className="bg-background border border-border rounded-lg px-3.5 py-2.5 text-sm flex items-start gap-3"
              >
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium uppercase text-xs tracking-wide text-foreground">
                      {e.format ?? "export"}
                    </span>
                    {e.reportName && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-xs text-foreground truncate">
                          {e.reportName}
                          {e.reportVersion ? ` v${e.reportVersion}` : ""}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    {e.exporterName && <span>{e.exporterName}</span>}
                    {e.exporterName && <span>·</span>}
                    <span>
                      {new Date(e.createdAt).toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
