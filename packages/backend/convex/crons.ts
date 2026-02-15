import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * Every 2 minutes, mark runtimes (and their agents) offline when
 * lastHealthCheck is stale (runtime was killed/crashed without graceful shutdown).
 */
crons.interval(
  "mark stale runtimes offline",
  { minutes: 2 },
  internal.accounts.markStaleRuntimesOffline,
  {},
);

export default crons;
