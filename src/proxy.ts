import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/dashboard(.*)",
  "/api/ai/chat(.*)",
  "/api/fantasy-draft-pricing/screenshot(.*)",
  "/api/fantasy/player-comments(.*)",
  "/api/player-stats(.*)",
  "/api/stripe/checkout(.*)",
  "/api/stripe/portal(.*)",
  "/api/stripe/webhook(.*)",
  "/api/admin/rebuild-public-player-stats(.*)",
  "/api/admin/capture-fantasy-ownership-snapshot(.*)",
  "/api/archetypes(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
