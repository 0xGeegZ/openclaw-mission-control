import { describe, it, expect } from "vitest";
import {
  upsertSubscriptionInternal,
  updateAccountPlanInternal,
  recordInvoiceInternal,
  incrementUsage,
  getSubscription,
  getCurrentUsage,
  listInvoices,
} from "./billing";
import { Id } from "./_generated/dataModel";

/**
 * Billing & Subscription Integration Tests
 *
 * Covers critical billing flows required for production:
 * - Webhook handling for subscription lifecycle
 * - Usage tracking and increments
 * - Invoice recording
 * - Plan synchronization
 */

describe("billing integration", () => {
  // ============================================================================
  // TEST 1: Webhook - Subscription Created → Account Plan Synced
  // ============================================================================
  describe("upsertSubscriptionInternal", () => {
    it("should create new subscription record", async () => {
      const accountId = "account_test123" as Id<"accounts">;
      let subscriptions: any[] = [];

      const mockCtx: any = {
        db: {
          query: (table: string) => ({
            withIndex: () => ({
              first: async () => null, // No existing subscription
            }),
          }),
          insert: async (table: string, doc: any) => {
            const newId = "sub_new_123" as Id<"billingSubscriptions">;
            subscriptions.push({ _id: newId, ...doc });
            return newId;
          },
          patch: async () => {},
        },
      };

      const result = await upsertSubscriptionInternal(mockCtx, {
        accountId,
        stripeCustomerId: "cus_test123",
        stripeSubscriptionId: "sub_test123",
        stripePriceId: "price_pro_monthly",
        plan: "pro",
        status: "active",
        currentPeriodStart: Date.now(),
        currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
        cancelAtPeriodEnd: false,
      });

      expect(result).toBeDefined();
      expect(subscriptions).toHaveLength(1);
      expect(subscriptions[0].plan).toBe("pro");
      expect(subscriptions[0].status).toBe("active");
    });

    it("should update existing subscription", async () => {
      const accountId = "account_test123" as Id<"accounts">;
      const existingSubId = "sub_existing_123" as Id<"billingSubscriptions">;
      let patchCalled = false;

      const mockCtx: any = {
        db: {
          query: (table: string) => ({
            withIndex: () => ({
              first: async () => ({
                _id: existingSubId,
                accountId,
                plan: "pro",
                status: "active",
              }),
            }),
          }),
          patch: async (id: any, updates: any) => {
            expect(id).toBe(existingSubId);
            expect(updates.plan).toBe("enterprise");
            patchCalled = true;
          },
        },
      };

      const result = await upsertSubscriptionInternal(mockCtx, {
        accountId,
        stripeCustomerId: "cus_test123",
        stripeSubscriptionId: "sub_test123",
        stripePriceId: "price_enterprise_monthly",
        plan: "enterprise",
        status: "active",
        currentPeriodStart: Date.now(),
        currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
        cancelAtPeriodEnd: false,
      });

      expect(result).toBe(existingSubId);
      expect(patchCalled).toBe(true);
    });
  });

  // ============================================================================
  // TEST 2: Account Plan Synchronization
  // ============================================================================
  describe("updateAccountPlanInternal", () => {
    it("should update account plan field", async () => {
      const accountId = "account_test123" as Id<"accounts">;
      let updatedPlan: string | null = null;

      const mockCtx: any = {
        db: {
          patch: async (id: any, updates: any) => {
            expect(id).toBe(accountId);
            updatedPlan = updates.plan;
          },
        },
      };

      await updateAccountPlanInternal(mockCtx, {
        accountId,
        plan: "pro",
      });

      expect(updatedPlan).toBe("pro");
    });

    it("should handle downgrade to free plan", async () => {
      const accountId = "account_test123" as Id<"accounts">;
      let updatedPlan: string | null = null;

      const mockCtx: any = {
        db: {
          patch: async (id: any, updates: any) => {
            updatedPlan = updates.plan;
          },
        },
      };

      await updateAccountPlanInternal(mockCtx, {
        accountId,
        plan: "free",
      });

      expect(updatedPlan).toBe("free");
    });
  });

  // ============================================================================
  // TEST 3: Usage Tracking - Increment Operations
  // ============================================================================
  describe("incrementUsage", () => {
    it("should create new usage record for current period", async () => {
      const accountId = "account_test123" as Id<"accounts">;
      let createdRecord: any = null;

      const mockCtx: any = {
        db: {
          query: (table: string) => ({
            withIndex: () => ({
              first: async () => null, // No existing record
            }),
          }),
          insert: async (table: string, doc: any) => {
            createdRecord = doc;
            return "usage_new_123" as Id<"usageRecords">;
          },
        },
      };

      await incrementUsage(mockCtx, {
        accountId,
        type: "agents",
        count: 1,
      });

      expect(createdRecord).toBeDefined();
      expect(createdRecord.agents).toBe(1);
      expect(createdRecord.tasks).toBe(0);
      expect(createdRecord.messages).toBe(0);
      expect(createdRecord.documents).toBe(0);

      // Verify period format YYYY-MM
      const now = new Date();
      const expectedPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      expect(createdRecord.period).toBe(expectedPeriod);
    });

    it("should accumulate usage on existing record", async () => {
      const accountId = "account_test123" as Id<"accounts">;
      const usageRecordId = "usage_existing_123" as Id<"usageRecords">;
      let updatedValues: any = {};

      const mockCtx: any = {
        db: {
          query: (table: string) => ({
            withIndex: () => ({
              first: async () => ({
                _id: usageRecordId,
                accountId,
                agents: 2,
                tasks: 5,
                messages: 10,
                documents: 3,
                storageBytes: 0,
              }),
            }),
          }),
          patch: async (id: any, updates: any) => {
            expect(id).toBe(usageRecordId);
            updatedValues = updates;
          },
        },
      };

      // Increment tasks count
      await incrementUsage(mockCtx, {
        accountId,
        type: "tasks",
        count: 3,
      });

      expect(updatedValues.tasks).toBe(8); // 5 + 3
    });

    it("should track storage bytes independently", async () => {
      const accountId = "account_test123" as Id<"accounts">;
      const usageRecordId = "usage_existing_123" as Id<"usageRecords">;
      let updatedValues: any = {};

      const mockCtx: any = {
        db: {
          query: (table: string) => ({
            withIndex: () => ({
              first: async () => ({
                _id: usageRecordId,
                accountId,
                agents: 0,
                tasks: 0,
                messages: 0,
                documents: 1,
                storageBytes: 500 * 1024, // 500 KB
              }),
            }),
          }),
          patch: async (id: any, updates: any) => {
            updatedValues = updates;
          },
        },
      };

      // Add another document with storage
      await incrementUsage(mockCtx, {
        accountId,
        type: "documents",
        count: 1,
        storageBytes: 1.5 * 1024 * 1024, // 1.5 MB
      });

      expect(updatedValues.documents).toBe(2);
      expect(updatedValues.storageBytes).toBe(500 * 1024 + 1.5 * 1024 * 1024);
    });

    it("should handle multiple usage types", async () => {
      const accountId = "account_test123" as Id<"accounts">;
      let createdRecord: any = null;

      const mockCtx: any = {
        db: {
          query: (table: string) => ({
            withIndex: () => ({
              first: async () => null,
            }),
          }),
          insert: async (table: string, doc: any) => {
            createdRecord = doc;
            return "usage_new_123" as Id<"usageRecords">;
          },
        },
      };

      // Test each usage type
      const types: Array<"agents" | "tasks" | "messages" | "documents"> = [
        "agents",
        "tasks",
        "messages",
        "documents",
      ];

      for (const type of types) {
        await incrementUsage(mockCtx, {
          accountId,
          type,
          count: 1,
        });
      }

      // Verify the last created record has the right structure
      expect(createdRecord).toBeDefined();
      expect(createdRecord).toHaveProperty("agents");
      expect(createdRecord).toHaveProperty("tasks");
      expect(createdRecord).toHaveProperty("messages");
      expect(createdRecord).toHaveProperty("documents");
      expect(createdRecord).toHaveProperty("storageBytes");
    });
  });

  // ============================================================================
  // TEST 4: Invoice Recording
  // ============================================================================
  describe("recordInvoiceInternal", () => {
    it("should create new invoice record", async () => {
      const accountId = "account_test123" as Id<"accounts">;
      let createdInvoice: any = null;

      const mockCtx: any = {
        db: {
          query: (table: string) => ({
            withIndex: () => ({
              first: async () => null, // No existing invoice
            }),
          }),
          insert: async (table: string, doc: any) => {
            createdInvoice = doc;
            return "invoice_new_123" as Id<"invoices">;
          },
        },
      };

      await recordInvoiceInternal(mockCtx, {
        accountId,
        stripeInvoiceId: "in_test123",
        stripeCustomerId: "cus_test123",
        amountDue: 2900, // $29.00 in cents
        amountPaid: 2900,
        currency: "usd",
        status: "paid",
        hostedInvoiceUrl: "https://invoice.stripe.com/test123",
        invoicePdf: "https://invoice.stripe.com/test123/pdf",
        periodStart: Date.now(),
        periodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
      });

      expect(createdInvoice).toBeDefined();
      expect(createdInvoice.status).toBe("paid");
      expect(createdInvoice.amountDue).toBe(2900);
      expect(createdInvoice.amountPaid).toBe(2900);
      expect(createdInvoice.currency).toBe("usd");
    });

    it("should update existing invoice on status change", async () => {
      const accountId = "account_test123" as Id<"accounts">;
      const invoiceId = "invoice_existing_123" as Id<"invoices">;
      let updatedFields: any = {};

      const mockCtx: any = {
        db: {
          query: (table: string) => ({
            withIndex: () => ({
              first: async () => ({
                _id: invoiceId,
                status: "open",
                amountPaid: 0,
              }),
            }),
          }),
          patch: async (id: any, updates: any) => {
            expect(id).toBe(invoiceId);
            updatedFields = updates;
          },
        },
      };

      const result = await recordInvoiceInternal(mockCtx, {
        accountId,
        stripeInvoiceId: "in_test123",
        stripeCustomerId: "cus_test123",
        amountDue: 2900,
        amountPaid: 2900,
        currency: "usd",
        status: "paid",
        hostedInvoiceUrl: "https://invoice.stripe.com/test123",
        invoicePdf: "https://invoice.stripe.com/test123/pdf",
        periodStart: Date.now(),
        periodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
      });

      expect(result).toBe(invoiceId);
      expect(updatedFields.status).toBe("paid");
      expect(updatedFields.amountPaid).toBe(2900);
      expect(updatedFields.hostedInvoiceUrl).toBeDefined();
    });

    it("should handle different invoice statuses", async () => {
      const accountId = "account_test123" as Id<"accounts">;
      const statuses: Array<"draft" | "open" | "paid" | "void" | "uncollectible"> = [
        "draft",
        "open",
        "paid",
        "void",
        "uncollectible",
      ];

      for (const status of statuses) {
        let createdInvoice: any = null;

        const mockCtx: any = {
          db: {
            query: () => ({
              withIndex: () => ({
                first: async () => null,
              }),
            }),
            insert: async (table: string, doc: any) => {
              createdInvoice = doc;
              return "invoice_123" as Id<"invoices">;
            },
          },
        };

        await recordInvoiceInternal(mockCtx, {
          accountId,
          stripeInvoiceId: `in_${status}_123`,
          stripeCustomerId: "cus_test123",
          amountDue: 2900,
          amountPaid: status === "paid" ? 2900 : 0,
          currency: "usd",
          status,
          periodStart: Date.now(),
          periodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
        });

        expect(createdInvoice.status).toBe(status);
      }
    });
  });

  // ============================================================================
  // TEST 5: Query Operations with Auth
  // ============================================================================
  describe("getSubscription", () => {
    it("should enforce account membership auth", async () => {
      const accountId = "account_test123" as Id<"accounts">;
      const userId = "user_test123";

      const mockCtx: any = {
        auth: {
          getUserIdentity: async () => ({
            subject: userId,
            name: "Test User",
            email: "test@example.com",
          }),
        },
        db: {
          get: async (id: Id<any>) => {
            if (id === accountId) {
              return { _id: accountId, slug: "test", name: "Test", plan: "free" };
            }
            return null;
          },
          query: (table: string) => {
            if (table === "memberships") {
              return {
                withIndex: () => ({
                  unique: async () => ({
                    userId,
                    accountId,
                    role: "member",
                  }),
                }),
              };
            }
            // For billingSubscriptions query
            return {
              withIndex: () => ({
                first: async () => null,
              }),
            };
          },
        },
      };

      const result = await getSubscription(mockCtx, { accountId });
      expect(result).toBeNull(); // No subscription for free account
    });
  });

  describe("getCurrentUsage", () => {
    it("should return zeros when no usage exists", async () => {
      const accountId = "account_test123" as Id<"accounts">;
      const userId = "user_test123";

      const mockCtx: any = {
        auth: {
          getUserIdentity: async () => ({
            subject: userId,
            name: "Test User",
            email: "test@example.com",
          }),
        },
        db: {
          get: async (id: Id<any>) => {
            if (id === accountId) {
              return { _id: accountId, slug: "test", name: "Test", plan: "free" };
            }
            return null;
          },
          query: (table: string) => {
            if (table === "memberships") {
              return {
                withIndex: () => ({
                  unique: async () => ({
                    userId,
                    accountId,
                    role: "member",
                  }),
                }),
              };
            }
            // For usageRecords query
            return {
              withIndex: () => ({
                first: async () => null, // No usage record
              }),
            };
          },
        },
      };

      const usage = await getCurrentUsage(mockCtx, { accountId });

      expect(usage.agents).toBe(0);
      expect(usage.tasks).toBe(0);
      expect(usage.messages).toBe(0);
      expect(usage.documents).toBe(0);
      expect(usage.storageBytes).toBe(0);

      // Verify period format
      const now = new Date();
      const expectedPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      expect(usage.period).toBe(expectedPeriod);
    });

    it("should return current usage when record exists", async () => {
      const accountId = "account_test123" as Id<"accounts">;
      const userId = "user_test123";

      const mockCtx: any = {
        auth: {
          getUserIdentity: async () => ({
            subject: userId,
            name: "Test User",
            email: "test@example.com",
          }),
        },
        db: {
          get: async (id: Id<any>) => {
            if (id === accountId) {
              return { _id: accountId, slug: "test", name: "Test", plan: "free" };
            }
            return null;
          },
          query: (table: string) => {
            if (table === "memberships") {
              return {
                withIndex: () => ({
                  unique: async () => ({
                    userId,
                    accountId,
                    role: "member",
                  }),
                }),
              };
            }
            // For usageRecords query
            return {
              withIndex: () => ({
                first: async () => ({
                  _id: "usage_123" as Id<"usageRecords">,
                  accountId,
                  period: "2026-02",
                  agents: 3,
                  tasks: 15,
                  messages: 42,
                  documents: 7,
                  storageBytes: 1024 * 1024, // 1 MB
                }),
              }),
            };
          },
        },
      };

      const usage = await getCurrentUsage(mockCtx, { accountId });

      expect(usage.agents).toBe(3);
      expect(usage.tasks).toBe(15);
      expect(usage.messages).toBe(42);
      expect(usage.documents).toBe(7);
      expect(usage.storageBytes).toBe(1024 * 1024);
    });
  });

  describe("listInvoices", () => {
    it("should return invoices with default limit", async () => {
      const accountId = "account_test123" as Id<"accounts">;
      const userId = "user_test123";

      const mockInvoices = [
        {
          _id: "invoice_1" as Id<"invoices">,
          stripeInvoiceId: "in_recent",
          amountDue: 2900,
          status: "paid",
        },
        {
          _id: "invoice_2" as Id<"invoices">,
          stripeInvoiceId: "in_old",
          amountDue: 2900,
          status: "paid",
        },
      ];

      const mockCtx: any = {
        auth: {
          getUserIdentity: async () => ({
            subject: userId,
            name: "Test User",
            email: "test@example.com",
          }),
        },
        db: {
          get: async (id: Id<any>) => {
            if (id === accountId) {
              return { _id: accountId, slug: "test", name: "Test", plan: "pro" };
            }
            return null;
          },
          query: (table: string) => {
            if (table === "memberships") {
              return {
                withIndex: () => ({
                  unique: async () => ({
                    userId,
                    accountId,
                    role: "member",
                  }),
                }),
              };
            }
            // For invoices query
            return {
              withIndex: () => ({
                order: () => ({
                  take: async (limit: number) => {
                    expect(limit).toBe(20); // Default limit
                    return mockInvoices;
                  },
                }),
              }),
            };
          },
        },
      };

      const invoices = await listInvoices(mockCtx, { accountId });

      expect(invoices).toHaveLength(2);
      expect(invoices[0].stripeInvoiceId).toBe("in_recent");
    });

    it("should respect custom limit parameter", async () => {
      const accountId = "account_test123" as Id<"accounts">;
      const userId = "user_test123";
      let capturedLimit: number | null = null;

      const mockCtx: any = {
        auth: {
          getUserIdentity: async () => ({
            subject: userId,
            name: "Test User",
            email: "test@example.com",
          }),
        },
        db: {
          get: async (id: Id<any>) => {
            if (id === accountId) {
              return { _id: accountId, slug: "test", name: "Test", plan: "pro" };
            }
            return null;
          },
          query: (table: string) => {
            if (table === "memberships") {
              return {
                withIndex: () => ({
                  unique: async () => ({
                    userId,
                    accountId,
                    role: "member",
                  }),
                }),
              };
            }
            return {
              withIndex: () => ({
                order: () => ({
                  take: async (limit: number) => {
                    capturedLimit = limit;
                    return [];
                  },
                }),
              }),
            };
          },
        },
      };

      await listInvoices(mockCtx, { accountId, limit: 5 });

      expect(capturedLimit).toBe(5);
    });
  });
});
