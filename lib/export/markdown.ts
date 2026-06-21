import JSZip from "jszip";
import path from "path";
import type { ExportData } from "./word-template";
import { getStorage } from "@/lib/storage";

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

const RISK_LABELS: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  informational: "Informational",
};

const RISK_ORDER = ["high", "medium", "low", "informational"];

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export async function generateMarkdownZip(data: ExportData): Promise<Buffer> {
  const zip = new JSZip();
  const imagesFolder = zip.folder("images")!;

  // Collect all evidence images up front so we can reference them in markdown
  // Map: findingIndex → array of { filename, buffer } | null (null = not an image or fetch failed)
  type ImageEntry = { filename: string; buffer: Buffer } | null;
  const evidenceByFinding: ImageEntry[][] = await Promise.all(
    data.findings.map(async (finding, fi) => {
      return Promise.all(
        finding.evidenceUrls.map(async ({ key, url }, ei) => {
          try {
            const { body, contentType } = await getStorage().get(url);
            if (!IMAGE_MIME_TYPES.has(contentType)) return null;
            const ext = IMAGE_EXTENSIONS[contentType] ?? "bin";
            const safeName = key.replace(/[^a-z0-9_\-\.]/gi, "_").slice(0, 60);
            const filename = `finding-${fi + 1}-${ei + 1}-${safeName}.${ext}`;
            return { filename, buffer: body };
          } catch {
            return null;
          }
        })
      );
    })
  );

  // Add image files to zip
  for (const entries of evidenceByFinding) {
    for (const entry of entries) {
      if (entry) {
        imagesFolder.file(entry.filename, entry.buffer);
      }
    }
  }

  // Build markdown document
  const lines: string[] = [];

  lines.push(`# ${data.projectName} — Penetration Test Report`);
  lines.push("");

  // Metadata table
  const meta: [string, string][] = (
    [
      ["Customer", data.customerName],
      ["Organization", data.organizationName ?? ""],
      ["Version", data.reportVersion ?? ""],
      ["Application URL", data.applicationUrl ?? ""],
      ["Scope", data.scope ?? ""],
      ["Date", formatDate(data.startDate)],
      ["Report date", data.endDate ? formatDate(data.endDate) : formatDate(data.startDate)],
    ] as [string, string][]
  ).filter(([, v]) => v.trim() !== "");

  if (meta.length) {
    lines.push("| Field | Value |");
    lines.push("|---|---|");
    for (const [k, v] of meta) {
      lines.push(`| ${k} | ${v} |`);
    }
    lines.push("");
  }

  // Test accounts
  if (data.testAccounts && data.testAccounts.length > 0) {
    lines.push("## Test Accounts");
    lines.push("");
    const hasPasswords = data.testAccounts.some((a) => a.password);
    if (hasPasswords) {
      lines.push("| Role | Username | Password |");
      lines.push("|---|---|---|");
      for (const acc of data.testAccounts) {
        lines.push(`| ${acc.role} | ${acc.username} | ${acc.password ?? ""} |`);
      }
    } else {
      lines.push("| Role | Username |");
      lines.push("|---|---|");
      for (const acc of data.testAccounts) {
        lines.push(`| ${acc.role} | ${acc.username} |`);
      }
    }
    lines.push("");
  }

  // Executive summary — strip a leading heading line if the content already has one
  if (data.execSummary?.trim()) {
    const execContent = data.execSummary
      .trim()
      .replace(/^#{1,6}\s+.*\n?/, "")
      .trim();
    lines.push("## Executive Summary");
    lines.push("");
    if (execContent) lines.push(execContent);
    lines.push("");
  }

  // Risk summary
  const riskCounts = { high: 0, medium: 0, low: 0, informational: 0 };
  for (const f of data.findings) {
    if (f.riskLevel in riskCounts) riskCounts[f.riskLevel as keyof typeof riskCounts]++;
  }
  lines.push("## Risk Summary");
  lines.push("");
  lines.push("| Risk Level | Count |");
  lines.push("|---|---|");
  lines.push(`| High | ${riskCounts.high} |`);
  lines.push(`| Medium | ${riskCounts.medium} |`);
  lines.push(`| Low | ${riskCounts.low} |`);
  lines.push(`| Informational | ${riskCounts.informational} |`);
  lines.push("");

  // Findings
  if (data.findings.length > 0) {
    lines.push("## Findings");
    lines.push("");

    const sorted = [...data.findings].sort(
      (a, b) => RISK_ORDER.indexOf(a.riskLevel) - RISK_ORDER.indexOf(b.riskLevel)
    );

    for (const [i, finding] of sorted.entries()) {
      lines.push(`### ${i + 1}. ${finding.title}`);
      lines.push("");
      lines.push(`**Risk level:** ${RISK_LABELS[finding.riskLevel] ?? finding.riskLevel}`);
      if (finding.cvssScore) lines.push(`  **CVSS score:** ${finding.cvssScore}`);
      lines.push("");

      if (finding.description?.trim()) {
        lines.push("#### Description");
        lines.push("");
        lines.push(finding.description.trim());
        lines.push("");
      }

      if (finding.remediation?.trim()) {
        lines.push("#### Remediation");
        lines.push("");
        lines.push(finding.remediation.trim());
        lines.push("");
      }

      // Evidence images — find original index in data.findings to look up evidenceByFinding
      const origIndex = data.findings.indexOf(finding);
      const images = evidenceByFinding[origIndex] ?? [];
      const imageEntries = images.filter((e): e is NonNullable<typeof e> => e !== null);
      if (imageEntries.length > 0) {
        lines.push("#### Evidence");
        lines.push("");
        for (const img of imageEntries) {
          const caption = path
            .basename(img.filename, path.extname(img.filename))
            .replace(/-/g, " ");
          lines.push(`![${caption}](images/${img.filename})`);
          lines.push("");
        }
      }

      lines.push("---");
      lines.push("");
    }
  }

  zip.file("report.md", lines.join("\n"));

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return buffer;
}
