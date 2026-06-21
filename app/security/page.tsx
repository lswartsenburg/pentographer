import type { Metadata } from "next";
import Link from "next/link";
import { LogoWordmark } from "@/components/logo";

export const metadata: Metadata = {
  title: "Responsible Disclosure — Pentographer",
  description: "How to report security vulnerabilities in Pentographer.",
};

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <Link href="/">
          <LogoWordmark size="sm" />
        </Link>
        <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
          Sign in
        </Link>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-16 space-y-12">
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight">Responsible Disclosure Policy</h1>
          <p className="text-muted-foreground">
            We take the security of Pentographer seriously. If you have discovered a vulnerability,
            we appreciate your help in disclosing it to us responsibly.
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">How to report</h2>
          <p className="text-sm text-muted-foreground">
            Email your findings to{" "}
            <a
              href="mailto:security@pentographer.com"
              className="text-foreground underline underline-offset-2"
            >
              security@pentographer.com
            </a>
            . Please do not open a public GitHub issue for security vulnerabilities.
          </p>
          <p className="text-sm text-muted-foreground">
            Encrypt sensitive reports using our PGP key (available on request).
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">What to include</h2>
          <ul className="text-sm text-muted-foreground space-y-1.5 list-disc list-inside">
            <li>A clear description of the vulnerability and its potential impact</li>
            <li>Steps to reproduce (proof of concept, screenshots, or a short video)</li>
            <li>The affected URL, endpoint, or component</li>
            <li>Your suggested severity level (Critical / High / Medium / Low)</li>
            <li>Any relevant technical details (browser, OS, account type)</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">What to expect</h2>
          <ul className="text-sm text-muted-foreground space-y-1.5 list-disc list-inside">
            <li>Acknowledgement of your report within 2 business days</li>
            <li>An initial assessment of severity and exploitability within 5 business days</li>
            <li>Regular progress updates while we work on a fix</li>
            <li>
              Credit in our release notes if you wish (let us know your preferred name/handle)
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">Scope</h2>
          <p className="text-sm text-muted-foreground">
            In scope: the Pentographer web application and its APIs (
            <code className="text-xs bg-muted px-1 py-0.5 rounded">pentographer.com</code> and
            subdomains).
          </p>
          <p className="text-sm text-muted-foreground">
            Out of scope: denial-of-service attacks, social engineering of staff, physical security,
            or vulnerabilities in third-party services we depend on. Please report those directly to
            the relevant vendor.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">Safe harbour</h2>
          <p className="text-sm text-muted-foreground">
            We will not take legal action against researchers who discover and report
            vulnerabilities in good faith, provided they:
          </p>
          <ul className="text-sm text-muted-foreground space-y-1.5 list-disc list-inside">
            <li>Do not access, modify, or delete data belonging to other users</li>
            <li>Do not perform actions that degrade or disrupt service for others</li>
            <li>
              Report the vulnerability promptly and do not disclose it publicly before a fix is in
              place (coordinated disclosure)
            </li>
            <li>Act in good faith with the intent of improving security</li>
          </ul>
        </section>

        <p className="text-xs text-muted-foreground border-t border-border pt-6">
          This policy is modelled on the{" "}
          <a
            href="https://securitytxt.org"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            security.txt
          </a>{" "}
          standard (RFC 9116). Machine-readable version:{" "}
          <a href="/.well-known/security.txt" className="underline underline-offset-2">
            /.well-known/security.txt
          </a>
        </p>
      </main>
    </div>
  );
}
