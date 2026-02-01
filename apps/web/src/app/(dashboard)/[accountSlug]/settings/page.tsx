"use client";

import { use } from "react";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { useAccount } from "@/lib/hooks/useAccount";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@packages/ui/components/card";
import { Button } from "@packages/ui/components/button";
import { Input } from "@packages/ui/components/input";
import { Label } from "@packages/ui/components/label";
import { Separator } from "@packages/ui/components/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@packages/ui/components/tabs";
import { Skeleton } from "@packages/ui/components/skeleton";
import { 
  Settings, 
  Users, 
  Shield, 
  Bell, 
  Palette,
  Building2,
  CreditCard,
  Trash2,
} from "lucide-react";

interface SettingsPageProps {
  params: Promise<{ accountSlug: string }>;
}

/**
 * Settings page for workspace configuration.
 */
export default function SettingsPage({ params }: SettingsPageProps) {
  const { accountSlug } = use(params);
  const { account, isLoading } = useAccount();
  
  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-6 py-4 border-b bg-card">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your workspace settings and preferences</p>
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
            
            {/* General Settings */}
            <TabsContent value="general" className="space-y-6">
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
                          defaultValue={account?.name ?? ""} 
                          placeholder="My Workspace"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="workspace-slug">Workspace URL</Label>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">mission-control.app/</span>
                          <Input 
                            id="workspace-slug" 
                            defaultValue={accountSlug} 
                            placeholder="my-workspace"
                          />
                        </div>
                      </div>
                      <Button className="mt-4">Save Changes</Button>
                    </>
                  )}
                </CardContent>
              </Card>
              
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
                    <Button variant="destructive">Delete Workspace</Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            {/* Members */}
            <TabsContent value="members" className="space-y-6">
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
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
                      <Users className="h-7 w-7 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold">Team management coming soon</h3>
                    <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                      Invite team members and manage roles and permissions.
                    </p>
                    <Button className="mt-4" disabled>
                      Invite Members
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            {/* Notifications */}
            <TabsContent value="notifications" className="space-y-6">
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
                      <Button variant="outline" size="sm" disabled>
                        Configure
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
                      <Button variant="outline" size="sm" disabled>
                        Configure
                      </Button>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Email Notifications</p>
                        <p className="text-sm text-muted-foreground">
                          Daily digest and important updates via email
                        </p>
                      </div>
                      <Button variant="outline" size="sm" disabled>
                        Configure
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            {/* Appearance */}
            <TabsContent value="appearance" className="space-y-6">
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
            
            {/* Billing */}
            <TabsContent value="billing" className="space-y-6">
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
    </div>
  );
}
