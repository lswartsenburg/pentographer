"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type OrgRole = "owner" | "admin" | "member" | "viewer";

interface Member {
  id: string;
  role: OrgRole;
  createdAt: Date;
  userId: string;
  name: string;
  email: string;
}

const ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

function canManage(myRole: OrgRole): boolean {
  return myRole === "owner" || myRole === "admin";
}

export function TeamMembersCard({
  orgName,
  members: initialMembers,
  myRole,
  myUserId,
}: {
  orgName: string;
  members: Member[];
  myRole: OrgRole;
  myUserId: string;
}) {
  const router = useRouter();
  const [members, setMembers] = useState(initialMembers);
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState<"admin" | "member" | "viewer">("member");
  const [adding, setAdding] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    try {
      const res = await fetch("/api/settings/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addEmail, role: addRole }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to add member");
        return;
      }
      toast.success("Member added");
      setAddEmail("");
      router.refresh();
    } finally {
      setAdding(false);
    }
  }

  async function handleRoleChange(memberId: string, role: "admin" | "member" | "viewer") {
    const res = await fetch(`/api/settings/team/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Failed to update role");
      return;
    }
    setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role } : m)));
    toast.success("Role updated");
  }

  async function handleRemove(memberId: string) {
    const res = await fetch(`/api/settings/team/${memberId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Failed to remove member");
      return;
    }
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
    toast.success("Member removed");
  }

  const manage = canManage(myRole);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-medium text-foreground">{orgName}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Manage who has access to your organization
        </p>
      </div>

      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Name</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Email</th>
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Role</th>
              {manage && <th className="px-4 py-2.5 w-16" />}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const isMe = member.userId === myUserId;
              const canEdit = manage && !isMe && member.role !== "owner";
              return (
                <tr key={member.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 text-foreground">
                    {member.name}
                    {isMe && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{member.email}</td>
                  <td className="px-4 py-2.5">
                    {canEdit ? (
                      <Select
                        value={member.role}
                        onValueChange={(v) =>
                          handleRoleChange(member.id, v as "admin" | "member" | "viewer")
                        }
                      >
                        <SelectTrigger className="h-7 text-xs w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="member">Member</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-muted-foreground">{ROLE_LABELS[member.role]}</span>
                    )}
                  </td>
                  {manage && (
                    <td className="px-4 py-2.5">
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-destructive hover:text-destructive"
                          onClick={() => handleRemove(member.id)}
                        >
                          Remove
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {manage && (
        <form onSubmit={handleAdd} className="pt-2 space-y-1.5">
          <Label htmlFor="add-email" className="text-xs">
            Add by email
          </Label>
          <div className="flex items-center gap-3">
            <Input
              id="add-email"
              type="email"
              placeholder="colleague@example.com"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              className="flex-1 h-8 text-sm"
              required
            />
            <Select
              value={addRole}
              onValueChange={(v) => setAddRole(v as "admin" | "member" | "viewer")}
            >
              <SelectTrigger className="h-8 text-sm w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" size="sm" className="h-8" disabled={adding}>
              {adding ? "Adding…" : "Add"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
