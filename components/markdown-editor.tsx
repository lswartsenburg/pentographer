"use client";

import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import "@uiw/react-md-editor/markdown-editor.css";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

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
  const { resolvedTheme } = useTheme();
  const colorMode = resolvedTheme === "dark" ? "dark" : "light";

  return (
    <MDEditor
      value={value}
      onChange={(v) => onChange(v ?? "")}
      height={rows * 24}
      preview="live"
      data-color-mode={colorMode}
      textareaProps={{ disabled, placeholder }}
    />
  );
}
