"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IconPlus, IconSparkles, IconChevronRight, IconLoader2 } from "@tabler/icons-react";
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

interface ProjectTabsProps {
  projectId: string;
  findings: Finding[];
  latestExecSummary: { content: string; createdAt: string } | null;
  execSummaryHistory: Array<{ id: string; authorType: string; createdAt: string }>;
  exportHistory: Array<{
    id: string;
    action: string;
    createdAt: string;
    metadata: Record<string, unknown> | null;
  }>;
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
  const [aiExecLoading, setAiExecLoading] = useState<"draft" | "review" | null>(null);
  const [execReview, setExecReview] = useState<{
    clarity: string;
    accuracy: string;
    suggestions: string[];
  } | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<
    Array<{ itemId: string; name: string; categoryName: string; reason: string }>
  >([]);
  const [addingFinding, setAddingFinding] = useState<string | null>(null);

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

  async function handleAiExecDraft() {
    setAiExecLoading("draft");
    setExecContent("");

    try {
      const res = await fetch(`/api/projects/${projectId}/executive-summary/ai/draft`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === "AI_NOT_CONFIGURED") {
          toast.error("AI features require an ANTHROPIC_API_KEY environment variable.");
        } else {
          toast.error(data.error ?? "AI draft failed.");
        }
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = JSON.parse(line.slice(6));
          if (data.field === "content") setExecContent((p) => p + data.text);
          if (data.done) {
            toast.success("AI draft complete. Review and save when ready.");
            router.refresh();
          }
          if (data.error) toast.error(`AI error: ${data.error}`);
        }
      }
    } catch {
      toast.error("AI draft request failed.");
    } finally {
      setAiExecLoading(null);
    }
  }

  async function handleAiExecReview() {
    setAiExecLoading("review");
    setExecReview(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/executive-summary/ai/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: execContent }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === "AI_NOT_CONFIGURED") {
          toast.error("AI features require an ANTHROPIC_API_KEY environment variable.");
        } else {
          toast.error(data.error ?? "AI review failed.");
        }
        return;
      }
      const review = await res.json();
      setExecReview(review);
    } catch {
      toast.error("AI review request failed.");
    } finally {
      setAiExecLoading(null);
    }
  }

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

      {/* Executive summary tab */}
      <TabsContent value="executive-summary" className="flex-1 overflow-y-auto p-4 mt-0">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-muted-foreground">
            {execSummaryHistory.length > 0
              ? `${execSummaryHistory.length} version${execSummaryHistory.length !== 1 ? "s" : ""} saved`
              : "Not yet saved"}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleAiExecReview}
              disabled={aiExecLoading !== null}
              className="text-[#3C3489] border-[#AFA9EC] bg-[#EEEDFE] hover:bg-[#E4E2FD]"
            >
              {aiExecLoading === "review" ? (
                <IconLoader2 size={13} className="animate-spin" />
              ) : (
                <IconSparkles size={13} />
              )}
              AI review
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAiExecDraft}
              disabled={aiExecLoading !== null}
              className="text-[#3C3489] border-[#AFA9EC] bg-[#EEEDFE] hover:bg-[#E4E2FD]"
            >
              {aiExecLoading === "draft" ? (
                <IconLoader2 size={13} className="animate-spin" />
              ) : (
                <IconSparkles size={13} />
              )}
              AI draft
            </Button>
            <Button size="sm" onClick={saveExecSummary} disabled={savingExec}>
              {savingExec ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
        <MarkdownEditor value={execContent} onChange={setExecContent} />
        {execReview && (
          <div className="mt-3 rounded-md border border-[#AFA9EC] bg-[#EEEDFE] p-3 space-y-1.5 text-xs">
            <p className="text-[#3C3489] font-medium">AI Review</p>
            <p className="text-foreground">{execReview.clarity}</p>
            <p className="text-foreground">{execReview.accuracy}</p>
            {execReview.suggestions.length > 0 && (
              <ul className="list-disc pl-3.5 space-y-0.5 text-foreground">
                {execReview.suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            )}
            <button
              onClick={() => setExecReview(null)}
              className="text-[10px] text-[#3C3489] hover:underline mt-1"
            >
              Dismiss
            </button>
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
                className="flex items-center gap-3 bg-background border border-border rounded-lg px-3.5 py-2.5 text-sm"
              >
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
