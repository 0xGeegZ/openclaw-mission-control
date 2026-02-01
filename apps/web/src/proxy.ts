import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Define public routes that don't require authentication.
 */
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
]);

/**
 * Clerk proxy for route protection (Next.js 16 proxy convention).
 * Protects all routes except public ones.
 */
export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

/**
 * Run proxy for all routes except _next so that auth context is set even for
 * static-looking requests (e.g. /favicon.ico, /exportServiceWorker.js).
 * Otherwise 404s for those paths still render the root layout and auth() fails.
 */
export const config = {
  matcher: ["/((?!_next).*)", "/(api|trpc)(.*)"],
};
