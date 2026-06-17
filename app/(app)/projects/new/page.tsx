"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Customer = { id: string; name: string };
type PlaybookVersionOption = { id: string; playbookName: string; version: string };

export default function NewProjectPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [playbookVersions, setPlaybookVersions] = useState<PlaybookVersionOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/customers")
      .then((r) => r.json())
      .then(setCustomers);
    fetch("/api/playbooks")
      .then((r) => r.json())
      .then(
        (
          pbs: Array<{
            id: string;
            name: string;
            latestVersion: { id: string; version: string } | null;
          }>
        ) => {
          const opts: PlaybookVersionOption[] = pbs
            .filter((pb) => pb.latestVersion)
            .map((pb) => ({
              id: pb.latestVersion!.id,
              playbookName: pb.name,
              version: pb.latestVersion!.version,
            }));
          setPlaybookVersions(opts);
        }
      );
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        customerId: form.get("customerId"),
        playbookVersionId: form.get("playbookVersionId") || null,
        scope: form.get("scope") || null,
        startDate: form.get("startDate")
          ? new Date(form.get("startDate") as string).toISOString()
          : null,
        endDate: form.get("endDate") ? new Date(form.get("endDate") as string).toISOString() : null,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to create project.");
      return;
    }

    const created = await res.json();
    router.push(`/projects/${created.id}`);
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-2 border-b border-border h-12 px-5 bg-background">
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/projects" className="hover:text-foreground">
            Projects
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">New project</span>
        </nav>
      </header>

      <div className="flex-1 p-5">
        <div className="max-w-xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="name">Project name</Label>
              <Input id="name" name="name" placeholder="Web App Assessment Q2 2025" required />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="customerId">Customer</Label>
              <select
                id="customerId"
                name="customerId"
                required
                className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
              >
                <option value="">Select a customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {customers.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No customers yet.{" "}
                  <Link href="/customers" className="text-primary hover:underline">
                    Add one first
                  </Link>
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="playbookVersionId">
                Playbook <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <select
                id="playbookVersionId"
                name="playbookVersionId"
                className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
              >
                <option value="">No playbook</option>
                {playbookVersions.map((pv) => (
                  <option key={pv.id} value={pv.id}>
                    {pv.playbookName} — v{pv.version}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="scope">
                Scope <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                id="scope"
                name="scope"
                placeholder="app.acmecorp.com — authenticated + unauthenticated"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="startDate">Start date</Label>
                <Input id="startDate" name="startDate" type="date" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="endDate">End date</Label>
                <Input id="endDate" name="endDate" type="date" />
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Link href="/projects">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={loading}>
                {loading ? "Creating…" : "Create project"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
