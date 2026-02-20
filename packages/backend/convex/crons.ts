import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * Every 30 seconds, mark runtimes (and their agents) offline when
 * lastHealthCheck is stale (runtime was killed/crashed without graceful shutdown).
 */
crons.interval(
  "mark stale runtimes offline",
  { seconds: 30 },
  internal.accounts.markStaleRuntimesOffline,
  {},
);

/**
 * Every hour, reset monthly and daily quota counters for accounts that need it.
 * Proactively ensures quotas reset even if accounts have no activity.
 */
crons.interval(
  "reset quota counters",
  { hours: 1 },
  internal.usage.resetQuotasProactive,
  {},
);

export default crons;
