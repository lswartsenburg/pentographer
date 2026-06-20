"use client";

import { useState, useRef, useCallback } from "react";
import type { EvidenceItem } from "@/db/schema";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MarkdownEditor } from "@/components/markdown-editor";
import {
  IconDeviceFloppy,
  IconHistory,
  IconSparkles,
  IconRotateClockwise,
  IconLoader2,
  IconUpload,
  IconX,
  IconFile,
} from "@tabler/icons-react";
import { PlaybookItemCombobox } from "@/components/playbook-item-combobox";

type RiskLevel = "high" | "medium" | "low" | "informational";
type FindingStatus = "draft" | "in_review" | "confirmed" | "informational" | "false_positive";

interface FindingData {
  id: string;
  title: string;
  riskLevel: RiskLevel;
  cvssScore: string | null;
  status: FindingStatus;
  isAdhoc: boolean;
  playbookItemId: string | null;
}

interface FindingVersion {
  id: string;
  title: string;
  description: string | null;
  remediation: string | null;
  riskLevel: RiskLevel;
  cvssScore: string | null;
  status: FindingStatus;
  evidenceUrls: EvidenceItem[];
  authorType: string;
  createdAt: string;
}

interface VersionSummary {
  id: string;
  title: string;
  riskLevel: RiskLevel;
  status: FindingStatus;
  authorType: string;
  createdAt: string;
}

type PlaybookItemOption = {
  id: string;
  name: string;
  categoryName: string;
  defaultRisk: RiskLevel;
  description: string | null;
  defaultRemediation: string | null;
};

interface FindingEditorProps {
  projectId: string;
  projectName: string;
  finding: FindingData;
  latestVersion: FindingVersion | null;
  versions: VersionSummary[];
  playbookItems: PlaybookItemOption[];
}

const BACKWARD_FROM: FindingStatus[] = [
  "confirmed",
  "informational",
  "false_positive",
  "in_review",
];
const BACKWARD_TO: FindingStatus[] = ["draft", "in_review"];

function needsJustification(from: FindingStatus, to: FindingStatus) {
  return BACKWARD_FROM.includes(from) && BACKWARD_TO.includes(to) && from !== to;
}

const riskColors: Record<RiskLevel, string> = {
  high: "bg-[#FCEBEB] text-[#A32D2D]",
  medium: "bg-[#FAEEDA] text-[#633806]",
  low: "bg-[#EAF3DE] text-[#27500A]",
  informational: "bg-muted text-muted-foreground",
};

const statusLabels: Record<string, string> = {
  draft: "Draft",
  in_review: "In Review",
  confirmed: "Confirmed",
  informational: "Informational",
  false_positive: "False Positive",
};

export function FindingEditor({
  projectId,
  projectName,
  finding: f,
  latestVersion,
  versions,
  playbookItems,
}: FindingEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(latestVersion?.title ?? f.title);
  const [description, setDescription] = useState(latestVersion?.description ?? "");
  const [remediation, setRemediation] = useState(latestVersion?.remediation ?? "");
  const [riskLevel, setRiskLevel] = useState<RiskLevel>(latestVersion?.riskLevel ?? f.riskLevel);
  const [cvssScore, setCvssScore] = useState(latestVersion?.cvssScore ?? "");
  const [status, setStatus] = useState<FindingStatus>(latestVersion?.status ?? f.status);
  const [justification, setJustification] = useState("");
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [linkingItem, setLinkingItem] = useState(false);
  const [currentItemId, setCurrentItemId] = useState<string | null>(f.playbookItemId ?? null);
  const [aiLoading, setAiLoading] = useState<"draft" | "review" | null>(null);
  const [aiReview, setAiReview] = useState<{
    completeness: string;
    severity: string;
    suggestions: string[];
  } | null>(null);
  const [evidenceItems, setEvidenceItems] = useState<EvidenceItem[]>(
    latestVersion?.evidenceUrls ?? []
  );
  const nextKeyNum = useRef(
    Math.max(
      0,
      ...(latestVersion?.evidenceUrls ?? []).map((e) => {
        const m = e.key.match(/fig-(\d+)/);
        return m ? parseInt(m[1]) : 0;
      })
    ) + 1
  );
  const [uploading, setUploading] = useState(false);
  const [evidenceDragOver, setEvidenceDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentItem = playbookItems.find((i) => i.id === currentItemId) ?? null;
  const riskMatchesPlaybook = currentItem !== null && riskLevel === currentItem.defaultRisk;

  async function handleLinkItem(itemId: string | null) {
    setLinkingItem(true);
    const res = await fetch(`/api/projects/${projectId}/findings/${f.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playbookItemId: itemId,
        isAdhoc: !itemId,
      }),
    });
    setLinkingItem(false);
    if (!res.ok) {
      toast.error("Failed to update playbook link.");
      return;
    }
    setCurrentItemId(itemId);
    toast.success(itemId ? "Linked to playbook item." : "Unlinked from playbook.");
  }

  const requiresJustification = needsJustification(f.status, status);

  async function handleSave() {
    if (requiresJustification && !justification.trim()) {
      toast.error("Provide a justification to reverse the finding status.");
      return;
    }

    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}/findings/${f.id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description: description || null,
        remediation: remediation || null,
        riskLevel,
        cvssScore: cvssScore || null,
        status,
        evidenceUrls: evidenceItems,
        justification: justification || undefined,
      }),
    });

    setSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Failed to save finding.");
      return;
    }

    toast.success("Finding saved.");
    setJustification("");
    router.refresh();
  }

  async function handleRestore(versionId: string) {
    const res = await fetch(
      `/api/projects/${projectId}/findings/${f.id}/versions/${versionId}/restore`,
      { method: "POST" }
    );

    if (!res.ok) {
      toast.error("Failed to restore version.");
      return;
    }

    toast.success("Version restored.");
    setHistoryOpen(false);
    router.refresh();
  }

  async function handleAiDraft() {
    setAiLoading("draft");
    try {
      const res = await fetch(`/api/projects/${projectId}/findings/${f.id}/ai/draft`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.error === "AI_NOT_CONFIGURED") {
          toast.error("AI features require an ANTHROPIC_API_KEY environment variable.");
        } else {
          toast.error(data.error ?? "AI draft failed.");
        }
        return;
      }
      setDescription(data.description ?? "");
      setRemediation(data.remediation ?? "");
      toast.success("AI draft complete. Review and save when ready.");
      router.refresh();
    } catch {
      toast.error("AI draft request failed.");
    } finally {
      setAiLoading(null);
    }
  }

  async function handleAiReview() {
    setAiLoading("review");
    setAiReview(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/findings/${f.id}/ai/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, remediation, riskLevel }),
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
      setAiReview(review);
    } catch {
      toast.error("AI review request failed.");
    } finally {
      setAiLoading(null);
    }
  }

  async function uploadEvidenceFile(file: File) {
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`/api/projects/${projectId}/findings/${f.id}/evidence`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Upload failed.");
        return;
      }
      const key = `fig-${nextKeyNum.current++}`;
      setEvidenceItems((prev) => [...prev, { key, url: data.url }]);
    } catch {
      toast.error("Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function handleEvidenceUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (file) uploadEvidenceFile(file);
  }

  function handleEvidenceDrop(e: React.DragEvent) {
    e.preventDefault();
    setEvidenceDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadEvidenceFile(file);
  }

  async function handleEvidenceDelete(url: string) {
    await fetch(`/api/projects/${projectId}/findings/${f.id}/evidence`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    setEvidenceItems((prev) => prev.filter((item) => item.url !== url));
  }

  const copyKey = useCallback((key: string) => {
    navigator.clipboard.writeText(`[${key}]`).then(() => toast.success(`Copied [${key}]`));
  }, []);

  return (
    <>
      <header className="flex items-center justify-between border-b border-border h-12 px-5 bg-background">
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/projects" className="hover:text-foreground">
            Projects
          </Link>
          <span>/</span>
          <Link href={`/projects/${projectId}`} className="hover:text-foreground">
            {projectName}
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium truncate max-w-[200px]">{f.title}</span>
        </nav>
        <div className="flex items-center gap-2">
          <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <IconHistory size={14} />
                History
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Version history</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {versions.length === 0 && (
                  <p className="text-sm text-muted-foreground">No versions saved yet.</p>
                )}
                {versions.map((v, i) => (
                  <div
                    key={v.id}
                    className="flex items-center gap-3 border border-border rounded-lg px-3 py-2.5"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{v.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {new Date(v.createdAt).toLocaleString()} · {v.authorType}
                      </p>
                    </div>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${riskColors[v.riskLevel]}`}
                    >
                      {v.riskLevel.charAt(0).toUpperCase()}
                    </span>
                    {i > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7 px-2"
                        onClick={() => handleRestore(v.id)}
                      >
                        <IconRotateClockwise size={12} />
                        Restore
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <IconDeviceFloppy size={14} />
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Main content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Finding title"
              className="text-sm font-medium"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
              Description
            </Label>
            <MarkdownEditor
              value={description}
              onChange={setDescription}
              placeholder="Describe the vulnerability, its impact, and where it was found…"
              rows={10}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
              Remediation
            </Label>
            <MarkdownEditor
              value={remediation}
              onChange={setRemediation}
              placeholder="Steps to remediate this vulnerability…"
              rows={8}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                Evidence
              </Label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors cursor-pointer disabled:cursor-default"
              >
                {uploading ? (
                  <IconLoader2 size={13} className="animate-spin" />
                ) : (
                  <IconUpload size={13} />
                )}
                {uploading ? "Uploading…" : "Upload file"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml,application/pdf"
                className="hidden"
                onChange={handleEvidenceUpload}
              />
            </div>
            {evidenceItems.length === 0 ? (
              <div
                className={`border border-dashed rounded-lg px-4 py-5 text-center text-xs text-muted-foreground cursor-pointer transition-colors ${evidenceDragOver ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-border/60"}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setEvidenceDragOver(true);
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setEvidenceDragOver(true);
                }}
                onDragLeave={() => setEvidenceDragOver(false)}
                onDrop={handleEvidenceDrop}
              >
                {evidenceDragOver
                  ? "Drop to upload"
                  : "No evidence attached. Click or drop an image or PDF (max 10 MB)."}
              </div>
            ) : (
              <div
                className={`flex flex-wrap gap-2 rounded-lg border border-dashed p-2 transition-colors ${evidenceDragOver ? "border-primary bg-primary/5" : "border-transparent"}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setEvidenceDragOver(true);
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setEvidenceDragOver(true);
                }}
                onDragLeave={() => setEvidenceDragOver(false)}
                onDrop={handleEvidenceDrop}
              >
                {evidenceItems.map(({ key, url }) => {
                  const isImage = /\.(jpe?g|png|gif|webp|svg)(\?|$)/i.test(url);
                  const proxyUrl = `/api/projects/${projectId}/findings/${f.id}/evidence/proxy?url=${encodeURIComponent(url)}`;
                  return (
                    <div
                      key={url}
                      className="relative group w-28 h-28 shrink-0 rounded-md overflow-hidden border border-border bg-muted/30"
                    >
                      {isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={proxyUrl} alt={key} className="w-full h-full object-cover" />
                      ) : (
                        <div className="flex flex-col items-center justify-center w-full h-full gap-1">
                          <IconFile size={22} className="text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground truncate max-w-full px-1">
                            {url.split("/").pop()?.split("?")[0] ?? "file"}
                          </span>
                        </div>
                      )}
                      {/* Key badge — click to copy */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          copyKey(key);
                        }}
                        className="absolute bottom-1 left-1 bg-background/90 border border-border rounded px-1 py-0.5 text-[10px] font-mono font-medium text-foreground hover:bg-primary hover:text-primary-foreground transition-colors z-10"
                        title="Click to copy reference"
                      >
                        {key}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEvidenceDelete(url)}
                        className="absolute top-1 right-1 bg-background/80 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground z-10"
                      >
                        <IconX size={11} />
                      </button>
                      <a
                        href={proxyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute inset-0"
                        aria-label="Open evidence"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="w-72 shrink-0 border-l border-border bg-background overflow-y-auto p-5 space-y-5">
          {/* Playbook item link */}
          {playbookItems.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">
                Playbook item
              </p>
              <PlaybookItemCombobox
                items={playbookItems}
                value={currentItemId}
                onChange={handleLinkItem}
                placeholder="Not linked (ad-hoc)"
                disabled={linkingItem}
              />
              {currentItem && (
                <div className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
                  <p className="text-[10px] text-muted-foreground">{currentItem.categoryName}</p>
                  <p className="text-xs font-medium text-foreground leading-snug mt-0.5">
                    {currentItem.name}
                  </p>
                </div>
              )}
            </div>
          )}

          {playbookItems.length > 0 && <div className="border-t border-border" />}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Risk level</Label>
              {currentItem && riskMatchesPlaybook && (
                <span className="flex items-center gap-1 text-[10px] text-primary font-medium">
                  <IconSparkles size={10} />
                  Playbook
                </span>
              )}
              {currentItem && !riskMatchesPlaybook && (
                <span className="text-[10px] text-muted-foreground">Manually set</span>
              )}
            </div>
            <Select value={riskLevel} onValueChange={(v) => setRiskLevel(v as RiskLevel)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="informational">Informational</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>CVSS score</Label>
            <Input
              className="h-8 text-xs"
              value={cvssScore}
              onChange={(e) => setCvssScore(e.target.value)}
              placeholder="e.g. 8.1"
              type="number"
              min={0}
              max={10}
              step={0.1}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as FindingStatus)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="in_review">In Review</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="informational">Informational</SelectItem>
                <SelectItem value="false_positive">False Positive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {requiresJustification && (
            <div className="space-y-1.5">
              <Label className="text-destructive text-xs">Justification required</Label>
              <textarea
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Reason for reversing status…"
                rows={3}
                className="w-full resize-none rounded-md border border-destructive bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-destructive/50"
              />
            </div>
          )}

          <div className="pt-2 border-t border-border space-y-1.5">
            <p className="text-[11px] text-muted-foreground mb-2 uppercase tracking-wide font-medium">
              AI tools
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAiDraft}
              disabled={aiLoading !== null}
              className="w-full justify-start text-[#3C3489] border-[#AFA9EC] bg-[#EEEDFE] hover:bg-[#E4E2FD] text-xs"
            >
              {aiLoading === "draft" ? (
                <IconLoader2 size={12} className="animate-spin" />
              ) : (
                <IconSparkles size={12} />
              )}
              Draft finding
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAiReview}
              disabled={aiLoading !== null}
              className="w-full justify-start text-[#3C3489] border-[#AFA9EC] bg-[#EEEDFE] hover:bg-[#E4E2FD] text-xs"
            >
              {aiLoading === "review" ? (
                <IconLoader2 size={12} className="animate-spin" />
              ) : (
                <IconSparkles size={12} />
              )}
              Review finding
            </Button>
            {aiReview && (
              <div className="rounded-md border border-[#AFA9EC] bg-[#EEEDFE] p-2.5 space-y-1.5 text-xs">
                <p className="text-[#3C3489] font-medium">AI Review</p>
                <p className="text-foreground">{aiReview.completeness}</p>
                <p className="text-foreground">{aiReview.severity}</p>
                {aiReview.suggestions.length > 0 && (
                  <ul className="list-disc pl-3.5 space-y-0.5 text-foreground">
                    {aiReview.suggestions.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                )}
                <button
                  onClick={() => setAiReview(null)}
                  className="text-[10px] text-[#3C3489] hover:underline mt-1"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-border">
            <p className="text-[11px] text-muted-foreground mb-1 uppercase tracking-wide font-medium">
              Recent versions
            </p>
            {versions.slice(0, 5).map((v) => (
              <div key={v.id} className="flex items-center gap-1.5 py-1">
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${riskColors[v.riskLevel]}`}
                >
                  {v.riskLevel.charAt(0).toUpperCase()}
                </span>
                <span className="text-[11px] text-muted-foreground truncate flex-1">
                  {new Date(v.createdAt).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
