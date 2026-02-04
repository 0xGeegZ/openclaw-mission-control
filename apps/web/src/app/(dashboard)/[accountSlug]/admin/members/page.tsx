"use client";

import { use, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { useAccount } from "@/lib/hooks/useAccount";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@packages/ui/components/card";
import { Button } from "@packages/ui/components/button";
import { Input } from "@packages/ui/components/input";
import { Label } from "@packages/ui/components/label";
import { Badge } from "@packages/ui/components/badge";
import { Skeleton } from "@packages/ui/components/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@packages/ui/components/avatar";
import { 
  Users, 
  UserPlus,
  Shield,
  Crown,
  User,
  MoreHorizontal,
  Mail,
  Trash2,
  UserCog,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@packages/ui/components/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@packages/ui/components/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@packages/ui/components/alert-dialog";
import { toast } from "sonner";
import { getInitials } from "@/lib/utils";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Id } from "@packages/backend/convex/_generated/dataModel";

interface MembersPageProps {
  params: Promise<{ accountSlug: string }>;
}

/**
 * Admin page for managing team members.
 * Only accessible to admin and owner roles.
 */
export default function MembersPage({ params }: MembersPageProps) {
  use(params);
  const { accountId, isAdmin } = useAccount();
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [memberToRemove, setMemberToRemove] = useState<{ id: Id<"memberships">; name: string } | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  
  // Fetch members
  const members = useQuery(
    api.memberships.list,
    accountId ? { accountId } : "skip"
  );
  
  const getRoleIcon = (role: string) => {
    switch (role) {
      case "owner":
        return <Crown className="h-3.5 w-3.5 text-yellow-500" />;
      case "admin":
        return <Shield className="h-3.5 w-3.5 text-primary" />;
      default:
        return <User className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };
  
  const getRoleBadgeVariant = (role: string): "default" | "secondary" | "outline" => {
    switch (role) {
      case "owner":
        return "default";
      case "admin":
        return "secondary";
      default:
        return "outline";
    }
  };
  
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-destructive/10 mb-5">
          <Shield className="h-10 w-10 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">Access Denied</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-md text-center">
          You need admin or owner permissions to access this page.
        </p>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-full bg-background">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 py-5 border-b border-border/50 bg-card/50 backdrop-blur-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Team Members</h1>
            <Badge variant="secondary" className="rounded-full">
              <Shield className="h-3 w-3 mr-1" />
              Admin
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your workspace members and their roles</p>
        </div>
        <Dialog open={showInvite} onOpenChange={setShowInvite}>
          <DialogTrigger asChild>
            <Button className="rounded-xl shadow-sm">
              <UserPlus className="h-4 w-4 mr-2" />
              Invite Member
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Invite Team Member</DialogTitle>
              <DialogDescription>
                Send an invitation to join your workspace. They&apos;ll receive an email with instructions.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email Address</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="colleague@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-role">Role</Label>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "member" | "admin")}>
                  <SelectTrigger id="invite-role" className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Member
                      </div>
                    </SelectItem>
                    <SelectItem value="admin">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        Admin
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {inviteRole === "admin" 
                    ? "Admins can manage members and configure workspace settings"
                    : "Members can view and work on tasks and documents"
                  }
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowInvite(false)} className="rounded-xl">
                Cancel
              </Button>
              <Button 
                onClick={() => {
                  toast.success("Invitation sent", { description: `An invite has been sent to ${inviteEmail}` });
                  setShowInvite(false);
                  setInviteEmail("");
                }}
                className="rounded-xl"
                disabled={!inviteEmail}
              >
                <Mail className="h-4 w-4 mr-2" />
                Send Invite
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>
      
      <div className="flex-1 overflow-auto p-6">
        <Card className="border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Members ({members?.length ?? 0})
            </CardTitle>
            <CardDescription>
              People with access to this workspace
            </CardDescription>
          </CardHeader>
          <CardContent>
            {members === undefined ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-muted/30">
                    <Skeleton className="h-10 w-10 rounded-full animate-shimmer" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32 animate-shimmer" />
                      <Skeleton className="h-3 w-48 animate-shimmer" />
                    </div>
                    <Skeleton className="h-6 w-16 rounded-full animate-shimmer" />
                  </div>
                ))}
              </div>
            ) : members.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mb-4">
                  <Users className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold">No members yet</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Invite team members to collaborate in this workspace
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {members.map((member) => (
                  <div 
                    key={member._id}
                    className="flex items-center gap-4 p-4 rounded-xl bg-muted/30 border border-border/30 hover:bg-muted/50 transition-colors"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={member.userAvatarUrl} alt={member.userName} />
                      <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                        {getInitials(member.userName)}
                      </AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground truncate">{member.userName}</p>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{member.userEmail}</p>
                    </div>
                    
                    <Badge variant={getRoleBadgeVariant(member.role)} className="rounded-full capitalize gap-1">
                      {getRoleIcon(member.role)}
                      {member.role}
                    </Badge>
                    
                    {/* Actions dropdown - only show for non-owners and if current user is admin/owner */}
                    {member.role !== "owner" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-xl">
                          <DropdownMenuItem 
                            className="rounded-lg"
                            onClick={() => toast.success("Role updated")}
                          >
                            <UserCog className="h-4 w-4 mr-2" />
                            Change Role
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="rounded-lg text-destructive focus:text-destructive"
                            onClick={() => setMemberToRemove({ id: member._id, name: member.userName })}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
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
        
        {/* Pending Invitations */}
        <Card className="border-border/50 shadow-sm mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Pending Invitations
            </CardTitle>
            <CardDescription>
              Invitations that haven&apos;t been accepted yet
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-sm text-muted-foreground">
                No pending invitations
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Remove member confirmation */}
      <AlertDialog open={!!memberToRemove} onOpenChange={(open) => !open && setMemberToRemove(null)}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-destructive/10">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <AlertDialogTitle className="text-lg">Remove Member</AlertDialogTitle>
                <AlertDialogDescription className="mt-1">
                  This action cannot be undone.
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <div className="py-4 px-1">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to remove{" "}
              <span className="font-semibold text-foreground">{memberToRemove?.name}</span>{" "}
              from this workspace? They will lose access to all workspace data and will need to be re-invited.
            </p>
          </div>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel disabled={isRemoving} className="rounded-lg">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setIsRemoving(true);
                // Simulate removal - replace with actual mutation
                await new Promise(resolve => setTimeout(resolve, 500));
                toast.success("Member removed", { description: `${memberToRemove?.name} has been removed from the workspace` });
                setMemberToRemove(null);
                setIsRemoving(false);
              }}
              disabled={isRemoving}
              className="bg-destructive text-white hover:bg-destructive/90 rounded-lg gap-2"
            >
              {isRemoving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {isRemoving ? "Removing..." : "Remove Member"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
