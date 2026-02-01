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
 * Clerk middleware for route protection.
 * Protects all routes except public ones.
 */
export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
