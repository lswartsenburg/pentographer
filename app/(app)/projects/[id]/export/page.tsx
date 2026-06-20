"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { IconDownload } from "@tabler/icons-react";

interface TemplateOption {
  id: string;
  name: string;
}

export default function ExportPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [loading, setLoading] = useState<"docx" | "pdf" | null>(null);
  const [error, setError] = useState("");
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  useEffect(() => {
    fetch("/api/settings/report-template")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setTemplates(data);
      })
      .catch(() => {});
  }, []);

  async function handleExport(format: "docx" | "pdf") {
    setError("");
    setLoading(format);

    const body: Record<string, unknown> = { format };
    if (format === "docx" && selectedTemplateId) {
      body.templateId = selectedTemplateId;
    }

    const res = await fetch(`/api/projects/${projectId}/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setLoading(null);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Export failed. Please try again.");
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ??
      `report.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-2 border-b border-border h-12 px-5 bg-background">
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/projects" className="hover:text-foreground">
            Projects
          </Link>
          <span>/</span>
          <Link href={`/projects/${projectId}`} className="hover:text-foreground">
            Project
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">Export</span>
        </nav>
      </header>

      <div className="flex-1 p-5">
        <div className="max-w-sm space-y-4">
          <h2 className="text-sm font-medium text-foreground">Download report</h2>
          <p className="text-xs text-muted-foreground">
            Generates a report including the executive summary, scope, risk summary, and all
            findings sorted by severity.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="border border-border rounded-lg p-4 space-y-3">
              <div className="space-y-2">
                <div>
                  <p className="text-sm font-medium">Word document</p>
                  <p className="text-xs text-muted-foreground mt-0.5">.docx format</p>
                </div>

                {templates.length > 0 ? (
                  <div className="space-y-1">
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => setSelectedTemplateId(e.target.value)}
                      className="w-full h-8 px-2 rounded-md border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
                    >
                      <option value="">Default layout</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">
                      {selectedTemplate
                        ? `Using: ${selectedTemplate.name}`
                        : "Using default layout"}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    <Link href="/templates" className="underline hover:text-foreground">
                      Upload a template
                    </Link>{" "}
                    to customise output.
                  </p>
                )}
              </div>

              <Button
                size="sm"
                className="w-full"
                onClick={() => handleExport("docx")}
                disabled={loading !== null}
              >
                <IconDownload size={14} />
                {loading === "docx" ? "Generating…" : "Download .docx"}
              </Button>
            </div>

            <div className="border border-border rounded-lg p-4 space-y-3">
              <div>
                <p className="text-sm font-medium">PDF</p>
                <p className="text-xs text-muted-foreground mt-0.5">.pdf format</p>
              </div>
              <Button
                size="sm"
                className="w-full"
                onClick={() => handleExport("pdf")}
                disabled={loading !== null}
              >
                <IconDownload size={14} />
                {loading === "pdf" ? "Generating…" : "Download .pdf"}
              </Button>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </div>
    </div>
  );
}
