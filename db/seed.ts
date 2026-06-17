import { db } from "./client";
import { playbook, playbookVersion, playbookCategory, playbookItem } from "./schema";

const OWASP_2021: Array<{
  name: string;
  frameworkRef: string;
  items: Array<{
    name: string;
    description: string;
    defaultRemediation: string;
    defaultRisk: "high" | "medium" | "low" | "informational";
  }>;
}> = [
  {
    name: "A01 Broken Access Control",
    frameworkRef: "A01:2021",
    items: [
      {
        name: "Unauthorized Data Read (IDOR)",
        description:
          "Test whether authenticated users can access data belonging to other users by manipulating object references (IDs, GUIDs) in requests. Try accessing /api/users/{other_id}, /api/orders/{other_order}, etc.",
        defaultRemediation:
          "Implement server-side ownership checks on every resource access. Use indirect object references or enforce that the authenticated user owns the requested resource before returning data.",
        defaultRisk: "high",
      },
      {
        name: "Unauthorized Data Write / Privilege Escalation",
        description:
          "Test whether authenticated users can modify data or perform actions reserved for higher-privilege roles. Try PATCH/DELETE on other users' records or adding admin parameters to requests.",
        defaultRemediation:
          "Deny by default and explicitly grant permissions. Verify the user's role and ownership on every mutation. Never rely on client-supplied role fields.",
        defaultRisk: "high",
      },
      {
        name: "Missing Function-Level Access Control",
        description:
          "Test whether admin or privileged endpoints are accessible to lower-privileged users. Try accessing /admin, /api/admin/*, /internal/* while authenticated as a regular user.",
        defaultRemediation:
          "Enforce role-based access control (RBAC) at the framework or middleware layer on every route. Fail securely — deny by default.",
        defaultRisk: "high",
      },
      {
        name: "Directory Listing / Path Traversal",
        description:
          "Test whether the web server exposes directory listings or allows path traversal via ../../ sequences in file download endpoints.",
        defaultRemediation:
          "Disable directory listings on the web server. Validate and canonicalize file paths server-side. Restrict file access to a whitelisted directory.",
        defaultRisk: "medium",
      },
    ],
  },
  {
    name: "A02 Cryptographic Failures",
    frameworkRef: "A02:2021",
    items: [
      {
        name: "Sensitive Data Transmitted Without TLS",
        description:
          "Check whether sensitive data (credentials, PII, tokens) is transmitted over HTTP instead of HTTPS. Test using a network proxy and check for mixed-content warnings.",
        defaultRemediation:
          "Enforce HTTPS site-wide. Use HSTS with a long max-age. Redirect all HTTP traffic to HTTPS. Ensure API endpoints are not exposed over plain HTTP.",
        defaultRisk: "high",
      },
      {
        name: "Weak or Outdated TLS Configuration",
        description:
          "Test TLS configuration for support of SSLv2, SSLv3, TLS 1.0, TLS 1.1, or weak cipher suites (RC4, DES, 3DES, EXPORT ciphers). Use tools like testssl.sh or SSL Labs.",
        defaultRemediation:
          "Support only TLS 1.2 and TLS 1.3. Disable weak cipher suites. Use forward-secret key exchange algorithms. Rotate certificates before expiry.",
        defaultRisk: "medium",
      },
      {
        name: "Weak Password Hashing",
        description:
          "Verify that passwords are stored using a strong adaptive hashing algorithm (bcrypt, scrypt, Argon2). Check for MD5, SHA-1, SHA-256 without salting, or plaintext storage.",
        defaultRemediation:
          "Use bcrypt (cost ≥ 12), scrypt, or Argon2id for password hashing. Never store plaintext passwords or reversible encryption.",
        defaultRisk: "high",
      },
      {
        name: "Sensitive Data Exposed in Logs or Error Responses",
        description:
          "Review error responses and server logs for plaintext passwords, API keys, session tokens, PII, or internal stack traces exposed to the client.",
        defaultRemediation:
          "Sanitize error messages returned to clients. Log sensitive fields as redacted. Use structured logging with explicit field allowlists.",
        defaultRisk: "medium",
      },
    ],
  },
  {
    name: "A03 Injection",
    frameworkRef: "A03:2021",
    items: [
      {
        name: "SQL Injection",
        description:
          "Test all user-controllable inputs (form fields, URL parameters, headers, cookies) for SQL injection. Use payloads such as ' OR 1=1--, UNION SELECT, and time-based blind payloads. Use sqlmap for automated scanning.",
        defaultRemediation:
          "Use parameterized queries (prepared statements) for all database access. Never interpolate user input into SQL strings. Apply the principle of least privilege to database accounts.",
        defaultRisk: "high",
      },
      {
        name: "Stored Cross-Site Scripting (XSS)",
        description:
          "Test user-supplied content that is stored and later rendered to other users (comments, profile fields, message bodies) for XSS payloads. Check that output is properly HTML-encoded.",
        defaultRemediation:
          "HTML-encode all user-supplied content on output. Implement a Content Security Policy (CSP). Use a context-aware templating engine that escapes by default.",
        defaultRisk: "high",
      },
      {
        name: "Reflected Cross-Site Scripting (XSS)",
        description:
          "Test URL parameters and form inputs that are immediately reflected in the response for XSS. Check error messages, search results, and redirect parameters.",
        defaultRemediation:
          "HTML-encode reflected input in server responses. Implement CSP. Validate and sanitize all reflected input server-side.",
        defaultRisk: "high",
      },
      {
        name: "OS Command Injection",
        description:
          "Test inputs used to construct OS commands (file operations, ping utilities, etc.) for shell metacharacter injection (;, |, &&, $(), backtick).",
        defaultRemediation:
          "Avoid OS command construction from user input. Use language-native APIs instead of shell commands. If unavoidable, use allowlists and escape shell arguments properly.",
        defaultRisk: "high",
      },
      {
        name: "Server-Side Template Injection (SSTI)",
        description:
          "Test user-controlled input rendered in server-side templates for template injection ({{7*7}}, ${7*7}, #{7*7}). Vulnerable when the response reflects a computed value.",
        defaultRemediation:
          "Do not pass user input directly into template rendering. Use a sandboxed template engine or pre-compile templates without user data. Validate and sanitize template context variables.",
        defaultRisk: "high",
      },
    ],
  },
  {
    name: "A04 Insecure Design",
    frameworkRef: "A04:2021",
    items: [
      {
        name: "Missing Rate Limiting on Sensitive Endpoints",
        description:
          "Test whether login, registration, password reset, and OTP endpoints enforce rate limiting. Attempt credential stuffing or enumeration attacks to verify controls.",
        defaultRemediation:
          "Implement rate limiting and account lockout on authentication endpoints. Use CAPTCHA for high-risk flows. Monitor for and alert on anomalous request patterns.",
        defaultRisk: "medium",
      },
      {
        name: "Insecure Password Reset Mechanism",
        description:
          "Test the password reset flow for predictable tokens, token reuse, missing expiry, and lack of account lockout. Verify tokens are invalidated after use.",
        defaultRemediation:
          "Use cryptographically random, single-use reset tokens with a short expiry (≤ 1 hour). Send tokens to the registered email only. Invalidate on use and after expiry.",
        defaultRisk: "high",
      },
      {
        name: "Business Logic Flaws",
        description:
          "Review the application's business logic for scenarios that allow unintended outcomes: purchasing items at negative prices, skipping required workflow steps, applying discounts multiple times.",
        defaultRemediation:
          "Define and enforce business rules server-side. Validate all state transitions against the expected workflow. Add integration tests for boundary conditions.",
        defaultRisk: "medium",
      },
    ],
  },
  {
    name: "A05 Security Misconfiguration",
    frameworkRef: "A05:2021",
    items: [
      {
        name: "Default Credentials in Use",
        description:
          "Test for default or well-known credentials on admin panels, database interfaces, cloud management consoles, and third-party components (admin/admin, admin/password, etc.).",
        defaultRemediation:
          "Change all default credentials before deployment. Disable or remove default accounts that are not needed. Enforce strong passwords on all service accounts.",
        defaultRisk: "high",
      },
      {
        name: "Verbose Error Messages / Stack Traces Exposed",
        description:
          "Trigger errors (404, 500) and verify that detailed stack traces, database query errors, or internal paths are not exposed to the end user.",
        defaultRemediation:
          "Configure production error handling to show generic messages to users. Log detailed errors server-side only. Disable debug mode in production.",
        defaultRisk: "medium",
      },
      {
        name: "Missing Security Headers",
        description:
          "Inspect HTTP response headers for missing security headers: Content-Security-Policy, Strict-Transport-Security, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.",
        defaultRemediation:
          "Configure the web server or application to set all recommended security headers on every response. Use a CSP header scanner to validate policy coverage.",
        defaultRisk: "low",
      },
      {
        name: "Unnecessary Features / Services Exposed",
        description:
          "Check for exposed admin interfaces, debug endpoints, test pages, sample applications, or management APIs that should not be accessible in production.",
        defaultRemediation:
          "Disable or remove all unnecessary features, services, and sample code before deployment. Restrict management interfaces to trusted IP ranges.",
        defaultRisk: "medium",
      },
    ],
  },
  {
    name: "A06 Vulnerable and Outdated Components",
    frameworkRef: "A06:2021",
    items: [
      {
        name: "Outdated Dependencies with Known CVEs",
        description:
          "Check application dependencies (package.json, pom.xml, Gemfile, requirements.txt) against known vulnerability databases (Snyk, OWASP Dependency-Check, npm audit). Identify packages with published CVEs.",
        defaultRemediation:
          "Update affected packages to patched versions. Remove unused dependencies. Integrate automated dependency scanning into the CI/CD pipeline (e.g. Dependabot, Snyk).",
        defaultRisk: "medium",
      },
      {
        name: "Use of Deprecated or Insecure Library Functions",
        description:
          "Review code for use of deprecated cryptographic functions, insecure randomness sources, or unmaintained libraries with no available security patches.",
        defaultRemediation:
          "Replace deprecated functions with modern equivalents. Evaluate unmaintained libraries for replacement. Track library maintenance status as part of dependency management.",
        defaultRisk: "medium",
      },
    ],
  },
  {
    name: "A07 Identification and Authentication Failures",
    frameworkRef: "A07:2021",
    items: [
      {
        name: "Brute-Force Attack on Authentication",
        description:
          "Test whether the login endpoint allows unlimited password attempts without lockout or rate limiting. Use Hydra, Burp Intruder, or manual repeated attempts.",
        defaultRemediation:
          "Implement account lockout after N failed attempts (with configurable threshold). Apply rate limiting at the IP level. Consider CAPTCHA after a threshold of failures.",
        defaultRisk: "high",
      },
      {
        name: "Session Token Not Invalidated on Logout",
        description:
          "Log out of the application, then replay the captured session token. If the token is still accepted, the logout is ineffective.",
        defaultRemediation:
          "Invalidate session tokens server-side on logout. For JWT-based sessions, maintain a token revocation list or use short-lived tokens with a refresh mechanism.",
        defaultRisk: "high",
      },
      {
        name: "Weak or Predictable Session Tokens",
        description:
          "Collect multiple session tokens and analyse them for patterns, low entropy, or sequential values. Test whether tokens can be forged or predicted.",
        defaultRemediation:
          "Use a cryptographically secure random number generator for session token generation (≥ 128 bits of entropy). Never derive session identifiers from predictable values.",
        defaultRisk: "high",
      },
      {
        name: "Missing HTTPOnly / Secure Flags on Session Cookie",
        description:
          "Inspect session cookies in browser DevTools or a proxy. Verify that the HttpOnly and Secure flags are set. HttpOnly prevents JavaScript access; Secure ensures HTTPS-only transmission.",
        defaultRemediation:
          "Set HttpOnly=true, Secure=true, and SameSite=Lax (or Strict) on all session cookies. Configure these at the session management framework level.",
        defaultRisk: "medium",
      },
    ],
  },
  {
    name: "A08 Software and Data Integrity Failures",
    frameworkRef: "A08:2021",
    items: [
      {
        name: "Insecure Deserialization",
        description:
          "Test whether the application deserializes untrusted data from user-controlled input (cookies, API parameters, files). Attempt to supply crafted serialized objects to trigger remote code execution or property manipulation.",
        defaultRemediation:
          "Avoid deserializing data from untrusted sources. If deserialization is required, use an allowlist of permitted classes and validate integrity with a digital signature before deserializing.",
        defaultRisk: "high",
      },
      {
        name: "Missing Subresource Integrity (SRI) on CDN Resources",
        description:
          "Check whether externally hosted scripts and stylesheets include the integrity attribute (SRI hash). Without it, a compromised CDN can inject malicious scripts.",
        defaultRemediation:
          "Add integrity and crossorigin attributes to all externally hosted script and link tags. Generate SRI hashes using the SRI Hash Generator at srihash.org.",
        defaultRisk: "medium",
      },
    ],
  },
  {
    name: "A09 Security Logging and Monitoring Failures",
    frameworkRef: "A09:2021",
    items: [
      {
        name: "Insufficient Logging of Security Events",
        description:
          "Review whether the application logs authentication failures, access control violations, input validation failures, and privileged actions with sufficient detail (timestamp, user, IP, action).",
        defaultRemediation:
          "Log all security-relevant events with structured fields. Include timestamp, user identifier, IP address, action, and outcome. Store logs in a tamper-resistant, centralised log management system.",
        defaultRisk: "medium",
      },
      {
        name: "Log Injection",
        description:
          "Test whether user-supplied input written to log files can inject forged log entries by including newline characters or ANSI escape sequences.",
        defaultRemediation:
          "Sanitize or encode user-supplied values before logging. Use structured logging (JSON) which is inherently injection-resistant. Validate log fields at the logging layer.",
        defaultRisk: "low",
      },
    ],
  },
  {
    name: "A10 Server-Side Request Forgery (SSRF)",
    frameworkRef: "A10:2021",
    items: [
      {
        name: "SSRF via URL Parameter",
        description:
          "Test URL parameters, webhook configuration fields, or import/fetch features that cause the server to make HTTP requests. Try directing the server to internal IPs (169.254.169.254, 10.0.0.0/8), localhost, and internal services.",
        defaultRemediation:
          "Validate and allowlist permitted URL destinations. Block requests to private IP ranges and metadata endpoints (169.254.169.254). Do not return raw server-side response bodies to the client.",
        defaultRisk: "high",
      },
      {
        name: "SSRF via DNS Rebinding",
        description:
          "Test whether the application is vulnerable to DNS rebinding attacks where an attacker-controlled domain resolves to an internal IP after initial validation.",
        defaultRemediation:
          "Re-validate the resolved IP address at connection time, not only at URL parse time. Pin the resolved IP for the duration of a request. Use an egress firewall to block outbound connections to internal ranges.",
        defaultRisk: "medium",
      },
    ],
  },
];

async function seed() {
  console.log("Seeding OWASP Top 10 v2021 playbook...");

  const [pb] = await db
    .insert(playbook)
    .values({
      userId: null,
      name: "OWASP Top 10 (2021)",
      description:
        "Standard web application security assessment checklist based on the OWASP Top 10 v2021. System-owned — fork to create an editable copy.",
    })
    .returning();

  const [pbVersion] = await db
    .insert(playbookVersion)
    .values({
      playbookId: pb.id,
      version: "1.0",
      changelog: "Initial OWASP Top 10 v2021 playbook.",
      isActive: true,
    })
    .returning();

  for (let catIdx = 0; catIdx < OWASP_2021.length; catIdx++) {
    const cat = OWASP_2021[catIdx];

    const [category] = await db
      .insert(playbookCategory)
      .values({
        playbookVersionId: pbVersion.id,
        name: cat.name,
        frameworkRef: cat.frameworkRef,
        displayOrder: catIdx,
      })
      .returning();

    for (let itemIdx = 0; itemIdx < cat.items.length; itemIdx++) {
      const item = cat.items[itemIdx];
      await db.insert(playbookItem).values({
        categoryId: category.id,
        name: item.name,
        description: item.description,
        defaultRemediation: item.defaultRemediation,
        defaultRisk: item.defaultRisk,
        active: true,
        displayOrder: itemIdx,
      });
    }
  }

  console.log(
    `Seeded: 1 playbook, 1 version, ${OWASP_2021.length} categories, ${OWASP_2021.reduce((acc, c) => acc + c.items.length, 0)} items.`
  );
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
