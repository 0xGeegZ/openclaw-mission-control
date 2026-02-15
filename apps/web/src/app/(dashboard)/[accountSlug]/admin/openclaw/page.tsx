"use client";

import { use, useState, useEffect } from "react";
import { useMutation, useAction } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
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
import { Badge } from "@packages/ui/components/badge";
import { Skeleton } from "@packages/ui/components/skeleton";
import { Separator } from "@packages/ui/components/separator";
import {
  Cpu,
  Server,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Settings2,
  Activity,
  Zap,
  Shield,
  Save,
  KeyRound,
  Copy,
  Check,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@packages/ui/components/tabs";
import { toast } from "sonner";
import { cn } from "@packages/ui/lib/utils";
import {
  AVAILABLE_MODELS,
  DEFAULT_OPENCLAW_CONFIG,
  RUNTIME_STATUS,
} from "@packages/shared";

/** Union of allowed model values for the default model selector. */
type DefaultModelValue = (typeof AVAILABLE_MODELS)[number]["value"];

interface OpenClawPageProps {
  params: Promise<{ accountSlug: string }>;
}

/**
 * Admin page for managing OpenClaw runtime configuration.
 * Only accessible to admin and owner roles.
 */
const DEFAULT_MODEL = DEFAULT_OPENCLAW_CONFIG.model;
const DEFAULT_TEMPERATURE = DEFAULT_OPENCLAW_CONFIG.temperature;
const DEFAULT_MAX_TOKENS = DEFAULT_OPENCLAW_CONFIG.maxTokens ?? 4096;
const DEFAULT_MAX_HISTORY =
  DEFAULT_OPENCLAW_CONFIG.contextConfig.maxHistoryMessages;

/**
 * Resolve a provider label for a given model value.
 */
function getModelProviderLabel(modelValue: string): string {
  if (modelValue.startsWith("claude-")) return "Anthropic";
  if (modelValue.startsWith("gpt-")) return "OpenAI";
  return "Other";
}

export default function OpenClawPage({ params }: OpenClawPageProps) {
  use(params);
  const { account, accountId, isLoading, isAdmin } = useAccount();
  const updateAccount = useMutation(api.accounts.update);
  const requestRestart = useMutation(api.accounts.requestRestart);
  const provisionServiceToken = useAction(
    api.service.actions.provisionServiceToken,
  );
  const syncServiceToken = useAction(api.service.actions.syncServiceToken);

  const runtimeStatus = account?.runtimeStatus;
  const runtimeConfig = account?.runtimeConfig;
  const agentDefaults = (
    account as {
      settings?: {
        agentDefaults?: {
          model?: string;
          temperature?: number;
          maxTokens?: number;
          maxHistoryMessages?: number;
          behaviorFlags?: {
            canCreateTasks?: boolean;
            canModifyTaskStatus?: boolean;
            canCreateDocuments?: boolean;
            canMentionAgents?: boolean;
          };
          rateLimits?: { requestsPerMinute?: number; tokensPerDay?: number };
        };
      };
    }
  )?.settings?.agentDefaults;

  const [selectedModel, setSelectedModel] =
    useState<DefaultModelValue>(DEFAULT_MODEL);
  const [temperature, setTemperature] = useState(String(DEFAULT_TEMPERATURE));
  const [maxTokens, setMaxTokens] = useState(String(DEFAULT_MAX_TOKENS));
  const [maxHistoryMessages, setMaxHistoryMessages] = useState(
    String(DEFAULT_MAX_HISTORY),
  );
  const [behaviorFlags, setBehaviorFlags] = useState({
    canCreateTasks: false,
    canModifyTaskStatus: true,
    canCreateDocuments: true,
    canMentionAgents: true,
  });
  const [rateRpm, setRateRpm] = useState("20");
  const [rateTpd, setRateTpd] = useState("100000");
  const [isSaving, setIsSaving] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [isGeneratingToken, setIsGeneratingToken] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [existingToken, setExistingToken] = useState("");
  const [isSyncingToken, setIsSyncingToken] = useState(false);

  useEffect(() => {
    if (!agentDefaults) return;
    if (agentDefaults.model) {
      const normalizedModel = String(agentDefaults.model).trim();
      if (AVAILABLE_MODELS.some((model) => model.value === normalizedModel)) {
        setSelectedModel(normalizedModel as DefaultModelValue);
      } else {
        setSelectedModel(DEFAULT_MODEL);
      }
    }
    if (agentDefaults.temperature != null)
      setTemperature(String(agentDefaults.temperature));
    if (agentDefaults.maxTokens != null)
      setMaxTokens(String(agentDefaults.maxTokens));
    if (agentDefaults.maxHistoryMessages != null)
      setMaxHistoryMessages(String(agentDefaults.maxHistoryMessages));
    if (agentDefaults.behaviorFlags)
      setBehaviorFlags((prev) => ({ ...prev, ...agentDefaults.behaviorFlags }));
    if (agentDefaults.rateLimits?.requestsPerMinute != null)
      setRateRpm(String(agentDefaults.rateLimits.requestsPerMinute));
    if (agentDefaults.rateLimits?.tokensPerDay != null)
      setRateTpd(String(agentDefaults.rateLimits.tokensPerDay));
  }, [agentDefaults]);

  const getStatusIcon = (status: string | undefined) => {
    switch (status) {
      case RUNTIME_STATUS.ONLINE:
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case RUNTIME_STATUS.DEGRADED:
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case RUNTIME_STATUS.OFFLINE:
      case RUNTIME_STATUS.ERROR:
        return <XCircle className="h-4 w-4 text-red-500" />;
      case RUNTIME_STATUS.PROVISIONING:
        return <Clock className="h-4 w-4 text-blue-500 animate-pulse" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string | undefined) => {
    const variants: Record<
      string,
      "default" | "secondary" | "destructive" | "outline"
    > = {
      [RUNTIME_STATUS.ONLINE]: "default",
      [RUNTIME_STATUS.DEGRADED]: "secondary",
      [RUNTIME_STATUS.OFFLINE]: "destructive",
      [RUNTIME_STATUS.ERROR]: "destructive",
      [RUNTIME_STATUS.PROVISIONING]: "outline",
    };
    return variants[status || ""] || "outline";
  };

  // Show loader while checking permissions
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-muted mb-5">
          <RefreshCw className="h-10 w-10 text-muted-foreground animate-spin" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">Loading...</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-md text-center">
          Checking your permissions...
        </p>
      </div>
    );
  }

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
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              OpenClaw Configuration
            </h1>
            <Badge variant="secondary" className="rounded-full">
              <Shield className="h-3 w-3 mr-1" />
              Admin
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage your OpenClaw runtime and agent defaults
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="border-border/50">
                <CardHeader>
                  <Skeleton className="h-5 w-32 animate-shimmer" />
                  <Skeleton className="h-4 w-48 animate-shimmer" />
                </CardHeader>
                <CardContent className="space-y-4">
                  <Skeleton className="h-10 w-full animate-shimmer" />
                  <Skeleton className="h-10 w-full animate-shimmer" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <>
            {/* Runtime Status Section */}
            <div className="grid gap-6 md:grid-cols-3">
              <Card className="border-border/50 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Server className="h-4 w-4 text-primary" />
                    Runtime Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    {getStatusIcon(runtimeStatus)}
                    <div>
                      <Badge
                        variant={getStatusBadge(runtimeStatus)}
                        className="capitalize"
                      >
                        {runtimeStatus || "Unknown"}
                      </Badge>
                    </div>
                  </div>
                  {runtimeConfig?.lastHealthCheck && (
                    <p className="text-xs text-muted-foreground mt-3">
                      Last health check:{" "}
                      {new Date(runtimeConfig.lastHealthCheck).toLocaleString()}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/50 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-primary" />
                    OpenClaw Version
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <code className="text-sm bg-muted px-2 py-1 rounded-md">
                      {runtimeConfig?.openclawVersion || "Not configured"}
                    </code>
                  </div>
                  {runtimeConfig?.lastUpgradeAt && (
                    <p className="text-xs text-muted-foreground mt-3">
                      Last upgrade:{" "}
                      {new Date(
                        runtimeConfig.lastUpgradeAt,
                      ).toLocaleDateString()}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/50 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    Runtime Service
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <code className="text-sm bg-muted px-2 py-1 rounded-md">
                      {runtimeConfig?.runtimeServiceVersion || "Not deployed"}
                    </code>
                  </div>
                  {runtimeConfig?.ipAddress && (
                    <p className="text-xs text-muted-foreground mt-3">
                      IP: {runtimeConfig.ipAddress}
                      {runtimeConfig.region && ` (${runtimeConfig.region})`}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Configuration Tabs */}
            <Tabs defaultValue="defaults" className="space-y-6">
              <TabsList className="bg-muted/50">
                <TabsTrigger value="defaults" className="rounded-lg">
                  <Settings2 className="h-4 w-4 mr-2" />
                  Agent Defaults
                </TabsTrigger>
                <TabsTrigger value="models" className="rounded-lg">
                  <Cpu className="h-4 w-4 mr-2" />
                  Model Settings
                </TabsTrigger>
                <TabsTrigger value="advanced" className="rounded-lg">
                  <Zap className="h-4 w-4 mr-2" />
                  Advanced
                </TabsTrigger>
              </TabsList>

              <TabsContent value="defaults" className="space-y-6">
                <Card className="border-border/50 shadow-sm">
                  <CardHeader>
                    <CardTitle>Default Agent Configuration</CardTitle>
                    <CardDescription>
                      These settings will be applied to new agents by default.
                      Existing agents retain their individual configurations.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid gap-6 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="default-model">Default Model</Label>
                        <Select
                          value={selectedModel}
                          onValueChange={(value) =>
                            setSelectedModel(value as DefaultModelValue)
                          }
                        >
                          <SelectTrigger
                            id="default-model"
                            className="rounded-xl"
                          >
                            <SelectValue placeholder="Select model" />
                          </SelectTrigger>
                          <SelectContent>
                            {AVAILABLE_MODELS.map((model) => (
                              <SelectItem key={model.value} value={model.value}>
                                {model.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          The LLM model used for agent responses
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="default-temperature">Temperature</Label>
                        <Input
                          id="default-temperature"
                          type="number"
                          min="0"
                          max="2"
                          step="0.1"
                          value={temperature}
                          onChange={(e) => setTemperature(e.target.value)}
                          className="rounded-xl"
                        />
                        <p className="text-xs text-muted-foreground">
                          Controls randomness (0.0 = focused, 2.0 = creative)
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="default-max-tokens">Max Tokens</Label>
                        <Input
                          id="default-max-tokens"
                          type="number"
                          min="256"
                          max="32000"
                          step="256"
                          value={maxTokens}
                          onChange={(e) => setMaxTokens(e.target.value)}
                          className="rounded-xl"
                        />
                        <p className="text-xs text-muted-foreground">
                          Maximum tokens in agent responses
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="default-history">
                          Max History Messages
                        </Label>
                        <Input
                          id="default-history"
                          type="number"
                          min="5"
                          max="100"
                          value={maxHistoryMessages}
                          onChange={(e) =>
                            setMaxHistoryMessages(e.target.value)
                          }
                          className="rounded-xl"
                        />
                        <p className="text-xs text-muted-foreground">
                          Conversation history included in context
                        </p>
                      </div>
                    </div>

                    <Separator />

                    <div className="flex justify-end">
                      <Button
                        className="rounded-xl shadow-sm"
                        disabled={!accountId || isSaving}
                        onClick={async () => {
                          if (!accountId) return;
                          setIsSaving(true);
                          try {
                            await updateAccount({
                              accountId,
                              settings: {
                                agentDefaults: {
                                  model: selectedModel,
                                  temperature:
                                    parseFloat(temperature) ||
                                    DEFAULT_TEMPERATURE,
                                  maxTokens:
                                    parseInt(maxTokens, 10) ||
                                    DEFAULT_MAX_TOKENS,
                                  maxHistoryMessages:
                                    parseInt(maxHistoryMessages, 10) ||
                                    DEFAULT_MAX_HISTORY,
                                  behaviorFlags,
                                  rateLimits: {
                                    requestsPerMinute:
                                      parseInt(rateRpm, 10) || 20,
                                    tokensPerDay:
                                      parseInt(rateTpd, 10) || 100000,
                                  },
                                },
                              },
                            });
                            toast.success("Configuration saved", {
                              description:
                                "Default agent settings have been updated.",
                            });
                          } catch (e) {
                            toast.error("Failed to save", {
                              description:
                                e instanceof Error
                                  ? e.message
                                  : "Unknown error",
                            });
                          } finally {
                            setIsSaving(false);
                          }
                        }}
                      >
                        <Save className="h-4 w-4 mr-2" />
                        {isSaving ? "Saving…" : "Save Defaults"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/50 shadow-sm">
                  <CardHeader>
                    <CardTitle>Behavior Flags</CardTitle>
                    <CardDescription>
                      Control what actions agents can perform by default. These
                      are account-level defaults; individual agents can override
                      them on their detail page.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2">
                      {[
                        {
                          id: "create-tasks",
                          key: "canCreateTasks" as const,
                          label: "Can Create Tasks",
                          description: "Allow agents to create new tasks",
                        },
                        {
                          id: "modify-status",
                          key: "canModifyTaskStatus" as const,
                          label: "Can Modify Task Status",
                          description: "Allow agents to change task statuses",
                        },
                        {
                          id: "create-docs",
                          key: "canCreateDocuments" as const,
                          label: "Can Create Documents",
                          description: "Allow agents to create documents",
                        },
                        {
                          id: "mention-agents",
                          key: "canMentionAgents" as const,
                          label: "Can Mention Agents",
                          description: "Allow agents to mention other agents",
                        },
                      ].map((flag) => (
                        <div
                          key={flag.id}
                          className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border/30"
                        >
                          <input
                            type="checkbox"
                            id={flag.id}
                            checked={behaviorFlags[flag.key]}
                            onChange={(e) =>
                              setBehaviorFlags((prev) => ({
                                ...prev,
                                [flag.key]: e.target.checked,
                              }))
                            }
                            className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                          />
                          <div>
                            <Label
                              htmlFor={flag.id}
                              className="font-medium cursor-pointer"
                            >
                              {flag.label}
                            </Label>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {flag.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    <Separator />

                    <div className="flex justify-end">
                      <Button
                        className="rounded-xl shadow-sm"
                        disabled={!accountId || isSaving}
                        onClick={async () => {
                          if (!accountId) return;
                          setIsSaving(true);
                          try {
                            await updateAccount({
                              accountId,
                              settings: {
                                agentDefaults: {
                                  model: selectedModel,
                                  temperature:
                                    parseFloat(temperature) ||
                                    DEFAULT_TEMPERATURE,
                                  maxTokens:
                                    parseInt(maxTokens, 10) ||
                                    DEFAULT_MAX_TOKENS,
                                  maxHistoryMessages:
                                    parseInt(maxHistoryMessages, 10) ||
                                    DEFAULT_MAX_HISTORY,
                                  behaviorFlags,
                                  rateLimits: {
                                    requestsPerMinute:
                                      parseInt(rateRpm, 10) || 20,
                                    tokensPerDay:
                                      parseInt(rateTpd, 10) || 100000,
                                  },
                                },
                              },
                            });
                            toast.success("Behavior flags saved", {
                              description:
                                "Default behavior flags have been updated.",
                            });
                          } catch (e) {
                            toast.error("Failed to save", {
                              description:
                                e instanceof Error
                                  ? e.message
                                  : "Unknown error",
                            });
                          } finally {
                            setIsSaving(false);
                          }
                        }}
                      >
                        <Save className="h-4 w-4 mr-2" />
                        {isSaving ? "Saving..." : "Save Behavior Flags"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="models" className="space-y-6">
                <Card className="border-border/50 shadow-sm">
                  <CardHeader>
                    <CardTitle>Available Models</CardTitle>
                    <CardDescription>
                      Configure which models are available for agents in your
                      workspace
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {AVAILABLE_MODELS.map((model) => {
                        const provider = getModelProviderLabel(model.value);
                        const isRecommended = model.value === DEFAULT_MODEL;
                        return (
                          <div
                            key={model.value}
                            className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border/30"
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                defaultChecked
                                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                              />
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">
                                    {model.label}
                                  </span>
                                  {isRecommended && (
                                    <Badge
                                      variant="secondary"
                                      className="text-xs"
                                    >
                                      Recommended
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {provider}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="advanced" className="space-y-6">
                <Card className="border-border/50 shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <KeyRound className="h-4 w-4 text-primary" />
                      Runtime service token
                    </CardTitle>
                    <CardDescription>
                      Used by the LobsterControl runtime to
                      authenticate with Convex. Add it to{" "}
                      <code className="text-xs bg-muted px-1 rounded">
                        apps/runtime/.env
                      </code>{" "}
                      as{" "}
                      <code className="text-xs bg-muted px-1 rounded">
                        SERVICE_TOKEN=...
                      </code>
                      . Generating a new token invalidates the previous one.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-4">
                      {generatedToken ? (
                        <>
                          <div className="flex gap-2">
                            <Input
                              readOnly
                              value={generatedToken}
                              className="font-mono text-sm rounded-xl bg-muted/50"
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              className="rounded-xl shrink-0"
                              onClick={() => {
                                void navigator.clipboard.writeText(
                                  generatedToken,
                                );
                                setTokenCopied(true);
                                setTimeout(() => setTokenCopied(false), 2000);
                              }}
                            >
                              {tokenCopied ? (
                                <Check className="h-4 w-4 text-green-500" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                          <p className="text-xs text-amber-600 dark:text-amber-500">
                            Copy this token now; it will not be shown again. Any
                            runtime using an old token will stop working.
                          </p>
                          <Button
                            variant="secondary"
                            className="rounded-xl"
                            onClick={() => setGeneratedToken(null)}
                          >
                            Dismiss
                          </Button>
                        </>
                      ) : (
                        <Button
                          className="rounded-xl"
                          disabled={!accountId || isGeneratingToken}
                          onClick={async () => {
                            if (!accountId) return;
                            setIsGeneratingToken(true);
                            setGeneratedToken(null);
                            try {
                              const { token } = await provisionServiceToken({
                                accountId,
                              });
                              setGeneratedToken(token);
                              toast.success("Token generated", {
                                description:
                                  "Copy it to your runtime .env as SERVICE_TOKEN.",
                              });
                            } catch (e) {
                              toast.error("Failed to generate token", {
                                description:
                                  e instanceof Error
                                    ? e.message
                                    : "Unknown error",
                              });
                            } finally {
                              setIsGeneratingToken(false);
                            }
                          }}
                        >
                          <KeyRound
                            className={cn(
                              "h-4 w-4 mr-2",
                              isGeneratingToken && "animate-pulse",
                            )}
                          />
                          {isGeneratingToken
                            ? "Generating…"
                            : "Generate service token"}
                        </Button>
                      )}
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <Label htmlFor="existing-service-token">
                        Use existing token
                      </Label>
                      <Input
                        id="existing-service-token"
                        value={existingToken}
                        onChange={(event) =>
                          setExistingToken(event.target.value)
                        }
                        placeholder="mc_service_{accountId}_{secret}"
                        className="font-mono text-sm rounded-xl"
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          className="rounded-xl"
                          disabled={
                            !accountId ||
                            isSyncingToken ||
                            !existingToken.trim()
                          }
                          onClick={async () => {
                            if (!accountId || !existingToken.trim()) return;
                            setIsSyncingToken(true);
                            try {
                              await syncServiceToken({
                                accountId,
                                serviceToken: existingToken,
                              });
                              toast.success("Token synced", {
                                description:
                                  "Convex now accepts the token in your runtime .env.",
                              });
                              setExistingToken("");
                            } catch (e) {
                              toast.error("Failed to sync token", {
                                description:
                                  e instanceof Error
                                    ? e.message
                                    : "Unknown error",
                              });
                            } finally {
                              setIsSyncingToken(false);
                            }
                          }}
                        >
                          {isSyncingToken ? "Syncing…" : "Sync token"}
                        </Button>
                        <Button
                          variant="outline"
                          className="rounded-xl"
                          disabled={!existingToken.trim()}
                          onClick={() => setExistingToken("")}
                        >
                          Clear
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Syncing stores only the token hash in Convex. The
                        plaintext token is not saved.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/50 shadow-sm">
                  <CardHeader>
                    <CardTitle>Rate Limiting</CardTitle>
                    <CardDescription>
                      Configure rate limits to control API usage and costs
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid gap-6 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="rate-rpm">
                          Requests Per Minute (per agent)
                        </Label>
                        <Input
                          id="rate-rpm"
                          type="number"
                          min="1"
                          max="100"
                          value={rateRpm}
                          onChange={(e) => setRateRpm(e.target.value)}
                          className="rounded-xl"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="rate-tpd">
                          Tokens Per Day (per agent)
                        </Label>
                        <Input
                          id="rate-tpd"
                          type="number"
                          min="1000"
                          max="10000000"
                          value={rateTpd}
                          onChange={(e) => setRateTpd(e.target.value)}
                          className="rounded-xl"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/50 shadow-sm border-destructive/30">
                  <CardHeader>
                    <CardTitle className="text-destructive">
                      Danger Zone
                    </CardTitle>
                    <CardDescription>
                      These actions can affect your runtime and all agents
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-xl border border-border/50">
                      <div>
                        <p className="font-medium">Restart Runtime</p>
                        <p className="text-sm text-muted-foreground">
                          Restart the OpenClaw runtime service. This will
                          briefly interrupt agent operations.
                        </p>
                      </div>
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
                              description:
                                "The runtime will restart when it polls next.",
                            });
                          } catch (e) {
                            toast.error("Failed to request restart", {
                              description:
                                e instanceof Error
                                  ? e.message
                                  : "Unknown error",
                            });
                          } finally {
                            setIsRestarting(false);
                          }
                        }}
                      >
                        <RefreshCw
                          className={cn(
                            "h-4 w-4 mr-2",
                            isRestarting && "animate-spin",
                          )}
                        />
                        {isRestarting ? "Requesting…" : "Restart"}
                      </Button>
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-xl border border-destructive/30 bg-destructive/5">
                      <div>
                        <p className="font-medium">Reset All Agent Configs</p>
                        <p className="text-sm text-muted-foreground">
                          Reset all agents to use default configuration. This
                          cannot be undone.
                        </p>
                      </div>
                      <Button variant="destructive" className="rounded-xl">
                        Reset All
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
}
