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

export default crons;
