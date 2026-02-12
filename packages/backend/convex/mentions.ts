import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireAccountMember } from "./lib/auth";
import { listCandidates } from "./lib/mentions";

/**
 * List all mentionable candidates for @mention autocomplete.
 * Returns workspace members and agents grouped by type for UI.
 *
 * Requires account membership.
 */
export const listMentionCandidates = query({
  args: {
    accountId: v.id("accounts"),
  },
  handler: async (ctx, args) => {
    await requireAccountMember(ctx, args.accountId);
    return await listCandidates(ctx, args.accountId);
  },
});
