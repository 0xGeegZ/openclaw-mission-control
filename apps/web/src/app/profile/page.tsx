"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { UserProfile } from "@clerk/nextjs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@packages/ui/components/card";
import { Label } from "@packages/ui/components/label";
import { Switch } from "@packages/ui/components/switch";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/select";
import { Skeleton } from "@packages/ui/components/skeleton";
import { Bell, Palette, Lock } from "lucide-react";

/**
 * Global user profile page at /profile.
 * Uses Clerk's <UserProfile /> component for identity management (password, avatar, connected accounts).
 * Adds custom preferences section for theme and notification defaults.
 */
export default function ProfilePage() {
  const { user, isLoaded } = useUser();
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [preferences, setPreferences] = useState({
    emailNotifications: true,
    taskUpdates: true,
    agentActivity: true,
    memberUpdates: true,
  });
  const [isLoadingPrefs, setIsLoadingPrefs] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);

  // Load preferences from localStorage (temp storage until backend is ready)
  useEffect(() => {
    const savedTheme = localStorage.getItem("userTheme") as "light" | "dark" | "system" | null;
    const savedPrefs = localStorage.getItem("userNotificationPrefs");

    if (savedTheme) {
      setTheme(savedTheme);
    }

    if (savedPrefs) {
      try {
        setPreferences(JSON.parse(savedPrefs));
      } catch (e) {
        console.error("Failed to parse saved preferences:", e);
      }
    }

    setIsLoadingPrefs(false);
  }, []);

  // Save preferences to localStorage whenever they change
  useEffect(() => {
    if (hasChanges && !isLoadingPrefs) {
      localStorage.setItem("userTheme", theme);
      localStorage.setItem("userNotificationPrefs", JSON.stringify(preferences));
    }
  }, [theme, preferences, hasChanges, isLoadingPrefs]);

  const handleThemeChange = (value: "light" | "dark" | "system") => {
    setTheme(value);
    setHasChanges(true);
  };

  const handlePreferenceChange = (key: keyof typeof preferences, value: boolean) => {
    setPreferences((prev) => ({
      ...prev,
      [key]: value,
    }));
    setHasChanges(true);
  };

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Skeleton className="h-96 w-full max-w-2xl" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Not authenticated</h1>
          <p className="text-muted-foreground">Please sign in to view your profile.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="flex flex-col h-full">
        {/* Header */}
        <header className="px-6 py-4 border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your account settings and preferences
            </p>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-3xl space-y-6">
            {/* Clerk User Profile Component */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Account
                </CardTitle>
                <CardDescription>
                  Manage your identity, password, and connected accounts
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-muted/30 rounded-lg p-4 overflow-auto">
                  <div className="min-h-96">
                    <UserProfile
                      appearance={{
                        elements: {
                          rootBox: "w-full",
                          card: "bg-transparent shadow-none border-none",
                          navbar: "hidden",
                          navbarButton: "hidden",
                          profilePage: "px-0",
                        },
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Theme Preference */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Palette className="h-4 w-4" />
                  Appearance
                </CardTitle>
                <CardDescription>
                  Customize how the interface looks
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="theme-select" className="text-base font-medium">
                        Theme
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        Choose your preferred color scheme
                      </p>
                    </div>
                    {isLoadingPrefs ? (
                      <Skeleton className="h-10 w-32" />
                    ) : (
                      <Select value={theme} onValueChange={handleThemeChange}>
                        <SelectTrigger id="theme-select" className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="light">Light</SelectItem>
                          <SelectItem value="dark">Dark</SelectItem>
                          <SelectItem value="system">System</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Notification Preferences */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  Notifications
                </CardTitle>
                <CardDescription>
                  Control which notifications you receive
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {isLoadingPrefs ? (
                    <>
                      <Skeleton className="h-6 w-full" />
                      <Skeleton className="h-6 w-full" />
                      <Skeleton className="h-6 w-full" />
                      <Skeleton className="h-6 w-full" />
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-base font-medium cursor-pointer">
                            Email Notifications
                          </Label>
                          <p className="text-sm text-muted-foreground">
                            Receive email digests and important updates
                          </p>
                        </div>
                        <Switch
                          checked={preferences.emailNotifications}
                          onCheckedChange={(checked) =>
                            handlePreferenceChange("emailNotifications", checked)
                          }
                        />
                      </div>

                      <div className="border-t pt-4">
                        <h4 className="text-sm font-semibold mb-3">Notification Types</h4>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label className="text-sm cursor-pointer">
                                Task Updates
                              </Label>
                              <p className="text-xs text-muted-foreground">
                                When tasks are created, assigned, or status changes
                              </p>
                            </div>
                            <Switch
                              checked={preferences.taskUpdates}
                              onCheckedChange={(checked) =>
                                handlePreferenceChange("taskUpdates", checked)
                              }
                            />
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label className="text-sm cursor-pointer">
                                Agent Activity
                              </Label>
                              <p className="text-xs text-muted-foreground">
                                When agents report status or complete work
                              </p>
                            </div>
                            <Switch
                              checked={preferences.agentActivity}
                              onCheckedChange={(checked) =>
                                handlePreferenceChange("agentActivity", checked)
                              }
                            />
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label className="text-sm cursor-pointer">
                                Member Updates
                              </Label>
                              <p className="text-xs text-muted-foreground">
                                When team members are added or roles change
                              </p>
                            </div>
                            <Switch
                              checked={preferences.memberUpdates}
                              onCheckedChange={(checked) =>
                                handlePreferenceChange("memberUpdates", checked)
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Info Message */}
            <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
              <p>
                🔒 Your preferences are saved locally and will be synced to your account once backend integration is complete.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
