"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MarkdownEditor } from "@/components/markdown-editor";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  IconSparkles,
  IconLoader2,
  IconCheck,
  IconLock,
  IconChevronRight,
  IconDownload,
} from "@tabler/icons-react";
import Link from "next/link";
import { marked } from "marked";
import DOMPurify from "dompurify";

type RiskLevel = "high" | "medium" | "low" | "informational";

interface Finding {
  id: string;
  title: string;
  riskLevel: RiskLevel;
  status: string;
}

interface ReportVersionEditorProps {
  projectId: string;
  projectName: string;
  customerName: string;
  reportId: string;
  reportName: string;
  versionId: string;
  version: string;
  status: "draft" | "in_review" | "published";
  initialExecSummary: string;
  findings: Finding[];
}

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  in_review: "bg-[#FAEEDA] text-[#633806]",
  published: "bg-[#EAF3DE] text-[#27500A]",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  in_review: "In Review",
  published: "Published",
};

const RISK_COLOR: Record<RiskLevel, string> = {
  high: "text-[#A32D2D]",
  medium: "text-[#633806]",
  low: "text-[#27500A]",
  informational: "text-muted-foreground",
};

export function ReportVersionEditor({
  projectId,
  projectName,
  customerName,
  reportId,
  reportName,
  versionId,
  version,
  status: initialStatus,
  initialExecSummary,
  findings,
}: ReportVersionEditorProps) {
  const router = useRouter();
  const [execContent, setExecContent] = useState(initialExecSummary);
  const [status, setStatus] = useState(initialStatus);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [aiLoading, setAiLoading] = useState<"draft" | "review" | null>(null);
  const [review, setReview] = useState<{
    clarity: string;
    accuracy: string;
    suggestions: string[];
  } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"docx" | "pdf" | "markdown">("docx");
  const [exportTemplateId, setExportTemplateId] = useState("");
  const [exportLoading, setExportLoading] = useState(false);
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!exportOpen) return;
    fetch("/api/settings/report-template")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setTemplates(data);
      })
      .catch(() => {});
  }, [exportOpen]);

  const isPublished = status === "published";
  const apiBase = `/api/projects/${projectId}/reports/${reportId}/versions/${versionId}`;

  const renderedExecSummary = useMemo(() => {
    if (!isPublished || !execContent) return "";
    const raw = marked.parse(execContent, { async: false }) as string;
    if (typeof window !== "undefined") return DOMPurify.sanitize(raw);
    return raw;
  }, [isPublished, execContent]);

  async function handleSave() {
    setSaving(true);
    const res = await fetch(apiBase, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ execSummary: execContent }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error("Failed to save.");
      return;
    }
    toast.success("Saved.");
    router.refresh();
  }

  async function handlePublish() {
    setPublishing(true);
    const res = await fetch(`${apiBase}/publish`, { method: "POST" });
    setPublishing(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Publish failed.");
      return;
    }
    setStatus("published");
    toast.success("Report version published. Findings are now locked.");
    router.refresh();
  }

  async function handleAiDraft() {
    setAiLoading("draft");
    setExecContent("");
    try {
      const res = await fetch(`${apiBase}/ai/draft`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(
          data.error === "AI_NOT_CONFIGURED"
            ? "AI features require an ANTHROPIC_API_KEY environment variable."
            : (data.error ?? "AI draft failed.")
        );
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
          if (data.done) toast.success("AI draft complete. Review and save when ready.");
          if (data.error) toast.error(`AI error: ${data.error}`);
        }
      }
    } catch {
      toast.error("AI draft request failed.");
    } finally {
      setAiLoading(null);
    }
  }

  async function handleAiReview() {
    setAiLoading("review");
    setReview(null);
    try {
      const res = await fetch(`${apiBase}/ai/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: execContent }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(
          data.error === "AI_NOT_CONFIGURED"
            ? "AI features require an ANTHROPIC_API_KEY environment variable."
            : (data.error ?? "AI review failed.")
        );
        return;
      }
      setReview(await res.json());
    } catch {
      toast.error("AI review request failed.");
    } finally {
      setAiLoading(null);
    }
  }

  async function handleExport() {
    setExportLoading(true);
    const body: Record<string, unknown> = {
      format: exportFormat,
      reportVersionId: versionId,
    };
    if (exportFormat === "docx" && exportTemplateId) {
      body.templateId = exportTemplateId;
    }
    try {
      const res = await fetch(`/api/projects/${projectId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Export failed.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ??
        `report.${exportFormat}`;
      a.click();
      URL.revokeObjectURL(url);
      setExportOpen(false);
    } catch {
      toast.error("Export failed.");
    } finally {
      setExportLoading(false);
    }
  }

  const riskCounts = { high: 0, medium: 0, low: 0, informational: 0 };
  for (const f of findings) riskCounts[f.riskLevel]++;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border h-12 px-5 bg-background shrink-0">
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/projects" className="hover:text-foreground">
            Projects
          </Link>
          <IconChevronRight size={11} />
          <Link href={`/projects/${projectId}`} className="hover:text-foreground">
            {customerName}
          </Link>
          <IconChevronRight size={11} />
          <Link href={`/projects/${projectId}`} className="hover:text-foreground">
            {projectName}
          </Link>
          <IconChevronRight size={11} />
          <span className="text-foreground font-medium">{reportName}</span>
          <IconChevronRight size={11} />
          <span className="text-foreground font-medium">v{version}</span>
        </nav>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_BADGE[status]}`}
          >
            {isPublished && <IconLock size={10} />}
            {STATUS_LABEL[status]}
          </span>
          <Button size="sm" variant="outline" onClick={() => setExportOpen(true)}>
            <IconDownload size={13} />
            Export
          </Button>
          {!isPublished && (
            <>
              <Button size="sm" variant="outline" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button size="sm" onClick={handlePublish} disabled={publishing}>
                {publishing ? (
                  <IconLoader2 size={13} className="animate-spin" />
                ) : (
                  <IconCheck size={13} />
                )}
                Publish
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Export dialog */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Export report</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label>Format</Label>
              <div className="flex gap-2">
                {(
                  [
                    { value: "docx", label: "DOCX" },
                    { value: "pdf", label: "PDF" },
                    { value: "markdown", label: "Markdown" },
                  ] as const
                ).map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setExportFormat(value)}
                    className={`flex-1 py-2 rounded-md border text-sm font-medium transition-colors ${
                      exportFormat === value
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-muted-foreground hover:border-border/80"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {exportFormat === "docx" && (
              <div className="space-y-1.5">
                <Label htmlFor="template-select">Template</Label>
                <select
                  id="template-select"
                  value={exportTemplateId}
                  onChange={(e) => setExportTemplateId(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
                >
                  <option value="">No template (basic export)</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setExportOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleExport} disabled={exportLoading}>
                {exportLoading ? (
                  <IconLoader2 size={13} className="animate-spin" />
                ) : (
                  <IconDownload size={13} />
                )}
                Download
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex flex-1 min-h-0">
        {/* Left panel — finding summary */}
        <div className="w-64 shrink-0 border-r border-border overflow-y-auto p-4 space-y-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-2">
              Risk summary
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {(["high", "medium", "low", "informational"] as RiskLevel[]).map((r) => (
                <div key={r} className="border border-border rounded-md p-2 text-center">
                  <p className={`text-lg font-semibold ${RISK_COLOR[r]}`}>{riskCounts[r]}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{r}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-2">
              Findings ({findings.length})
            </p>
            <div className="space-y-1">
              {findings.length === 0 ? (
                <p className="text-xs text-muted-foreground">No findings.</p>
              ) : (
                findings.map((f) => (
                  <div key={f.id} className="text-xs text-foreground truncate py-0.5">
                    <span
                      className={`font-medium uppercase text-[10px] mr-1.5 ${RISK_COLOR[f.riskLevel]}`}
                    >
                      {f.riskLevel.slice(0, 1).toUpperCase()}
                    </span>
                    {f.title}
                  </div>
                ))
              )}
            </div>
          </div>

          {isPublished && (
            <div className="rounded-md border border-[#AFA9EC] bg-[#EEEDFE] p-3 text-xs text-[#3C3489]">
              <p className="font-medium mb-1 flex items-center gap-1">
                <IconLock size={11} /> Published
              </p>
              <p>
                Findings are locked to the state at publish time. Create a new version to make
                changes.
              </p>
            </div>
          )}
        </div>

        {/* Main — exec summary editor */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Executive summary
            </p>
            {!isPublished && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAiReview}
                  disabled={aiLoading !== null}
                  className="text-[#3C3489] border-[#AFA9EC] bg-[#EEEDFE] hover:bg-[#E4E2FD]"
                >
                  {aiLoading === "review" ? (
                    <IconLoader2 size={13} className="animate-spin" />
                  ) : (
                    <IconSparkles size={13} />
                  )}
                  AI review
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAiDraft}
                  disabled={aiLoading !== null}
                  className="text-[#3C3489] border-[#AFA9EC] bg-[#EEEDFE] hover:bg-[#E4E2FD]"
                >
                  {aiLoading === "draft" ? (
                    <IconLoader2 size={13} className="animate-spin" />
                  ) : (
                    <IconSparkles size={13} />
                  )}
                  AI draft
                </Button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {isPublished ? (
              renderedExecSummary ? (
                <div
                  className="prose prose-sm max-w-none text-foreground"
                  dangerouslySetInnerHTML={{ __html: renderedExecSummary }}
                />
              ) : (
                <span className="text-muted-foreground italic text-sm">No executive summary.</span>
              )
            ) : (
              <MarkdownEditor value={execContent} onChange={setExecContent} />
            )}

            {review && (
              <div className="mt-4 rounded-md border border-[#AFA9EC] bg-[#EEEDFE] p-3 space-y-1.5 text-xs">
                <p className="text-[#3C3489] font-medium">AI Review</p>
                <p className="text-foreground">{review.clarity}</p>
                <p className="text-foreground">{review.accuracy}</p>
                {review.suggestions.length > 0 && (
                  <ul className="list-disc pl-3.5 space-y-0.5 text-foreground">
                    {review.suggestions.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                )}
                <button
                  onClick={() => setReview(null)}
                  className="text-[10px] text-[#3C3489] hover:underline mt-1"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
