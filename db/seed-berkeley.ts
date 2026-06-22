import { db } from "./client";
import { playbook, playbookVersion, playbookCategory, playbookItem } from "./schema";

const CATEGORIES: Array<{
  name: string;
  risk: "high" | "medium" | "low" | "informational";
  items: Array<{
    name: string;
    description: string;
    defaultRemediation: string;
  }>;
}> = [
  {
    name: "High Risk Findings",
    risk: "high",
    items: [
      {
        name: "Unauthorized Data Write",
        description:
          "It is possible to write data without proper authorization checks. Test whether authenticated users can modify data belonging to other users by manipulating object references in requests.",
        defaultRemediation:
          "Before information is read or modified in the database, the application should verify the authenticated user owns or has permission to the requested data read/write.",
      },
      {
        name: "Unauthorized Data Read",
        description:
          "It is possible to read data without proper authorization checks. Test whether authenticated users can access data belonging to other users by manipulating object references in requests.",
        defaultRemediation:
          "Before information is read or modified in the database, the application should verify the authenticated user owns or has permission to the requested data read/write.",
      },
      {
        name: "SQL Injection",
        description:
          "The application is affected by SQL injection issues. SQL injection vulnerabilities arise when user-controllable data is incorporated into database SQL queries in an unsafe manner. An attacker can supply crafted input to break out of the data context in which their input appears and interfere with the structure of the surrounding query.\n\nA wide range of damaging attacks can often be delivered via SQL injection, including reading or modifying critical application data, interfering with application logic, escalating privileges within the database and taking control of the database server.",
        defaultRemediation:
          "The most effective way to prevent SQL injection attacks is to use parameterized queries (also known as prepared statements) for all database access. This method uses two steps to incorporate potentially tainted data into SQL queries: first, the application specifies the structure of the query, leaving placeholders for each item of user input; second, the application specifies the contents of each placeholder.\n\nYou should review the documentation for your database and application platform to determine the appropriate APIs which you can use to perform parameterized queries. It is strongly recommended that you parameterize every variable data item that is incorporated into database queries, even if it is not obviously tainted.",
      },
      {
        name: "Cross-Site Scripting (Reflected)",
        description:
          "Reflected cross-site scripting vulnerabilities arise when data is copied from a request and echoed into the application's immediate response in an unsafe way. An attacker can use the vulnerability to construct a request that, if issued by another application user, will cause JavaScript code supplied by the attacker to execute within the user's browser in the context of that user's session with the application.\n\nThe attacker-supplied code can perform a wide variety of actions, such as stealing the victim's session token or login credentials, performing arbitrary actions on the victim's behalf, and logging their keystrokes.",
        defaultRemediation:
          "In most situations where user-controllable data is copied into application responses, cross-site scripting attacks can be prevented using two layers of defenses:\n\n1. Input should be validated as strictly as possible on arrival, given the kind of content that it is expected to contain. Input which fails the validation should be rejected, not sanitized.\n2. User input should be HTML-encoded at any point where it is copied into application responses. All HTML metacharacters, including < > \" ' and =, should be replaced with the corresponding HTML entities (&lt; &gt; etc).",
      },
      {
        name: "Cross-Site Scripting (Stored)",
        description:
          "Stored cross-site scripting vulnerabilities arise when user input is stored and later embedded into the application's responses in an unsafe way. An attacker can use the vulnerability to inject malicious JavaScript code into the application, which will execute within the browser of any user who views the relevant application content.\n\nStored XSS flaws are typically more serious than reflected vulnerabilities because they do not require a separate delivery mechanism in order to reach target users, and are not hindered by web browsers' XSS filters.",
        defaultRemediation:
          "In most situations where user-controllable data is copied into application responses, cross-site scripting attacks can be prevented using two layers of defenses:\n\n1. Input should be validated as strictly as possible on arrival. Input which fails the validation should be rejected, not sanitized.\n2. User input should be HTML-encoded at any point where it is copied into application responses. All HTML metacharacters, including < > \" ' and =, should be replaced with the corresponding HTML entities.",
      },
      {
        name: "Code Injection",
        description:
          "Server-side code injection vulnerabilities arise when an application incorporates user-controllable data into a string that is dynamically evaluated by a code interpreter. If the user data is not strictly validated, an attacker can use crafted input to modify the code to be executed, and inject arbitrary code that will be executed by the server.\n\nServer-side code injection vulnerabilities are usually very serious and lead to complete compromise of the application's data and functionality, and often of the server that is hosting the application.",
        defaultRemediation:
          "Whenever possible, applications should avoid incorporating user-controllable data into dynamically evaluated code. In almost every situation, there are safer alternative methods of implementing application functions, which cannot be manipulated to inject arbitrary code into the server's processing.\n\nIf it is considered unavoidable to incorporate user-supplied data into dynamically evaluated code, then the data should be strictly validated. Ideally, a whitelist of specific accepted values should be used.",
      },
      {
        name: "Application Allows Uploading of Malicious Files",
        description:
          "Users may upload malicious code via the application. This is an input validation vulnerability that poses a risk to the infrastructure hosting the web application as well as the client environments that access this information. An attacker could potentially upload malicious content that could harm the computing environment of the clients that download such malicious content.",
        defaultRemediation:
          "Implement verification routines so that only proper files (i.e. .pdf, .doc) may be uploaded to the web server. Additionally, utilize a virus scanning engine to detect malicious files.",
      },
      {
        name: "Default Credentials in Use",
        description:
          "The application uses the default credentials. The credentials can be easily guessed or obtained by an attacker. Test for default or well-known credentials on admin panels, database interfaces, and third-party components.",
        defaultRemediation:
          "Change the default password immediately. Enforce strong passwords on all service accounts and disable or remove default accounts that are not needed.",
      },
      {
        name: "Clear Text Password Submission",
        description:
          "The application transmits passwords over unencrypted connections, making them vulnerable to interception. To exploit this vulnerability, an attacker must be suitably positioned to eavesdrop on the victim's network traffic. This scenario typically occurs when a client communicates with the server over an insecure connection such as public Wi-Fi, or a corporate or home network that is shared with a compromised computer.",
        defaultRemediation:
          "Applications should use transport-level encryption (SSL or TLS) to protect all sensitive communications passing between the client and the server. Communications that should be protected include the login mechanism and related functionality, and any functions where sensitive data can be accessed or privileged actions can be performed. If HTTP cookies are used for transmitting session tokens, then the secure flag should be set to prevent transmission over clear-text connections.",
      },
      {
        name: "Insufficient Account Lockout",
        description:
          "The application does not implement an account lockout policy on successive unsuccessful login attempts. An attacker could perform brute-force attacks against the application without fearing any account lockouts. Dictionary attacks can be easily performed against websites that do not implement an account lockout policy.",
        defaultRemediation:
          "Implement an account lockout scheme such that on the 6th consecutive invalid logon attempt, the user account is locked. If PINs are used for authentication this limit should be reduced to three. The counting of invalid consecutive login attempts should be based on server-side counts, not client-side cookie values.",
      },
      {
        name: "Session Tracking Cookie Value is Predictable",
        description:
          "The session tracking cookie that is placed on the client is easily predictable. A user would not need to authenticate if the user is able to guess the content of a session tracking cookie. Collect multiple session tokens and analyse them for patterns, low entropy, or sequential values.",
        defaultRemediation:
          "Generate session cookies using a cryptographically secure random number generator (≥ 128 bits of entropy). Guessing the next or another session cookie should not be feasible.",
      },
      {
        name: "Session Remains Active After Logout",
        description:
          "When a user logs out of the web application, their session is not invalidated on the server-side. After logging out, users can still utilize the browser's back button to reach internal pages. In a shared computer environment, this could allow an unauthorized user to access internal application pages and data using the previous user's session.",
        defaultRemediation:
          "When users log out of the application, the server should terminate the user's session on both the client-side and server-side. HTTP cookies should be removed from the user's browser and the session and all associated session variables on the server should be removed.",
      },
      {
        name: "Vulnerable Web Server Version",
        description:
          "According to its banner, the web server appears to be running an outdated software version and may be affected by multiple publicly known vulnerabilities. Check the server version header and compare against known CVE databases.",
        defaultRemediation:
          "Upgrade to the latest stable web server version and apply all available security patches.",
      },
    ],
  },
  {
    name: "Medium Risk Findings",
    risk: "medium",
    items: [
      {
        name: "Long Session Timeout",
        description:
          "The application does not have an adequate idle session timeout. If a user left a session open, a malicious user may be able to access the idle session. Test by authenticating, leaving the session idle for an extended period, and then attempting to use it.",
        defaultRemediation: "Shorten the session timeout to 30 minutes of inactivity.",
      },
      {
        name: "Admin Function Accessible",
        description:
          "Attackers can use the exposed administrator logon screen to conduct password spraying or brute-forcing attacks to gain access to system management functions, possibly resulting in a complete system compromise.",
        defaultRemediation:
          "Remove the administrator logon screen from public access, or restrict access to authorized IP addresses only.",
      },
      {
        name: "Username Enumeration",
        description:
          "It is possible to enumerate valid usernames on the registration or login page. The application shows a distinct error message when users enter an invalid username compared to an invalid password. This behavior can be used to enumerate valid usernames using automated tools, which can then be used to conduct password spraying attacks.",
        defaultRemediation:
          "Implement a CAPTCHA mechanism on authentication pages to prevent username enumeration attacks. Return generic error messages that do not distinguish between invalid usernames and invalid passwords.",
      },
      {
        name: "Lack of Throttling",
        description:
          "The application infrastructure does not limit the number of requests submitted from a single IP in a given timeframe, allowing attackers to conduct automated attacks which may ultimately result in unauthorized data access. Test by conducting a password spraying attack on the login pages.",
        defaultRemediation:
          "Implement IP rate limiting: only allow a limited number of requests from an IP address in a given timeframe. Additionally, implement a CAPTCHA mechanism to prevent automated enumeration attacks against forms.",
      },
      {
        name: "Weak Password Complexity Requirements",
        description:
          "The application allows users to register with weak passwords. Test by attempting to register a user with a short or simple password (e.g. '123456', 'password') and verify whether the application enforces complexity requirements.",
        defaultRemediation:
          "Implement strong password complexity requirements: passwords should be 8 or more characters long, alphanumeric, a combination of upper and lower case characters, and should include at least one special character.",
      },
      {
        name: "Cross-Site Request Forgery (CSRF)",
        description:
          "Cross-site request forgery vulnerabilities may arise when applications rely solely on HTTP cookies to identify the user that has issued a particular request. Because browsers automatically add cookies to requests regardless of their origin, it may be possible for an attacker to create a malicious web site that forges a cross-domain request to the vulnerable application.\n\nFor a request to be vulnerable to CSRF: the request can be issued cross-domain; the application relies solely on HTTP cookies or Basic Authentication; the request performs some privileged action; and the attacker can determine all the parameters required.",
        defaultRemediation:
          "The most effective way to protect against CSRF vulnerabilities is to include within relevant requests an additional token that is not transmitted in a cookie: for example, a parameter in a hidden form field. This token should contain sufficient entropy and be generated using a cryptographic random number generator. The token should be associated with the user's session, and the application should validate that the correct token is received before performing any action resulting from the request.",
      },
      {
        name: "Session Token in URL",
        description:
          "Sensitive information within URLs may be logged in various locations, including the user's browser, the web server, and any forward or reverse proxy servers between the two endpoints. URLs may also be displayed on-screen, bookmarked or emailed around by users. They may be disclosed to third parties via the Referer header when any off-site links are followed. Placing session tokens into the URL increases the risk that they will be captured by an attacker.",
        defaultRemediation:
          "Applications should use an alternative mechanism for transmitting session tokens, such as HTTP cookies or hidden fields in forms that are submitted using the POST method.",
      },
      {
        name: "Session Cookies Not Regenerated on Login",
        description:
          "The application sets the session cookie before the user authenticates to the application. The cookie value is not regenerated once the user successfully authenticates. In a shared computing environment, an attacker can record the session ID assigned to a particular computer. When another user authenticates using the targeted computer, the attacker can use the stolen session ID to impersonate the authenticated user.",
        defaultRemediation:
          "A user's session ID should be regenerated any time the user crosses an authentication boundary. This includes events such as logging in, logging out, or a change in role or privilege level.",
      },
      {
        name: "No Logout Functionality",
        description:
          "No logout functionality exists within the application. Sessions may inadvertently remain open, which increases the possibility of unauthorized data access. Test by checking all pages for a logout button or link.",
        defaultRemediation:
          "Implement a logout button so that users may terminate their session via the application without having to close the entire browser. Upon logout the server-side session object should be invalidated.",
      },
      {
        name: "Sensitive Identifiers in URL",
        description:
          "Sensitive information within URLs may be logged in various locations including the user's browser, the web server, and proxy servers. They may be disclosed to third parties via the Referer header when off-site links are followed. Placing sensitive identifiers into the URL increases the risk that they will be captured by an attacker.",
        defaultRemediation:
          "Applications should use an alternative mechanism for transmitting sensitive identifiers, such as HTTP cookies or hidden fields in forms that are submitted using the POST method.",
      },
      {
        name: "URL Redirection",
        description:
          "The application is vulnerable to arbitrary URL redirection. The application allows redirection to any URL which may lead to impersonation or navigation to a rogue site. Test by manipulating redirect parameters to point to external domains.",
        defaultRemediation:
          "The application should properly validate parameters used for redirection to prevent redirection to unauthorized URLs. Maintain an allowlist of permitted redirect destinations.",
      },
      {
        name: "Weak Cryptographic Protocols/Ciphers",
        description:
          "The web server uses weak protocols or ciphers for data transmission. The use of weak ciphers/protocols endangers the confidentiality of data passed between the client and the server. Test using tools like testssl.sh or SSL Labs for SSLv2, SSLv3, TLS 1.0, TLS 1.1, or weak cipher suites.",
        defaultRemediation:
          "Disable support in the web server for weak cryptography. Support only TLS 1.2 and TLS 1.3. Disable weak cipher suites including RC4, DES, 3DES, and export ciphers.",
      },
      {
        name: "Self-Signed SSL Certificate",
        description:
          "Self-signed SSL certificates or certificates issued for a different machine do not provide server authentication. Such certificates train users to accept invalid certificates, putting the entire communication channel into jeopardy. Check the certificate details in the browser.",
        defaultRemediation:
          "Contact a Certificate Authority to obtain a valid certificate signed by a trusted CA.",
      },
    ],
  },
  {
    name: "Low Risk Findings",
    risk: "low",
    items: [
      {
        name: "Password Field with Autocomplete Enabled",
        description:
          "Most browsers have a facility to remember user credentials entered into HTML forms. If the function is enabled, credentials entered by the user are stored on their local computer and retrieved by the browser on future visits. The stored credentials can be captured by an attacker who gains control over the user's computer, or via a cross-site scripting attack.",
        defaultRemediation:
          'To prevent browsers from storing credentials entered into HTML forms, include the attribute autocomplete="off" within the FORM tag (to protect all form fields) or within the relevant INPUT tags. Note that modern web browsers may ignore this directive.',
      },
      {
        name: "Cookie Without HTTPOnly Flag Set",
        description:
          "If the HttpOnly attribute is not set on a cookie, the cookie's value can be read or set by client-side JavaScript. This makes certain client-side attacks, such as cross-site scripting, easier to exploit by allowing them to trivially capture the cookie's value via an injected script.",
        defaultRemediation:
          "Set the HttpOnly flag on all cookies that do not require legitimate client-side script access. Include this attribute within the relevant Set-Cookie directive.",
      },
      {
        name: "TLS Cookie Without Secure Flag Set",
        description:
          "If the secure flag is not set on a cookie, then browsers will submit the cookie in requests that use an unencrypted HTTP connection, allowing the cookie to be trivially intercepted by an attacker monitoring network traffic. An attacker may be able to induce HTTP requests using links of the form http://example.com:443/.",
        defaultRemediation:
          "The secure flag should be set on all cookies that are used for transmitting sensitive data when accessing content over HTTPS. If cookies are used to transmit session tokens, these should never be transmitted over unencrypted communications.",
      },
      {
        name: "Strict Transport Security Not Enforced",
        description:
          "The application fails to prevent users from connecting to it over unencrypted connections. An attacker able to modify a legitimate user's network traffic could bypass the application's use of SSL/TLS encryption using SSL-stripping tools such as sslstrip, which rewrite HTTPS links as HTTP.",
        defaultRemediation:
          "Enable HTTP Strict Transport Security (HSTS) by adding a response header with the name 'Strict-Transport-Security' and the value 'max-age=expireTime', where expireTime is the time in seconds that browsers should remember that the site should only be accessed using HTTPS. Consider adding the 'includeSubDomains' flag if appropriate.",
      },
      {
        name: "Private IP Address Disclosed",
        description:
          "The application discloses RFC 1918 private IP addresses in its responses. Although private addresses cannot be routed on the public Internet, discovering the private addresses used within an organization can help an attacker carry out network-layer attacks to penetrate internal infrastructure.",
        defaultRemediation:
          "If private IP addresses are being returned in service banners or debug messages, configure the relevant services to mask the private addresses. If used to track back-end servers for load balancing, replace with innocuous identifiers.",
      },
      {
        name: "Directory Listing",
        description:
          "The web server is configured to automatically list the contents of directories that do not have an index page present. This can aid an attacker by enabling them to quickly identify the resources at a given path and access sensitive files within the directory that are not intended to be accessible to users.",
        defaultRemediation:
          "Configure the web server to prevent directory listings for all paths beneath the web root. Alternatively, place into each directory a default file (such as index.htm) that the web server will display instead of returning a directory listing.",
      },
      {
        name: "Verbose Error Messages",
        description:
          "The application returns verbose error messages regarding the context in which an exception occurred. This information can be leveraged by malicious users to discover security vulnerabilities or to increase the effectiveness of an existing attack. Trigger errors (404, 500) and verify that detailed stack traces or internal paths are not exposed to the end user.",
        defaultRemediation:
          "A global error handler or page should be enabled to ensure uncaught exceptions do not result in information being disclosed to the user. Configure production error handling to show generic messages to users. Most modern web frameworks provide a method for enabling these global error pages within an application-level configuration file.",
      },
      {
        name: "Change Password Without Entering Original Password",
        description:
          "A user may change the current password without entering the old password. This means that an attacker with temporary access to an authenticated session can permanently change the victim's password and take over the account.",
        defaultRemediation:
          "Modify the change password function to require entering the current (old) password before accepting a new password.",
      },
      {
        name: "Web Server Version in Headers",
        description:
          "The web server reveals its version in the HTTP response headers. This information can be used to obtain publicly available exploits for the given server version and give attackers a starting point for an attack. Check the Server and X-Powered-By headers in HTTP responses.",
        defaultRemediation:
          "Remove or suppress the server version information from the HTTP response headers (e.g. configure ServerTokens Prod in Apache, or server_tokens off in nginx).",
      },
      {
        name: "Vulnerable JavaScript Dependency",
        description:
          "The application uses a third-party JavaScript library with a known security vulnerability. Although common libraries enjoy the benefit of being heavily audited, bugs are quickly identified and patched upstream, resulting in a steady stream of security updates that need to be applied. Using a library with missing security patches can make the application easy to exploit.",
        defaultRemediation:
          "Develop a patch-management strategy to ensure that security updates are promptly applied to all third-party libraries in the application. Consider reducing the attack surface by removing any libraries that are no longer in use.",
      },
    ],
  },
];

async function seed() {
  console.log("Seeding Berkeley Web Application Security Assessment playbook...");

  const [pb] = await db
    .insert(playbook)
    .values({
      userId: null,
      name: "Web Application Security Assessment",
      description:
        "Standard web application security assessment checklist based on the Berkeley School of Information template. Covers High, Medium, and Low risk vulnerability categories. System-owned — duplicate to create an editable copy.",
      isPublic: false,
    })
    .returning();

  const [pbVersion] = await db
    .insert(playbookVersion)
    .values({
      playbookId: pb.id,
      version: "1.0",
      changelog: "Initial Berkeley Web Application Security Assessment template.",
      isActive: true,
      status: "published",
    })
    .returning();

  let totalItems = 0;

  for (let catIdx = 0; catIdx < CATEGORIES.length; catIdx++) {
    const cat = CATEGORIES[catIdx];

    const [category] = await db
      .insert(playbookCategory)
      .values({
        playbookVersionId: pbVersion.id,
        name: cat.name,
        frameworkRef: null,
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
        defaultRisk: cat.risk,
        active: true,
        displayOrder: itemIdx,
      });
      totalItems++;
    }
  }

  console.log(
    `Seeded: 1 playbook, 1 version, ${CATEGORIES.length} categories, ${totalItems} items.`
  );
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
