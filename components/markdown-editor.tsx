"use client";

import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder = "Write in Markdown…",
  rows = 12,
  disabled = false,
}: MarkdownEditorProps) {
  const preview = useMemo(() => {
    if (!value) return "";
    const raw = marked.parse(value, { async: false }) as string;
    if (typeof window !== "undefined") {
      return DOMPurify.sanitize(raw);
    }
    return raw;
  }, [value]);

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Markdown</p>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          className="w-full resize-y rounded-md border border-border bg-muted/30 px-3 py-2.5 text-xs font-mono text-foreground leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>
      <div className="space-y-1">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Preview</p>
        <div
          className="min-h-[calc(theme(spacing.6)_*_12)] rounded-md border border-border bg-background px-3 py-2.5 text-xs text-foreground leading-relaxed prose prose-sm max-w-none overflow-auto"
          dangerouslySetInnerHTML={{ __html: preview }}
        />
      </div>
    </div>
  );
}
