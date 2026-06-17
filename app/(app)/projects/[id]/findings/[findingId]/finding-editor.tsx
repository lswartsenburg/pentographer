"use client";

import { useState } from "react";
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
  IconLinkOff,
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
  evidenceUrls: string[];
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
        evidenceUrls: latestVersion?.evidenceUrls ?? [],
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

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
              Evidence
            </Label>
            <div className="border border-dashed border-border rounded-lg px-4 py-6 text-center text-sm text-muted-foreground">
              Evidence upload coming in Phase 2.
            </div>
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

          <div className="pt-2 border-t border-border">
            <p className="text-[11px] text-muted-foreground mb-2 uppercase tracking-wide font-medium">
              AI tools
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled
              className="w-full justify-start text-[#3C3489] border-[#AFA9EC] bg-[#EEEDFE] text-xs"
            >
              <IconSparkles size={12} />
              AI-assisted writing
            </Button>
            <p className="text-[10px] text-muted-foreground mt-1.5">Coming in a future release.</p>
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
