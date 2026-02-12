"use client";

import { use, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { useAccount } from "@/lib/hooks/useAccount";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@packages/ui/components/card";
import { Button } from "@packages/ui/components/button";
import { Input } from "@packages/ui/components/input";
import { Label } from "@packages/ui/components/label";
import { Badge } from "@packages/ui/components/badge";
import { Skeleton } from "@packages/ui/components/skeleton";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/select";
import {
  Server,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Shield,
  Upload,
  RotateCcw,
  X,
  History,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@packages/ui/lib/utils";
import { RUNTIME_V2_STATUS } from "@packages/shared";

interface FleetPageProps {
  params: Promise<{ accountSlug: string }>;
}

export default function FleetPage({ params }: FleetPageProps) {
  use(params);
  const { accountId, isLoading, isAdmin } = useAccount();
  const runtime = useQuery(
    api.runtimes.getByAccount,
    accountId ? { accountId } : "skip"
  );
  const requestRestart = useMutation(api.accounts.requestRestart);
  const requestUpgrade = useMutation(api.runtimes.requestUpgrade);
  const clearUpgradeRequest = useMutation(api.runtimes.clearUpgradeRequest);
  const rollbackRuntime = useMutation(api.runtimes.rollbackRuntime);

  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [targetOpenclaw, setTargetOpenclaw] = useState("");
  const [targetRuntime, setTargetRuntime] = useState("");
  const [strategy, setStrategy] = useState<"immediate" | "rolling" | "canary">("immediate");
  const [isRestarting, setIsRestarting] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);

  const getStatusIcon = (status: string | undefined) => {
    switch (status) {
      case RUNTIME_V2_STATUS.ONLINE:
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case RUNTIME_V2_STATUS.DEGRADED:
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case RUNTIME_V2_STATUS.OFFLINE:
      case RUNTIME_V2_STATUS.ERROR:
        return <XCircle className="h-4 w-4 text-red-500" />;
      case RUNTIME_V2_STATUS.PROVISIONING:
      case RUNTIME_V2_STATUS.UPGRADING:
        return <Clock className="h-4 w-4 text-blue-500 animate-pulse" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string | undefined) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      [RUNTIME_V2_STATUS.ONLINE]: "default",
      [RUNTIME_V2_STATUS.DEGRADED]: "secondary",
      [RUNTIME_V2_STATUS.OFFLINE]: "destructive",
      [RUNTIME_V2_STATUS.ERROR]: "destructive",
      [RUNTIME_V2_STATUS.PROVISIONING]: "outline",
      [RUNTIME_V2_STATUS.UPGRADING]: "outline",
    };
    return variants[status || ""] || "outline";
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-destructive/10 mb-5">
          <Shield className="h-10 w-10 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">Access Denied</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-md text-center">
          You need admin or owner permissions to access Fleet.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 py-5 border-b border-border/50 bg-card/50 backdrop-blur-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Fleet</h1>
            <Badge variant="secondary" className="rounded-full">
              <Shield className="h-3 w-3 mr-1" />
              Admin
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Runtime status, upgrades, and rollback for this account
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="border-border/50">
              <CardHeader>
                <Skeleton className="h-5 w-32 animate-shimmer" />
                <Skeleton className="h-4 w-48 animate-shimmer" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-10 w-full animate-shimmer" />
              </CardContent>
            </Card>
          </div>
        ) : !runtime ? (
          <Card className="border-border/50">
            <CardContent className="py-12 text-center">
              <Server className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No runtime registered for this account.</p>
              <p className="text-sm text-muted-foreground mt-1">
                The runtime will appear here after the service reports health.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Runtime overview */}
            <div className="grid gap-6 md:grid-cols-3">
              <Card className="border-border/50 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Server className="h-4 w-4 text-primary" />
                    Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    {getStatusIcon(runtime.status)}
                    <Badge variant={getStatusBadge(runtime.status)} className="capitalize">
                      {runtime.status}
                    </Badge>
                  </div>
                  {runtime.lastHealthCheck != null && (
                    <p className="text-xs text-muted-foreground mt-3">
                      Last health: {new Date(runtime.lastHealthCheck).toLocaleString()}
                    </p>
                  )}
                  {runtime.healthScore != null && (
                    <p className="text-xs text-muted-foreground">
                      Health score: {runtime.healthScore}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/50 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">OpenClaw</CardTitle>
                </CardHeader>
                <CardContent>
                  <code className="text-sm bg-muted px-2 py-1 rounded-md">
                    {runtime.openclawVersion || "—"}
                  </code>
                </CardContent>
              </Card>

              <Card className="border-border/50 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Runtime Service</CardTitle>
                </CardHeader>
                <CardContent>
                  <code className="text-sm bg-muted px-2 py-1 rounded-md">
                    {runtime.runtimeServiceVersion || "—"}
                  </code>
                  {runtime.ipAddress && (
                    <p className="text-xs text-muted-foreground mt-3">
                      {runtime.ipAddress}
                      {runtime.region && ` · ${runtime.region}`}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Pending upgrade */}
            {runtime.pendingUpgrade && (
              <Card className="border-amber-500/40 bg-amber-500/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    Pending Upgrade
                  </CardTitle>
                  <CardDescription>
                    Target: OpenClaw {runtime.pendingUpgrade.targetOpenclawVersion}, Runtime{" "}
                    {runtime.pendingUpgrade.targetRuntimeVersion} · Strategy:{" "}
                    {runtime.pendingUpgrade.strategy} ·{" "}
                    {new Date(runtime.pendingUpgrade.initiatedAt).toLocaleString()}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!accountId || isClearing}
                    onClick={async () => {
                      if (!accountId) return;
                      setIsClearing(true);
                      try {
                        await clearUpgradeRequest({ accountId });
                        toast.success("Upgrade cancelled");
                        setUpgradeOpen(false);
                      } catch (e) {
                        toast.error("Failed to cancel", {
                          description: e instanceof Error ? e.message : "Unknown error",
                        });
                      } finally {
                        setIsClearing(false);
                      }
                    }}
                  >
                    <X className="h-4 w-4 mr-2" />
                    {isClearing ? "Cancelling…" : "Cancel upgrade"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Actions */}
            <Card className="border-border/50 shadow-sm">
              <CardHeader>
                <CardTitle>Actions</CardTitle>
                <CardDescription>
                  Restart runtime, request an upgrade, or rollback to a previous version.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  className="rounded-xl"
                  disabled={!accountId || isRestarting}
                  onClick={async () => {
                    if (!accountId) return;
                    setIsRestarting(true);
                    try {
                      await requestRestart({ accountId });
                      toast.success("Restart requested", {
                        description: "Runtime will restart on next health check.",
                      });
                    } catch (e) {
                      toast.error("Failed to request restart", {
                        description: e instanceof Error ? e.message : "Unknown error",
                      });
                    } finally {
                      setIsRestarting(false);
                    }
                  }}
                >
                  <RefreshCw className={cn("h-4 w-4 mr-2", isRestarting && "animate-spin")} />
                  {isRestarting ? "Requesting…" : "Restart"}
                </Button>

                <Dialog open={upgradeOpen} onOpenChange={setUpgradeOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="rounded-xl" disabled={!accountId}>
                      <Upload className="h-4 w-4 mr-2" />
                      Upgrade
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Request upgrade</DialogTitle>
                      <DialogDescription>
                        Set target versions and strategy. Immediate applies on next health check.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="target-openclaw">Target OpenClaw version</Label>
                        <Input
                          id="target-openclaw"
                          placeholder={runtime.openclawVersion ?? "e.g. v1.2.0"}
                          value={targetOpenclaw}
                          onChange={(e) => setTargetOpenclaw(e.target.value)}
                          className="rounded-xl"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="target-runtime">Target runtime service version</Label>
                        <Input
                          id="target-runtime"
                          placeholder={runtime.runtimeServiceVersion ?? "e.g. 0.2.0"}
                          value={targetRuntime}
                          onChange={(e) => setTargetRuntime(e.target.value)}
                          className="rounded-xl"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Strategy</Label>
                        <Select
                          value={strategy}
                          onValueChange={(v) => setStrategy(v as "immediate" | "rolling" | "canary")}
                        >
                          <SelectTrigger className="rounded-xl">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="immediate">Immediate</SelectItem>
                            <SelectItem value="rolling">Rolling</SelectItem>
                            <SelectItem value="canary">Canary</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setUpgradeOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        disabled={!accountId || isUpgrading || !targetRuntime.trim()}
                        onClick={async () => {
                          if (!accountId) return;
                          setIsUpgrading(true);
                          try {
                            await requestUpgrade({
                              accountId,
                              targetOpenclawVersion: targetOpenclaw.trim() || undefined,
                              targetRuntimeVersion: targetRuntime.trim(),
                              strategy,
                            });
                            toast.success("Upgrade requested");
                            setUpgradeOpen(false);
                            setTargetOpenclaw("");
                            setTargetRuntime("");
                          } catch (e) {
                            toast.error("Failed to request upgrade", {
                              description: e instanceof Error ? e.message : "Unknown error",
                            });
                          } finally {
                            setIsUpgrading(false);
                          }
                        }}
                      >
                        {isUpgrading ? "Requesting…" : "Request upgrade"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Button
                  variant="outline"
                  className="rounded-xl"
                  disabled={!accountId || isRollingBack}
                  onClick={async () => {
                    if (!accountId) return;
                    setIsRollingBack(true);
                    try {
                      await rollbackRuntime({ accountId });
                      toast.success("Rollback recorded", {
                        description: "Runtime will use previous version on next restart if configured.",
                      });
                    } catch (e) {
                      toast.error("Failed to rollback", {
                        description: e instanceof Error ? e.message : "Unknown error",
                      });
                    } finally {
                      setIsRollingBack(false);
                    }
                  }}
                >
                  <RotateCcw className={cn("h-4 w-4 mr-2", isRollingBack && "animate-spin")} />
                  {isRollingBack ? "Rolling back…" : "Rollback"}
                </Button>
              </CardContent>
            </Card>

            {/* Upgrade history */}
            {runtime.upgradeHistory && runtime.upgradeHistory.length > 0 && (
              <Card className="border-border/50 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <History className="h-4 w-4" />
                    Upgrade history
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {[...runtime.upgradeHistory].reverse().map((entry, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-2 py-2 border-b border-border/50 last:border-0"
                      >
                        <Badge
                          variant={
                            entry.status === "success"
                              ? "default"
                              : entry.status === "failed"
                                ? "destructive"
                                : "secondary"
                          }
                          className="capitalize"
                        >
                          {entry.status}
                        </Badge>
                        <span className="text-muted-foreground">
                          Runtime {entry.fromRuntimeVersion} → {entry.toRuntimeVersion}
                          {" · OpenClaw "}
                          {entry.fromOpenclawVersion} → {entry.toOpenclawVersion}
                        </span>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {new Date(entry.startedAt).toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
