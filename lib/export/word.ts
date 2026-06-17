import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  Packer,
} from "docx";
import { marked, Tokens } from "marked";

type RiskLevel = "high" | "medium" | "low" | "informational";

interface ExportFinding {
  title: string;
  riskLevel: RiskLevel;
  cvssScore: string | null;
  status: string;
  description: string | null;
  remediation: string | null;
  evidenceUrls: string[];
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

// Convert a marked token tree to docx Paragraph objects
function tokensToParas(tokens: Tokens.Generic[]): Paragraph[] {
  const paras: Paragraph[] = [];

  for (const token of tokens) {
    if (token.type === "heading") {
      const t = token as Tokens.Heading;
      paras.push(
        new Paragraph({
          text: t.text,
          heading: t.depth === 1 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
        })
      );
    } else if (token.type === "paragraph") {
      const t = token as Tokens.Paragraph;
      const runs: TextRun[] = [];
      for (const inline of t.tokens ?? []) {
        if (inline.type === "strong") {
          runs.push(new TextRun({ text: (inline as Tokens.Strong).text, bold: true }));
        } else if (inline.type === "em") {
          runs.push(new TextRun({ text: (inline as Tokens.Em).text, italics: true }));
        } else if (inline.type === "codespan") {
          runs.push(new TextRun({ text: (inline as Tokens.Codespan).text, font: "Courier New", size: 18 }));
        } else if (inline.type === "text") {
          runs.push(new TextRun({ text: (inline as Tokens.Text).text }));
        }
      }
      if (runs.length === 0) {
        runs.push(new TextRun({ text: t.text }));
      }
      paras.push(new Paragraph({ children: runs }));
    } else if (token.type === "list") {
      const t = token as Tokens.List;
      for (const item of t.items) {
        paras.push(
          new Paragraph({
            text: item.text,
            bullet: { level: 0 },
          })
        );
      }
    } else if (token.type === "code") {
      const t = token as Tokens.Code;
      paras.push(
        new Paragraph({
          children: [new TextRun({ text: t.text, font: "Courier New", size: 18 })],
        })
      );
    } else if (token.type === "space") {
      paras.push(new Paragraph({}));
    }
  }

  return paras;
}

function markdownToParas(md: string | null): Paragraph[] {
  if (!md) return [];
  const lexer = new marked.Lexer();
  const tokens = lexer.lex(md);
  return tokensToParas(tokens as Tokens.Generic[]);
}

function riskLabel(r: RiskLevel): string {
  return r.charAt(0).toUpperCase() + r.slice(1);
}

export async function generateDocx(data: ExportData): Promise<Buffer> {
  const sortedFindings = [...data.findings].sort(
    (a, b) => RISK_ORDER.indexOf(a.riskLevel) - RISK_ORDER.indexOf(b.riskLevel)
  );

  const sections: (Paragraph | Table)[] = [];

  // Cover info
  sections.push(
    new Paragraph({ text: data.projectName, heading: HeadingLevel.TITLE }),
    new Paragraph({ text: data.customerName }),
    new Paragraph({})
  );

  if (data.scope) {
    sections.push(
      new Paragraph({ text: "Scope", heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ text: data.scope }),
      new Paragraph({})
    );
  }

  // Confidentiality notice
  sections.push(
    new Paragraph({ text: "Confidentiality Notice", heading: HeadingLevel.HEADING_1 }),
    new Paragraph({
      children: [
        new TextRun({
          text: "This report contains confidential security information. Distribution is restricted to the intended recipients only.",
        }),
      ],
    }),
    new Paragraph({})
  );

  // Executive summary
  if (data.execSummary) {
    sections.push(
      new Paragraph({ text: "Executive Summary", heading: HeadingLevel.HEADING_1 }),
      ...markdownToParas(data.execSummary),
      new Paragraph({})
    );
  }

  // Risk summary table
  const highCount = sortedFindings.filter((f) => f.riskLevel === "high").length;
  const medCount = sortedFindings.filter((f) => f.riskLevel === "medium").length;
  const lowCount = sortedFindings.filter((f) => f.riskLevel === "low").length;
  const infoCount = sortedFindings.filter((f) => f.riskLevel === "informational").length;

  sections.push(
    new Paragraph({ text: "Risk Summary", heading: HeadingLevel.HEADING_1 }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: ["High", "Medium", "Low", "Informational"].map(
            (label) =>
              new TableCell({
                children: [new Paragraph({ text: label, alignment: AlignmentType.CENTER })],
              })
          ),
        }),
        new TableRow({
          children: [highCount, medCount, lowCount, infoCount].map(
            (count) =>
              new TableCell({
                children: [new Paragraph({ text: String(count), alignment: AlignmentType.CENTER })],
              })
          ),
        }),
      ],
    }),
    new Paragraph({})
  );

  // Findings
  sections.push(
    new Paragraph({ text: "Findings", heading: HeadingLevel.HEADING_1 }),
    new Paragraph({})
  );

  for (const f of sortedFindings) {
    sections.push(
      new Paragraph({ text: f.title, heading: HeadingLevel.HEADING_2 }),
      new Paragraph({
        children: [
          new TextRun({ text: "Risk: ", bold: true }),
          new TextRun({ text: riskLabel(f.riskLevel) }),
          ...(f.cvssScore
            ? [
                new TextRun({ text: "   CVSS: ", bold: true }),
                new TextRun({ text: f.cvssScore }),
              ]
            : []),
          new TextRun({ text: "   Status: ", bold: true }),
          new TextRun({ text: f.status }),
        ],
      }),
      new Paragraph({})
    );

    if (f.description) {
      sections.push(
        new Paragraph({ text: "Description", heading: HeadingLevel.HEADING_3 }),
        ...markdownToParas(f.description),
        new Paragraph({})
      );
    }

    if (f.remediation) {
      sections.push(
        new Paragraph({ text: "Remediation", heading: HeadingLevel.HEADING_3 }),
        ...markdownToParas(f.remediation),
        new Paragraph({})
      );
    }

    if (f.evidenceUrls.length > 0) {
      sections.push(
        new Paragraph({ text: "Evidence", heading: HeadingLevel.HEADING_3 }),
        ...f.evidenceUrls.map((url) => new Paragraph({ text: url, bullet: { level: 0 } })),
        new Paragraph({})
      );
    }

    sections.push(new Paragraph({}));
  }

  const doc = new Document({
    sections: [{ children: sections }],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
