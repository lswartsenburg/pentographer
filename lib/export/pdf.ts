import { renderToBuffer } from "@react-pdf/renderer";
import { createElement, type ComponentType } from "react";
import { ReportDocument } from "@/components/pdf/report-document";

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
  execSummary: string | null;
  findings: ExportFinding[];
}

export async function generatePdf(data: ExportData): Promise<Buffer> {
  // @react-pdf/renderer's renderToBuffer expects a Document element; cast through unknown
  const element = createElement(
    ReportDocument as ComponentType<ExportData>,
    data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;

  const buffer = await renderToBuffer(element);
  return Buffer.from(buffer);
}
