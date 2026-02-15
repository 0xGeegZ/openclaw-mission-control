import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export interface Container {
  id: Id<"containers">;
  name: string;
  imageTag: string;
  status: "provisioning" | "running" | "stopped" | "degraded";
  config?: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

/**
 * List all containers for an account.
 */
export const useContainers = (
  accountId: Id<"accounts">,
  status?: Container["status"]
) => {
  const result = useQuery(api.admin_containers.list_containers, {
    accountId,
    limit: 50,
    status,
  });

  return {
    containers: result?.containers ?? [],
    loading: result === undefined,
    error: result === null ? new Error("Failed to fetch containers") : undefined,
  };
};

/**
 * Get a single container by ID.
 */
export const useContainer = (
  accountId: Id<"accounts">,
  containerId: Id<"containers">
) => {
  const result = useQuery(api.admin_containers.get_container, {
    accountId,
    containerId,
  });

  return {
    container: result,
    loading: result === undefined,
    error: result === null ? new Error("Failed to fetch container") : undefined,
  };
};

/**
 * Start a container.
 */
export const useStartContainer = (accountId: Id<"accounts">) => {
  const mutation = useMutation(api.admin_containers.start_container);

  return {
    startContainer: async (containerId: Id<"containers">) => {
      await mutation({ accountId, containerId });
    },
    loading: mutation.isLoading,
    error: mutation.error,
  };
};

/**
 * Stop a container.
 */
export const useStopContainer = (accountId: Id<"accounts">) => {
  const mutation = useMutation(api.admin_containers.stop_container);

  return {
    stopContainer: async (containerId: Id<"containers">) => {
      await mutation({ accountId, containerId });
    },
    loading: mutation.isLoading,
    error: mutation.error,
  };
};

/**
 * Restart a container.
 */
export const useRestartContainer = (accountId: Id<"accounts">) => {
  const mutation = useMutation(api.admin_containers.restart_container);

  return {
    restartContainer: async (containerId: Id<"containers">) => {
      await mutation({ accountId, containerId });
    },
    loading: mutation.isLoading,
    error: mutation.error,
  };
};

/**
 * Delete a container.
 */
export const useDeleteContainer = (accountId: Id<"accounts">) => {
  const mutation = useMutation(api.admin_containers.delete_container);

  return {
    deleteContainer: async (containerId: Id<"containers">) => {
      await mutation({ accountId, containerId });
    },
    loading: mutation.isLoading,
    error: mutation.error,
  };
};

/**
 * Bulk restart containers for an account.
 */
export const useBulkRestartContainers = (accountId: Id<"accounts">) => {
  const mutation = useMutation(api.admin_containers.bulk_restart_containers);

  return {
    bulkRestartContainers: async (containerIds?: Id<"containers">[]) => {
      await mutation({
        accountId,
        containerIds,
      });
    },
    loading: mutation.isLoading,
    error: mutation.error,
  };
};
