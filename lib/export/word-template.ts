import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ImageModule = require("docxtemplater-image-module-free");

export class TemplateRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateRenderError";
  }
}

type RiskLevel = "high" | "medium" | "low" | "informational";

interface EvidenceImageItem {
  image: Buffer;
  caption: string;
}

interface ExportFinding {
  title: string;
  riskLevel: RiskLevel;
  cvssScore: string | null;
  status: string;
  description: string | null;
  remediation: string | null;
  evidenceUrls: Array<{ key: string; url: string }>;
  evidenceImages?: EvidenceImageItem[];
}

interface TestAccount {
  role: string;
  username: string;
  password?: string;
}

export interface ExportData {
  projectName: string;
  customerName: string;
  scope: string | null;
  applicationUrl: string | null;
  reportVersion: string | null;
  testAccounts: TestAccount[] | null;
  organizationName: string | null;
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

  const now = new Date();

  const templateData = {
    projectName: data.projectName,
    customerName: data.customerName,
    organizationName: data.organizationName ?? "",
    scope: data.scope ?? "",
    applicationUrl: data.applicationUrl ?? "",
    reportVersion: data.reportVersion ?? "1.0",
    testAccounts: data.testAccounts ?? [],
    execSummary: stripMarkdown(data.execSummary),
    exportDate: now.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }),
    monthYear: now.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
    totalFindings: data.findings.length,
    highCount,
    mediumCount,
    lowCount,
    infoCount,
    findings: sortedFindings.map((f, idx) => ({
      number: idx + 1,
      title: f.title,
      riskLevel: f.riskLevel,
      riskLevelLabel: riskLevelLabel(f.riskLevel),
      cvssScore: f.cvssScore ?? "N/A",
      status: f.status,
      statusLabel: statusLabel(f.status),
      description: stripMarkdown(f.description),
      remediation: stripMarkdown(f.remediation),
      evidenceText: f.evidenceUrls.map(({ key, url }) => `[${key}] ${url}`).join("\n"),
      evidenceImages: f.evidenceImages ?? [],
    })),
  };

  const imageModule = new ImageModule({
    centered: false,
    fileType: "docx",
    getImage(tagValue: unknown) {
      if (Buffer.isBuffer(tagValue)) return tagValue;
      return null;
    },
    getSize(_img: unknown, tagValue: unknown) {
      return tagValue ? [600, 450] : [0, 0];
    },
  });

  const zip = new PizZip(templateBuffer);

  let doc: Docxtemplater;
  try {
    doc = new Docxtemplater(zip, {
      modules: [imageModule],
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
