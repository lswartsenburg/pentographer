"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { IconPlus, IconSparkles, IconChevronRight } from "@tabler/icons-react";
import { MarkdownEditor } from "@/components/markdown-editor";

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
  const labels: Record<string, string> = { high: "High", medium: "Med", low: "Low", informational: "Info" };
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

interface ProjectTabsProps {
  projectId: string;
  findings: Finding[];
  latestExecSummary: { content: string; createdAt: string } | null;
  execSummaryHistory: Array<{ id: string; authorType: string; createdAt: string }>;
  exportHistory: Array<{ id: string; action: string; createdAt: string; metadata: Record<string, unknown> | null }>;
}

export function ProjectTabs({
  projectId,
  findings,
  latestExecSummary,
  execSummaryHistory,
  exportHistory,
}: ProjectTabsProps) {
  const router = useRouter();
  const [execContent, setExecContent] = useState(latestExecSummary?.content ?? "");
  const [savingExec, setSavingExec] = useState(false);

  async function saveExecSummary() {
    setSavingExec(true);
    const res = await fetch(`/api/projects/${projectId}/executive-summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: execContent }),
    });
    setSavingExec(false);

    if (!res.ok) {
      toast.error("Failed to save executive summary.");
      return;
    }

    toast.success("Executive summary saved.");
    router.refresh();
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
          value="executive-summary"
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary text-muted-foreground py-2.5 px-3 text-xs"
        >
          Executive summary
        </TabsTrigger>
        <TabsTrigger
          value="export-history"
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary text-muted-foreground py-2.5 px-3 text-xs"
        >
          Export history
        </TabsTrigger>
      </TabsList>

      {/* Findings tab */}
      <TabsContent value="findings" className="flex-1 overflow-y-auto p-4 mt-0">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-muted-foreground">{findings.length} finding{findings.length !== 1 ? "s" : ""}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled className="text-[#3C3489] border-[#AFA9EC] bg-[#EEEDFE] hover:bg-[#EEEDFE]">
              <IconSparkles size={13} />
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
                <span className="flex-1 text-sm font-medium text-foreground truncate">{f.title}</span>
                <span className="text-xs text-muted-foreground shrink-0">{statusLabel(f.status)}</span>
                <IconChevronRight size={14} className="text-muted-foreground shrink-0" />
              </Link>
            ))
          )}
        </div>
      </TabsContent>

      {/* Executive summary tab */}
      <TabsContent value="executive-summary" className="flex-1 overflow-y-auto p-4 mt-0">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-muted-foreground">
            {execSummaryHistory.length > 0
              ? `${execSummaryHistory.length} version${execSummaryHistory.length !== 1 ? "s" : ""} saved`
              : "Not yet saved"}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled className="text-[#3C3489] border-[#AFA9EC] bg-[#EEEDFE] hover:bg-[#EEEDFE]">
              <IconSparkles size={13} />
              AI draft
            </Button>
            <Button size="sm" onClick={saveExecSummary} disabled={savingExec}>
              {savingExec ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
        <MarkdownEditor value={execContent} onChange={setExecContent} />
      </TabsContent>

      {/* Export history tab */}
      <TabsContent value="export-history" className="flex-1 overflow-y-auto p-4 mt-0">
        {exportHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">No exports yet.</p>
        ) : (
          <div className="space-y-2">
            {exportHistory.map((e) => (
              <div key={e.id} className="flex items-center gap-3 bg-background border border-border rounded-lg px-3.5 py-2.5 text-sm">
                <span className="text-foreground font-medium capitalize">
                  {(e.metadata as Record<string, string> | null)?.format ?? "Export"}
                </span>
                <span className="text-muted-foreground text-xs">
                  {new Date(e.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
