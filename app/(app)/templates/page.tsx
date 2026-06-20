"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  IconDownload,
  IconLoader2,
  IconUpload,
  IconTrash,
  IconGlobe,
  IconLock,
} from "@tabler/icons-react";
import { toast } from "sonner";

interface TemplateInfo {
  id: string;
  name: string;
  description: string | null;
  version: string | null;
  language: string | null;
  publishNotes: string | null;
  isPublic: boolean;
  downloadCount: number;
  uploadedAt: string;
}

interface MarketplaceTemplate {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  version: string | null;
  language: string | null;
  publishNotes: string | null;
  downloadCount: number;
  uploadedAt: string;
  authorName: string;
}

function TemplateRow({
  template,
  onDelete,
  onUpdate,
}: {
  template: TemplateInfo;
  onDelete: (id: string) => void;
  onUpdate: (id: string, patch: Partial<TemplateInfo>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? "");
  const [version, setVersion] = useState(template.version ?? "");
  const [language, setLanguage] = useState(template.language ?? "");
  const [publishNotes, setPublishNotes] = useState(template.publishNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSave() {
    setSaving(true);
    const res = await fetch(`/api/settings/report-template/${template.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim() || null,
        version: version.trim() || null,
        language: language.trim() || null,
        publishNotes: publishNotes.trim() || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error("Failed to save changes.");
      return;
    }
    const data = await res.json();
    onUpdate(template.id, data);
    setEditing(false);
    toast.success("Template updated.");
  }

  async function handleTogglePublic() {
    setToggling(true);
    const res = await fetch(`/api/settings/report-template/${template.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublic: !template.isPublic }),
    });
    setToggling(false);
    if (!res.ok) {
      toast.error("Failed to update visibility.");
      return;
    }
    const data = await res.json();
    onUpdate(template.id, data);
    toast.success(
      data.isPublic ? "Template published to marketplace." : "Template set to private."
    );
  }

  async function handleDelete() {
    setDeleting(true);
    const res = await fetch(`/api/settings/report-template/${template.id}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      toast.error("Failed to delete template.");
      return;
    }
    onDelete(template.id);
    toast.success("Template deleted.");
  }

  return (
    <div className="border border-border rounded-lg p-3 space-y-2">
      {editing ? (
        <div className="space-y-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Template name"
            className="text-sm h-8"
          />
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description (shown in marketplace)"
            className="text-sm h-8"
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="Version (e.g. 1.0)"
              className="text-sm h-8"
            />
            <Input
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder="Language (e.g. English)"
              className="text-sm h-8"
            />
          </div>
          <textarea
            value={publishNotes}
            onChange={(e) => setPublishNotes(e.target.value)}
            placeholder="Publish notes — what this template includes, when it was last updated, etc."
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 resize-none"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing(false);
                setName(template.name);
                setDescription(template.description ?? "");
                setVersion(template.version ?? "");
                setLanguage(template.language ?? "");
                setPublishNotes(template.publishNotes ?? "");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <button
            className="text-left flex-1 cursor-pointer"
            onClick={() => setEditing(true)}
            title="Click to edit"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium hover:underline">{template.name}</p>
              {template.version && (
                <span className="text-[10px] font-mono bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                  {template.version}
                </span>
              )}
              {template.language && (
                <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                  {template.language}
                </span>
              )}
            </div>
            {template.description && (
              <p className="text-xs text-muted-foreground mt-0.5">{template.description}</p>
            )}
            {template.publishNotes && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                {template.publishNotes}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">
              Uploaded {new Date(template.uploadedAt).toLocaleDateString()}
              {template.isPublic &&
                ` · ${template.downloadCount} download${template.downloadCount !== 1 ? "s" : ""}`}
            </p>
          </button>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleTogglePublic}
              disabled={toggling}
              className="cursor-pointer h-7 px-2 gap-1"
              title={template.isPublic ? "Make private" : "Publish to marketplace"}
            >
              {template.isPublic ? (
                <IconGlobe size={13} className="text-primary" />
              ) : (
                <IconLock size={13} />
              )}
              <span className="text-xs">{template.isPublic ? "Public" : "Private"}</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDelete}
              disabled={deleting}
              className="cursor-pointer h-7 px-2 text-destructive hover:text-destructive"
            >
              <IconTrash size={13} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function TagReference() {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
      <p className="text-xs font-medium text-foreground">Available template tags</p>
      <p className="text-xs text-muted-foreground">
        Use these tags inside your .docx file. They will be replaced with live project data at
        export time.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono text-muted-foreground leading-relaxed">
        <p>
          <span className="text-foreground">{"{projectName}"}</span> — Project name
        </p>
        <p>
          <span className="text-foreground">{"{customerName}"}</span> — Customer name
        </p>
        <p>
          <span className="text-foreground">{"{scope}"}</span> — Scope
        </p>
        <p>
          <span className="text-foreground">{"{execSummary}"}</span> — Executive summary
        </p>
        <p>
          <span className="text-foreground">{"{exportDate}"}</span> — Export date
        </p>
        <p>
          <span className="text-foreground">{"{totalFindings}"}</span> — Total finding count
        </p>
        <p>
          <span className="text-foreground">{"{highCount}"}</span> — High severity count
        </p>
        <p>
          <span className="text-foreground">{"{mediumCount}"}</span> — Medium severity count
        </p>
        <p>
          <span className="text-foreground">{"{lowCount}"}</span> — Low severity count
        </p>
        <p>
          <span className="text-foreground">{"{infoCount}"}</span> — Info severity count
        </p>
      </div>
      <div className="text-xs font-mono text-muted-foreground leading-relaxed space-y-1 pt-1 border-t border-border">
        <p className="text-foreground font-medium not-mono font-sans">Findings loop</p>
        <p>
          Wrap a table row or paragraph with{" "}
          <span className="text-foreground">{"{#findings}"}</span> …{" "}
          <span className="text-foreground">{"{/findings}"}</span> to repeat it for each finding.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-2">
          <p>
            <span className="text-foreground">{"{title}"}</span> — Finding title
          </p>
          <p>
            <span className="text-foreground">{"{riskLevel}"}</span> — e.g. <em>high</em>
          </p>
          <p>
            <span className="text-foreground">{"{riskLevelLabel}"}</span> — e.g. <em>High</em>
          </p>
          <p>
            <span className="text-foreground">{"{cvssScore}"}</span> — CVSS score
          </p>
          <p>
            <span className="text-foreground">{"{status}"}</span> — e.g. <em>open</em>
          </p>
          <p>
            <span className="text-foreground">{"{statusLabel}"}</span> — e.g. <em>Open</em>
          </p>
          <p>
            <span className="text-foreground">{"{description}"}</span> — Description
          </p>
          <p>
            <span className="text-foreground">{"{remediation}"}</span> — Remediation steps
          </p>
          <p>
            <span className="text-foreground">{"{evidenceText}"}</span> — Evidence list
          </p>
        </div>
      </div>
    </div>
  );
}

export default function TemplatesPage() {
  const [myTemplates, setMyTemplates] = useState<TemplateInfo[]>([]);
  const [loadingMine, setLoadingMine] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [templateDragOver, setTemplateDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [marketplace, setMarketplace] = useState<MarketplaceTemplate[]>([]);
  const [loadingMarket, setLoadingMarket] = useState(true);
  const [copying, setCopying] = useState<string | null>(null);
  const [copied, setCopied] = useState<Set<string>>(new Set());
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/report-template")
      .then((r) => r.json())
      .then((data) => setMyTemplates(Array.isArray(data) ? data : []))
      .catch(() => setMyTemplates([]))
      .finally(() => setLoadingMine(false));

    Promise.all([
      fetch("/api/marketplace/templates").then((r) => r.json()),
      fetch("/api/auth/session").then((r) => r.json()),
    ])
      .then(([marketData, sessionData]) => {
        setMarketplace(Array.isArray(marketData) ? marketData : []);
        setCurrentUserId(sessionData?.user?.id ?? null);
      })
      .catch(() => setMarketplace([]))
      .finally(() => setLoadingMarket(false));
  }, []);

  function handleTemplateDrop(e: React.DragEvent) {
    e.preventDefault();
    setTemplateDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  }

  async function handleUpload(file: File) {
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/settings/report-template", { method: "POST", body: formData });
    setUploading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Upload failed.");
      return;
    }
    const data = await res.json();
    setMyTemplates((prev) => [data, ...prev]);
    toast.success("Template uploaded.");
  }

  async function handleCopy(t: MarketplaceTemplate) {
    setCopying(t.id);
    const res = await fetch(`/api/marketplace/templates/${t.id}/copy`, { method: "POST" });
    setCopying(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Failed to copy template.");
      return;
    }
    const newTemplate = await res.json();
    setCopied((prev) => new Set(prev).add(t.id));
    setMyTemplates((prev) => [newTemplate, ...prev]);
    setMarketplace((prev) =>
      prev.map((m) => (m.id === t.id ? { ...m, downloadCount: m.downloadCount + 1 } : m))
    );
    toast.success(`"${t.name}" added to your library.`);
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center border-b border-border h-12 px-5 bg-background">
        <h1 className="text-sm font-medium text-foreground">Templates</h1>
      </header>

      <div className="flex-1 overflow-auto p-5 space-y-8 max-w-3xl">
        {/* My library */}
        <section
          className="space-y-4"
          onDragOver={(e) => {
            e.preventDefault();
            setTemplateDragOver(true);
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            setTemplateDragOver(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setTemplateDragOver(false);
            }
          }}
          onDrop={handleTemplateDrop}
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">My templates</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Upload .docx files below, then select a template when exporting a project.
              </p>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                  e.target.value = "";
                }}
              />
              <Button
                size="sm"
                variant={templateDragOver ? "default" : "outline"}
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer disabled:cursor-default transition-all"
              >
                <IconUpload size={13} />
                {uploading ? "Uploading…" : templateDragOver ? "Drop to upload" : "Upload template"}
              </Button>
            </div>
          </div>

          <TagReference />

          {loadingMine ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : myTemplates.length === 0 ? (
            <div
              className={`border border-dashed rounded-lg px-4 py-8 text-center text-xs text-muted-foreground cursor-pointer transition-colors ${templateDragOver ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-border/60"}`}
              onClick={() => fileInputRef.current?.click()}
            >
              {templateDragOver
                ? "Drop .docx to upload"
                : "No templates yet. Click or drop a .docx file to upload, or copy one from the marketplace below."}
            </div>
          ) : (
            <div className="space-y-2">
              {myTemplates.map((t) => (
                <TemplateRow
                  key={t.id}
                  template={t}
                  onDelete={(id) => setMyTemplates((prev) => prev.filter((x) => x.id !== id))}
                  onUpdate={(id, patch) =>
                    setMyTemplates((prev) =>
                      prev.map((x) => (x.id === id ? { ...x, ...patch } : x))
                    )
                  }
                />
              ))}
            </div>
          )}
        </section>

        <div className="border-t border-border" />

        {/* Marketplace */}
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Community marketplace</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Templates published by other users. Copy one to add it to your library.
            </p>
          </div>

          {loadingMarket ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <IconLoader2 size={14} className="animate-spin" />
              Loading…
            </div>
          ) : marketplace.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No templates published yet. Be the first — toggle &quot;Public&quot; on one of your
              templates above.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {marketplace.map((t) => {
                const isOwn = t.userId === currentUserId;
                const isCopied = copied.has(t.id);
                return (
                  <div
                    key={t.id}
                    className="border border-border rounded-lg p-4 space-y-3 flex flex-col"
                  >
                    <div className="flex-1 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium leading-tight">{t.name}</p>
                        <div className="flex gap-1 shrink-0 flex-wrap justify-end">
                          {t.version && (
                            <span className="text-[10px] font-mono bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                              {t.version}
                            </span>
                          )}
                          {t.language && (
                            <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                              {t.language}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">by {t.authorName}</p>
                      {t.description && (
                        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                          {t.description}
                        </p>
                      )}
                      {t.publishNotes && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">
                          {t.publishNotes}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <IconDownload size={11} />
                        {t.downloadCount}
                      </span>
                      {isOwn ? (
                        <span className="text-xs text-muted-foreground italic">Your template</span>
                      ) : isCopied ? (
                        <span className="text-xs text-muted-foreground">Added to library</span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={copying === t.id}
                          onClick={() => handleCopy(t)}
                          className="cursor-pointer disabled:cursor-default"
                        >
                          {copying === t.id && <IconLoader2 size={12} className="animate-spin" />}
                          Use this template
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
