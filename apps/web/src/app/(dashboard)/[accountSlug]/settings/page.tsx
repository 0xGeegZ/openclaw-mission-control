"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import { useAccount } from "@/lib/hooks/useAccount";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/card";
import { Button } from "@packages/ui/components/button";
import { Input } from "@packages/ui/components/input";
import { Label } from "@packages/ui/components/label";
import { Separator } from "@packages/ui/components/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@packages/ui/components/tabs";
import { Skeleton } from "@packages/ui/components/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@packages/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/select";
import { Avatar, AvatarFallback, AvatarImage } from "@packages/ui/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@packages/ui/components/dropdown-menu";
import {
  Users,
  Shield,
  Bell,
  Palette,
  Building2,
  CreditCard,
  Trash2,
  User,
  Crown,
  MoreHorizontal,
  UserCog,
  Mail,
} from "lucide-react";
import { toast } from "sonner";

interface SettingsPageProps {
  params: Promise<{ accountSlug: string }>;
}

/**
 * Settings page for workspace configuration.
 * General (name, slug), Members (list, invite, role, remove), Notifications (preferences), Danger Zone (delete).
 */
export default function SettingsPage({ params }: SettingsPageProps) {
  const { accountSlug } = use(params);
  const router = useRouter();
  const { account, accountId, isLoading, isAdmin, isOwner } = useAccount();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [generalSaving, setGeneralSaving] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);

  const [taskUpdates, setTaskUpdates] = useState(true);
  const [agentActivity, setAgentActivity] = useState(true);
  const [emailDigest, setEmailDigest] = useState(false);
  const [notifSaving, setNotifSaving] = useState(false);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteUserId, setInviteUserId] = useState("");
  const [inviteUserName, setInviteUserName] = useState("");
  const [inviteUserEmail, setInviteUserEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const members = useQuery(
    api.memberships.list,
    accountId ? { accountId } : "skip"
  );

  const updateAccount = useMutation(api.accounts.update);
  const removeAccount = useMutation(api.accounts.remove);
  const inviteMember = useMutation(api.memberships.invite);
  const updateRole = useMutation(api.memberships.updateRole);
  const removeMember = useMutation(api.memberships.remove);

  useEffect(() => {
    if (account) {
      setName(account.name ?? "");
      setSlug(account.slug ?? accountSlug);
    }
  }, [account, accountSlug]);

  useEffect(() => {
    const prefs = (account as { settings?: { notificationPreferences?: { taskUpdates?: boolean; agentActivity?: boolean; emailDigest?: boolean } } })?.settings?.notificationPreferences;
    if (prefs) {
      setTaskUpdates(prefs.taskUpdates ?? true);
      setAgentActivity(prefs.agentActivity ?? true);
      setEmailDigest(prefs.emailDigest ?? false);
    }
  }, [account]);

  const handleSaveGeneral = async () => {
    if (!accountId) return;
    setSlugError(null);
    setGeneralSaving(true);
    try {
      await updateAccount({
        accountId,
        name: name.trim() || undefined,
        slug: slug.trim() || undefined,
      });
      toast.success("Settings saved");
      const newSlug = slug.trim();
      if (newSlug && newSlug !== accountSlug) {
        router.replace(`/${newSlug}/settings`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save";
      if (msg.includes("slug") && msg.includes("exists")) {
        setSlugError("This URL is already taken");
      } else {
        toast.error(msg);
      }
    } finally {
      setGeneralSaving(false);
    }
  };

  const handleSaveNotifications = async () => {
    if (!accountId) return;
    setNotifSaving(true);
    try {
      await updateAccount({
        accountId,
        settings: {
          notificationPreferences: {
            taskUpdates,
            agentActivity,
            emailDigest,
          },
        },
      });
      toast.success("Notification preferences saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setNotifSaving(false);
    }
  };

  const handleInvite = async () => {
    if (!accountId || !inviteUserId.trim() || !inviteUserName.trim() || !inviteUserEmail.trim()) {
      toast.error("User ID, name, and email are required");
      return;
    }
    setInviteSubmitting(true);
    try {
      await inviteMember({
        accountId,
        userId: inviteUserId.trim(),
        userName: inviteUserName.trim(),
        userEmail: inviteUserEmail.trim(),
        role: inviteRole,
      });
      toast.success("Invitation sent");
      setShowInvite(false);
      setInviteUserId("");
      setInviteUserName("");
      setInviteUserEmail("");
      setInviteRole("member");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to invite");
    } finally {
      setInviteSubmitting(false);
    }
  };

  const handleUpdateRole = async (membershipId: Id<"memberships">, role: "member" | "admin") => {
    if (!accountId) return;
    try {
      await updateRole({ accountId, membershipId, role });
      toast.success("Role updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update role");
    }
  };

  const handleRemoveMember = async (membershipId: Id<"memberships">) => {
    if (!accountId) return;
    try {
      await removeMember({ accountId, membershipId });
      toast.success("Member removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    }
  };

  const handleDeleteWorkspace = async () => {
    if (!accountId) return;
    setDeleteSubmitting(true);
    try {
      await removeAccount({ accountId });
      toast.success("Workspace deleted");
      router.replace("/dashboard");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setDeleteSubmitting(false);
      setShowDeleteConfirm(false);
    }
  };

  const getInitials = (n: string) =>
    n
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-6 py-4 border-b bg-card">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your workspace settings and preferences
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6">
          <Tabs defaultValue="general" className="space-y-6">
            <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-flex">
              <TabsTrigger value="general" className="gap-2">
                <Building2 className="h-4 w-4 hidden sm:inline" />
                General
              </TabsTrigger>
              <TabsTrigger value="members" className="gap-2">
                <Users className="h-4 w-4 hidden sm:inline" />
                Members
              </TabsTrigger>
              <TabsTrigger value="notifications" className="gap-2">
                <Bell className="h-4 w-4 hidden sm:inline" />
                Notifications
              </TabsTrigger>
              <TabsTrigger value="appearance" className="gap-2">
                <Palette className="h-4 w-4 hidden sm:inline" />
                Appearance
              </TabsTrigger>
              <TabsTrigger value="billing" className="gap-2">
                <CreditCard className="h-4 w-4 hidden sm:inline" />
                Billing
              </TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="mt-6 space-y-6 flex-none outline-none">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Workspace Information
                  </CardTitle>
                  <CardDescription>
                    Update your workspace details and settings
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isLoading ? (
                    <div className="space-y-4">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="workspace-name">Workspace Name</Label>
                        <Input
                          id="workspace-name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="My Workspace"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="workspace-slug">Workspace URL</Label>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">/</span>
                          <Input
                            id="workspace-slug"
                            value={slug}
                            onChange={(e) => {
                              setSlug(e.target.value);
                              setSlugError(null);
                            }}
                            placeholder="my-workspace"
                          />
                        </div>
                        {slugError && (
                          <p className="text-sm text-destructive">{slugError}</p>
                        )}
                      </div>
                      <Button
                        className="mt-4"
                        onClick={handleSaveGeneral}
                        disabled={generalSaving}
                      >
                        {generalSaving ? "Saving…" : "Save Changes"}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>

              {isOwner && (
                <Card className="border-destructive/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-destructive">
                      <Trash2 className="h-5 w-5" />
                      Danger Zone
                    </CardTitle>
                    <CardDescription>
                      Irreversible and destructive actions
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Delete Workspace</p>
                        <p className="text-sm text-muted-foreground">
                          Permanently delete this workspace and all its data
                        </p>
                      </div>
                      <Button
                        variant="destructive"
                        onClick={() => setShowDeleteConfirm(true)}
                      >
                        Delete Workspace
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="members" className="mt-6 space-y-6 flex-none outline-none">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Team Members
                  </CardTitle>
                  <CardDescription>
                    Manage who has access to this workspace
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isAdmin && (
                    <div className="mb-4">
                      <Button onClick={() => setShowInvite(true)}>
                        <Users className="mr-2 h-4 w-4" />
                        Invite Member
                      </Button>
                    </div>
                  )}
                  {members === undefined ? (
                    <div className="space-y-3">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-14 w-full rounded-lg" />
                      ))}
                    </div>
                  ) : members.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No members yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {members.map((member) => (
                        <div
                          key={member._id}
                          className="flex items-center gap-4 p-4 rounded-lg bg-muted/30 border"
                        >
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={member.userAvatarUrl} alt={member.userName} />
                            <AvatarFallback className="bg-primary/10 text-primary text-sm">
                              {getInitials(member.userName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium truncate">{member.userName}</p>
                              {member.role === "owner" && (
                                <Crown className="h-4 w-4 text-yellow-500 shrink-0" />
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground truncate">
                              {member.userEmail}
                            </p>
                          </div>
                          <span className="text-sm capitalize text-muted-foreground">
                            {member.role}
                          </span>
                          {isAdmin && member.role !== "owner" && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                  <span className="sr-only">Actions</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => handleUpdateRole(member._id, "admin")}
                                  disabled={member.role === "admin"}
                                >
                                  <UserCog className="mr-2 h-4 w-4" />
                                  Make admin
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleUpdateRole(member._id, "member")}
                                  disabled={member.role === "member"}
                                >
                                  <User className="mr-2 h-4 w-4" />
                                  Make member
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => handleRemoveMember(member._id)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Remove
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notifications" className="mt-6 space-y-6 flex-none outline-none">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bell className="h-5 w-5" />
                    Notification Preferences
                  </CardTitle>
                  <CardDescription>
                    Configure how and when you receive notifications
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Task Updates</p>
                        <p className="text-sm text-muted-foreground">
                          Get notified when tasks are assigned or updated
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setTaskUpdates((v) => !v)}
                      >
                        {taskUpdates ? "On" : "Off"}
                      </Button>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Agent Activity</p>
                        <p className="text-sm text-muted-foreground">
                          Receive alerts when agents complete tasks
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAgentActivity((v) => !v)}
                      >
                        {agentActivity ? "On" : "Off"}
                      </Button>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Email Digest</p>
                        <p className="text-sm text-muted-foreground">
                          Daily digest and important updates via email
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEmailDigest((v) => !v)}
                      >
                        {emailDigest ? "On" : "Off"}
                      </Button>
                    </div>
                  </div>
                  <Button
                    className="mt-4"
                    onClick={handleSaveNotifications}
                    disabled={notifSaving}
                  >
                    {notifSaving ? "Saving…" : "Save preferences"}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="appearance" className="mt-6 space-y-6 flex-none outline-none">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Palette className="h-5 w-5" />
                    Theme & Appearance
                  </CardTitle>
                  <CardDescription>
                    Customize the look and feel of your workspace
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
                      <Palette className="h-7 w-7 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold">Theme customization coming soon</h3>
                    <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                      Choose between light, dark, and custom themes.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="billing" className="mt-6 space-y-6 flex-none outline-none">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Billing & Subscription
                  </CardTitle>
                  <CardDescription>
                    Manage your subscription and payment methods
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
                      <CreditCard className="h-7 w-7 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold">Billing coming soon</h3>
                    <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                      View and manage your subscription, invoices, and payment methods.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Invite dialog */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
            <DialogDescription>
              Add a member by their Clerk user ID, display name, and email. The user must already have an account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="invite-user-id">User ID (Clerk)</Label>
              <Input
                id="invite-user-id"
                value={inviteUserId}
                onChange={(e) => setInviteUserId(e.target.value)}
                placeholder="user_..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-name">Display Name</Label>
              <Input
                id="invite-name"
                value={inviteUserName}
                onChange={(e) => setInviteUserName(e.target.value)}
                placeholder="Jane Doe"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteUserEmail}
                onChange={(e) => setInviteUserEmail(e.target.value)}
                placeholder="jane@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={inviteRole}
                onValueChange={(v) => setInviteRole(v as "member" | "admin")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvite(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleInvite}
              disabled={inviteSubmitting || !inviteUserId.trim() || !inviteUserName.trim() || !inviteUserEmail.trim()}
            >
              {inviteSubmitting ? "Sending…" : "Send Invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Workspace</DialogTitle>
            <DialogDescription>
              This will permanently delete this workspace and all its data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteWorkspace}
              disabled={deleteSubmitting}
            >
              {deleteSubmitting ? "Deleting…" : "Delete Workspace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
