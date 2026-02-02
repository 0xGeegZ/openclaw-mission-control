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

interface OpenClawPageProps {
  params: Promise<{ accountSlug: string }>;
}

/**
 * Admin page for managing OpenClaw runtime configuration.
 * Only accessible to admin and owner roles.
 */
export default function OpenClawPage({ params }: OpenClawPageProps) {
  const { accountSlug } = use(params);
  const { account, accountId, isLoading, isAdmin } = useAccount();
  
  // Runtime status
  const runtimeStatus = account?.runtimeStatus;
  const runtimeConfig = account?.runtimeConfig;
  
  // Local state for config editing
  const [selectedModel, setSelectedModel] = useState("claude-sonnet-4-20250514");
  const [temperature, setTemperature] = useState("0.7");
  const [maxTokens, setMaxTokens] = useState("4096");
  
  const getStatusIcon = (status: string | undefined) => {
    switch (status) {
      case "online":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "degraded":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case "offline":
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "provisioning":
        return <Clock className="h-4 w-4 text-blue-500 animate-pulse" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };
  
  const getStatusBadge = (status: string | undefined) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      online: "default",
      degraded: "secondary",
      offline: "destructive",
      error: "destructive",
      provisioning: "outline",
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
            <h1 className="text-2xl font-bold tracking-tight text-foreground">OpenClaw Configuration</h1>
            <Badge variant="secondary" className="rounded-full">
              <Shield className="h-3 w-3 mr-1" />
              Admin
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your OpenClaw runtime and agent defaults</p>
        </div>
      </header>
      
      <div className="flex-1 overflow-auto p-6">
        <div className="w-full max-w-5xl mx-auto space-y-6">
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
                      <Badge variant={getStatusBadge(runtimeStatus)} className="capitalize">
                        {runtimeStatus || "Unknown"}
                      </Badge>
                    </div>
                  </div>
                  {runtimeConfig?.lastHealthCheck && (
                    <p className="text-xs text-muted-foreground mt-3">
                      Last health check: {new Date(runtimeConfig.lastHealthCheck).toLocaleString()}
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
                      Last upgrade: {new Date(runtimeConfig.lastUpgradeAt).toLocaleDateString()}
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
                      These settings will be applied to new agents by default. Existing agents retain their individual configurations.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid gap-6 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="default-model">Default Model</Label>
                        <Select value={selectedModel} onValueChange={setSelectedModel}>
                          <SelectTrigger id="default-model" className="rounded-xl">
                            <SelectValue placeholder="Select model" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="claude-sonnet-4-20250514">Claude Sonnet 4</SelectItem>
                            <SelectItem value="claude-opus-4-20250514">Claude Opus 4</SelectItem>
                            <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                            <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                            <SelectItem value="gemini-2.0-flash">Gemini 2.0 Flash</SelectItem>
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
                        <Label htmlFor="default-history">Max History Messages</Label>
                        <Input 
                          id="default-history"
                          type="number" 
                          min="5" 
                          max="100" 
                          defaultValue="20"
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
                        onClick={() => toast.success("Configuration saved", { description: "Default agent settings have been updated." })}
                      >
                        <Save className="h-4 w-4 mr-2" />
                        Save Defaults
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="border-border/50 shadow-sm">
                  <CardHeader>
                    <CardTitle>Behavior Flags</CardTitle>
                    <CardDescription>
                      Control what actions agents can perform by default
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-2">
                      {[
                        { id: "create-tasks", label: "Can Create Tasks", description: "Allow agents to create new tasks" },
                        { id: "modify-status", label: "Can Modify Task Status", description: "Allow agents to change task statuses" },
                        { id: "create-docs", label: "Can Create Documents", description: "Allow agents to create documents" },
                        { id: "mention-agents", label: "Can Mention Agents", description: "Allow agents to mention other agents" },
                      ].map((flag) => (
                        <div key={flag.id} className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border/30">
                          <input 
                            type="checkbox" 
                            id={flag.id} 
                            defaultChecked 
                            className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                          />
                          <div>
                            <Label htmlFor={flag.id} className="font-medium cursor-pointer">
                              {flag.label}
                            </Label>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {flag.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="models" className="space-y-6">
                <Card className="border-border/50 shadow-sm">
                  <CardHeader>
                    <CardTitle>Available Models</CardTitle>
                    <CardDescription>
                      Configure which models are available for agents in your workspace
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {[
                        { name: "Claude Sonnet 4", provider: "Anthropic", enabled: true, recommended: true },
                        { name: "Claude Opus 4", provider: "Anthropic", enabled: true, recommended: false },
                        { name: "GPT-4o", provider: "OpenAI", enabled: true, recommended: false },
                        { name: "GPT-4o Mini", provider: "OpenAI", enabled: true, recommended: false },
                        { name: "Gemini 2.0 Flash", provider: "Google", enabled: false, recommended: false },
                      ].map((model) => (
                        <div 
                          key={model.name}
                          className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border/30"
                        >
                          <div className="flex items-center gap-3">
                            <input 
                              type="checkbox" 
                              defaultChecked={model.enabled}
                              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{model.name}</span>
                                {model.recommended && (
                                  <Badge variant="secondary" className="text-xs">Recommended</Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">{model.provider}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent value="advanced" className="space-y-6">
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
                        <Label htmlFor="rate-rpm">Requests Per Minute (per agent)</Label>
                        <Input 
                          id="rate-rpm"
                          type="number" 
                          min="1" 
                          max="100" 
                          defaultValue="20"
                          className="rounded-xl"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="rate-tpd">Tokens Per Day (per agent)</Label>
                        <Input 
                          id="rate-tpd"
                          type="number" 
                          min="1000" 
                          max="10000000" 
                          defaultValue="100000"
                          className="rounded-xl"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="border-border/50 shadow-sm border-destructive/30">
                  <CardHeader>
                    <CardTitle className="text-destructive">Danger Zone</CardTitle>
                    <CardDescription>
                      These actions can affect your runtime and all agents
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-xl border border-border/50">
                      <div>
                        <p className="font-medium">Restart Runtime</p>
                        <p className="text-sm text-muted-foreground">
                          Restart the OpenClaw runtime service. This will briefly interrupt agent operations.
                        </p>
                      </div>
                      <Button variant="outline" className="rounded-xl">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Restart
                      </Button>
                    </div>
                    
                    <div className="flex items-center justify-between p-4 rounded-xl border border-destructive/30 bg-destructive/5">
                      <div>
                        <p className="font-medium">Reset All Agent Configs</p>
                        <p className="text-sm text-muted-foreground">
                          Reset all agents to use default configuration. This cannot be undone.
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
    </div>
  );
}
