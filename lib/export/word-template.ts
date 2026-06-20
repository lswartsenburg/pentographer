import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

export class TemplateRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateRenderError";
  }
}

type RiskLevel = "high" | "medium" | "low" | "informational";

interface ExportFinding {
  title: string;
  riskLevel: RiskLevel;
  cvssScore: string | null;
  status: string;
  description: string | null;
  remediation: string | null;
  evidenceUrls: Array<{ key: string; url: string }>;
}

interface ExportData {
  projectName: string;
  customerName: string;
  scope: string | null;
  startDate: string | null;
  endDate: string | null;
  execSummary: string | null;
  findings: ExportFinding[];
}

const RISK_ORDER: RiskLevel[] = ["high", "medium", "low", "informational"];

function stripMarkdown(md: string | null): string {
  if (!md) return "";
  return md
    .replace(/#{1,6}\s/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*+]\s/gm, "• ")
    .trim();
}

function riskLevelLabel(r: RiskLevel): string {
  return r.charAt(0).toUpperCase() + r.slice(1);
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function generateDocxFromTemplate(templateBuffer: Buffer, data: ExportData): Buffer {
  const sortedFindings = [...data.findings].sort(
    (a, b) => RISK_ORDER.indexOf(a.riskLevel) - RISK_ORDER.indexOf(b.riskLevel)
  );

  const highCount = data.findings.filter((f) => f.riskLevel === "high").length;
  const mediumCount = data.findings.filter((f) => f.riskLevel === "medium").length;
  const lowCount = data.findings.filter((f) => f.riskLevel === "low").length;
  const infoCount = data.findings.filter((f) => f.riskLevel === "informational").length;

  const templateData = {
    projectName: data.projectName,
    customerName: data.customerName,
    scope: data.scope ?? "",
    execSummary: stripMarkdown(data.execSummary),
    exportDate: new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }),
    totalFindings: data.findings.length,
    highCount,
    mediumCount,
    lowCount,
    infoCount,
    findings: sortedFindings.map((f) => ({
      title: f.title,
      riskLevel: f.riskLevel,
      riskLevelLabel: riskLevelLabel(f.riskLevel),
      cvssScore: f.cvssScore ?? "N/A",
      status: f.status,
      statusLabel: statusLabel(f.status),
      description: stripMarkdown(f.description),
      remediation: stripMarkdown(f.remediation),
      evidenceText: f.evidenceUrls.map(({ key, url }) => `[${key}] ${url}`).join("\n"),
    })),
  };

  const zip = new PizZip(templateBuffer);

  let doc: Docxtemplater;
  try {
    doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });
    doc.render(templateData);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Template rendering failed";
    throw new TemplateRenderError(message);
  }

  const output = doc.getZip().generate({ type: "nodebuffer" });
  return Buffer.from(output);
}
