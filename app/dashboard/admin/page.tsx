"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RefreshCw, Shield, Users } from "lucide-react";

interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  githubUsername: string | null;
  image: string | null;
  role: "USER" | "ADMIN";
  plan: "FREE" | "PRO";
  projectCount: number;
  createdAt: string;
}

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (res.status === 403) {
        router.replace("/dashboard");
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch users");
      const data = await res.json();
      setUsers(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const updateUser = async (
    userId: string,
    update: { role?: string; plan?: string },
  ) => {
    setActionLoading(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...update }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update user");
      }
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2">
          <Shield className="h-6 w-6" />
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        </div>
        <p className="text-muted-foreground">
          Manage users, roles, and plans
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">PRO Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {users.filter((u) => u.plan === "PRO").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Projects
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {users.reduce((sum, u) => sum + u.projectCount, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-4">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <h2 className="text-xl font-semibold">Users</h2>
        {users.map((user) => (
          <Card key={user.id}>
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarImage
                    src={user.image || ""}
                    alt={user.name || ""}
                  />
                  <AvatarFallback>
                    {user.name?.charAt(0)?.toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{user.name || "Unnamed"}</p>
                    <Badge
                      variant={user.role === "ADMIN" ? "default" : "outline"}
                      className="text-[10px]"
                    >
                      {user.role}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {user.plan}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {user.email}
                    {user.githubUsername && (
                      <span className="ml-2 font-mono">
                        @{user.githubUsername}
                      </span>
                    )}
                    <span className="ml-2">
                      {user.projectCount} project(s)
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={actionLoading === user.id}
                  onClick={() =>
                    updateUser(user.id, {
                      plan: user.plan === "FREE" ? "PRO" : "FREE",
                    })
                  }
                >
                  {actionLoading === user.id && (
                    <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                  )}
                  {user.plan === "FREE"
                    ? "Upgrade to PRO"
                    : "Downgrade to FREE"}
                </Button>
                <Button
                  variant={user.role === "ADMIN" ? "destructive" : "outline"}
                  size="sm"
                  disabled={actionLoading === user.id}
                  onClick={() =>
                    updateUser(user.id, {
                      role: user.role === "ADMIN" ? "USER" : "ADMIN",
                    })
                  }
                >
                  {user.role === "ADMIN" ? "Remove Admin" : "Make Admin"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
