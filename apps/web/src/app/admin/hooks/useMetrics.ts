import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export interface ContainerMetrics {
  containerId: Id<"containers">;
  containerName: string;
  timestamp: number;
  cpu: {
    current: number;
    avg: number;
    max: number;
    unit: string;
  };
  memory: {
    current: number;
    avg: number;
    max: number;
    unit: string;
  };
  network: {
    inbound: number;
    outbound: number;
    unit: string;
  };
  disk: {
    used: number;
    total: number;
    unit: string;
  };
  period: {
    start: number;
    end: number;
  };
}

export interface AccountMetrics {
  accountId: Id<"accounts">;
  period: "1h" | "24h" | "7d";
  timestamp: number;
  summary: {
    totalContainers: number;
    runningContainers: number;
    stoppedContainers: number;
    degradedContainers: number;
    avgCpu: number;
    avgMemory: number;
    avgUptime: number;
  };
  containers: Array<{
    containerId: Id<"containers">;
    containerName: string;
    status: string;
    cpu: number;
    memory: number;
    uptime: number;
    restarts: number;
  }>;
}

/**
 * Get metrics for a specific container.
 */
export const useContainerMetrics = (
  accountId: Id<"accounts">,
  containerId: Id<"containers">
) => {
  const result = useQuery(api.admin_metrics.get_container_metrics, {
    accountId,
    containerId,
  });

  return {
    metrics: result as ContainerMetrics | undefined,
    loading: result === undefined,
    error: result === null ? new Error("Failed to fetch container metrics") : undefined,
  };
};

/**
 * Get all metrics for an account.
 */
export const useAccountMetrics = (
  accountId: Id<"accounts">,
  period?: "1h" | "24h" | "7d"
) => {
  const result = useQuery(api.admin_metrics.list_account_metrics, {
    accountId,
    period: period ?? "24h",
  });

  return {
    metrics: result as AccountMetrics | undefined,
    loading: result === undefined,
    error: result === null ? new Error("Failed to fetch account metrics") : undefined,
  };
};

/**
 * Get usage statistics for billing purposes.
 */
export const useUsageStats = (
  accountId: Id<"accounts">,
  startDate: number,
  endDate: number
) => {
  const result = useQuery(api.admin_metrics.get_usage_stats, {
    accountId,
    startDate,
    endDate,
  });

  return {
    stats: result,
    loading: result === undefined,
    error: result === null ? new Error("Failed to fetch usage stats") : undefined,
  };
};
