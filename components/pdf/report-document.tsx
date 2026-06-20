import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";

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

interface ReportDocumentProps {
  projectName: string;
  customerName: string;
  scope: string | null;
  execSummary: string | null;
  findings: ExportFinding[];
}

const RISK_ORDER: RiskLevel[] = ["high", "medium", "low", "informational"];

const riskColors: Record<RiskLevel, string> = {
  high: "#A32D2D",
  medium: "#633806",
  low: "#27500A",
  informational: "#555555",
};

const riskBg: Record<RiskLevel, string> = {
  high: "#FCEBEB",
  medium: "#FAEEDA",
  low: "#EAF3DE",
  informational: "#F5F5F5",
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1A1A1A",
    padding: 48,
    lineHeight: 1.5,
  },
  title: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
    color: "#185FA5",
  },
  subtitle: {
    fontSize: 12,
    color: "#666",
    marginBottom: 24,
  },
  h1: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    marginTop: 20,
    marginBottom: 8,
    color: "#185FA5",
  },
  h2: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginTop: 16,
    marginBottom: 4,
    color: "#0C447C",
  },
  h3: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginTop: 10,
    marginBottom: 3,
  },
  body: {
    fontSize: 10,
    marginBottom: 6,
  },
  riskBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 4,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    marginRight: 8,
  },
  riskRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  summaryTable: {
    flexDirection: "row",
    marginBottom: 16,
  },
  summaryCell: {
    flex: 1,
    alignItems: "center",
    padding: 8,
    borderRadius: 4,
    marginRight: 4,
  },
  summaryCellValue: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
  },
  summaryCellLabel: {
    fontSize: 8,
  },
  divider: {
    borderBottomWidth: 0.5,
    borderBottomColor: "#DDD",
    marginVertical: 12,
  },
  bullet: {
    flexDirection: "row",
    marginBottom: 3,
  },
  bulletDot: {
    width: 12,
    fontSize: 10,
  },
  bulletText: {
    flex: 1,
    fontSize: 10,
  },
  infoBox: {
    backgroundColor: "#F5F5F5",
    padding: 12,
    borderRadius: 4,
    marginBottom: 12,
  },
});

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

export function ReportDocument({
  projectName,
  customerName,
  scope,
  execSummary,
  findings,
}: ReportDocumentProps) {
  const sortedFindings = [...findings].sort(
    (a, b) => RISK_ORDER.indexOf(a.riskLevel) - RISK_ORDER.indexOf(b.riskLevel)
  );

  const highCount = findings.filter((f) => f.riskLevel === "high").length;
  const medCount = findings.filter((f) => f.riskLevel === "medium").length;
  const lowCount = findings.filter((f) => f.riskLevel === "low").length;
  const infoCount = findings.filter((f) => f.riskLevel === "informational").length;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Cover */}
        <Text style={styles.title}>{projectName}</Text>
        <Text style={styles.subtitle}>{customerName}</Text>

        <View style={styles.infoBox}>
          <Text style={{ fontSize: 9, color: "#555" }}>
            CONFIDENTIAL — This report contains sensitive security findings. Distribution is
            restricted to intended recipients only.
          </Text>
        </View>

        {scope && (
          <>
            <Text style={styles.h1}>Scope</Text>
            <Text style={styles.body}>{scope}</Text>
          </>
        )}

        {/* Executive summary */}
        {execSummary && (
          <>
            <Text style={styles.h1}>Executive Summary</Text>
            <Text style={styles.body}>{stripMarkdown(execSummary)}</Text>
          </>
        )}

        {/* Risk summary */}
        <Text style={styles.h1}>Risk Summary</Text>
        <View style={styles.summaryTable}>
          {(["high", "medium", "low", "informational"] as RiskLevel[]).map((r) => {
            const counts = {
              high: highCount,
              medium: medCount,
              low: lowCount,
              informational: infoCount,
            };
            return (
              <View key={r} style={[styles.summaryCell, { backgroundColor: riskBg[r] }]}>
                <Text style={[styles.summaryCellValue, { color: riskColors[r] }]}>{counts[r]}</Text>
                <Text style={[styles.summaryCellLabel, { color: riskColors[r] }]}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={styles.divider} />

        {/* Findings */}
        <Text style={styles.h1}>Findings</Text>

        {sortedFindings.map((f) => (
          <View key={f.title} wrap={false}>
            <Text style={styles.h2}>{f.title}</Text>
            <View style={styles.riskRow}>
              <View style={[styles.riskBadge, { backgroundColor: riskBg[f.riskLevel] }]}>
                <Text style={{ color: riskColors[f.riskLevel] }}>
                  {f.riskLevel.charAt(0).toUpperCase() + f.riskLevel.slice(1)}
                </Text>
              </View>
              {f.cvssScore && (
                <Text style={{ fontSize: 9, color: "#555", marginRight: 8 }}>
                  CVSS {f.cvssScore}
                </Text>
              )}
              <Text style={{ fontSize: 9, color: "#555" }}>{f.status}</Text>
            </View>

            {f.description && (
              <>
                <Text style={styles.h3}>Description</Text>
                <Text style={styles.body}>{stripMarkdown(f.description)}</Text>
              </>
            )}

            {f.remediation && (
              <>
                <Text style={styles.h3}>Remediation</Text>
                <Text style={styles.body}>{stripMarkdown(f.remediation)}</Text>
              </>
            )}

            {f.evidenceUrls.length > 0 && (
              <>
                <Text style={styles.h3}>Evidence</Text>
                {f.evidenceUrls.map(({ key, url }) => (
                  <View key={url} style={styles.bullet}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bulletText}>[{key}] {url}</Text>
                  </View>
                ))}
              </>
            )}

            <View style={styles.divider} />
          </View>
        ))}
      </Page>
    </Document>
  );
}
