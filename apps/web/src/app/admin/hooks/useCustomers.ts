import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export interface Customer {
  id: Id<"accounts">;
  name: string;
  email: string;
  plan: "free" | "pro" | "enterprise";
  createdAt: number;
  memberCount?: number;
}

export interface UseCustomersResult {
  customers: Customer[];
  loading: boolean;
  error?: Error;
  refetch: () => void;
}

export interface UseCreateCustomerResult {
  createCustomer: (email: string, name: string, plan?: "free" | "pro" | "enterprise") => Promise<void>;
  loading: boolean;
  error?: Error;
}

/**
 * List all customers for an account.
 */
export const useCustomers = (accountId: Id<"accounts">) => {
  const result = useQuery(api.admin_customers.list_customers, {
    accountId,
    limit: 50,
  });

  return {
    customers: result?.accounts ?? [],
    loading: result === undefined,
    error: result === null ? new Error("Failed to fetch customers") : undefined,
    refetch: () => {
      // Convex will auto-refetch on dependency change
    },
  };
};

/**
 * Get a single customer by ID.
 */
export const useCustomer = (
  accountId: Id<"accounts">,
  customerId: Id<"accounts">
) => {
  const result = useQuery(api.admin_customers.get_customer, {
    accountId,
    customerId,
  });

  return {
    customer: result,
    loading: result === undefined,
    error: result === null ? new Error("Failed to fetch customer") : undefined,
  };
};

/**
 * Create a new customer.
 */
export const useCreateCustomer = (accountId: Id<"accounts">) => {
  const mutation = useMutation(api.admin_customers.create_customer);

  return {
    createCustomer: async (
      email: string,
      name: string,
      plan?: "free" | "pro" | "enterprise"
    ) => {
      await mutation({
        accountId,
        email,
        name,
        plan,
      });
    },
    loading: mutation.isLoading,
    error: mutation.error,
  };
};

/**
 * Update a customer.
 */
export const useUpdateCustomer = (accountId: Id<"accounts">) => {
  const mutation = useMutation(api.admin_customers.update_customer);

  return {
    updateCustomer: async (
      customerId: Id<"accounts">,
      name?: string,
      plan?: "free" | "pro" | "enterprise"
    ) => {
      await mutation({
        accountId,
        customerId,
        name,
        plan,
      });
    },
    loading: mutation.isLoading,
    error: mutation.error,
  };
};

/**
 * Delete a customer.
 */
export const useDeleteCustomer = (accountId: Id<"accounts">) => {
  const mutation = useMutation(api.admin_customers.delete_customer);

  return {
    deleteCustomer: async (customerId: Id<"accounts">) => {
      await mutation({
        accountId,
        customerId,
      });
    },
    loading: mutation.isLoading,
    error: mutation.error,
  };
};
