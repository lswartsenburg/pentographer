"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { IconDownload } from "@tabler/icons-react";

export default function ExportPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [loading, setLoading] = useState<"docx" | "pdf" | null>(null);
  const [error, setError] = useState("");

  async function handleExport(format: "docx" | "pdf") {
    setError("");
    setLoading(format);

    const res = await fetch(`/api/projects/${projectId}/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format }),
    });

    setLoading(null);

    if (!res.ok) {
      setError("Export failed. Please try again.");
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
              <div>
                <p className="text-sm font-medium">Word document</p>
                <p className="text-xs text-muted-foreground mt-0.5">.docx format</p>
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
