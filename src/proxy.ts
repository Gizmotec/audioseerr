import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Edge-runtime proxy (Next.js 16's renamed middleware). Uses the edge-safe
// Auth.js config — must NOT import the full src/auth.ts which pulls in Prisma.
const { auth } = NextAuth(authConfig);

export default auth;

// Match only the routes that require an authenticated session. Public surfaces
// (/, /login, /setup, /api/*) handle their own setup-state and auth redirects
// in page components, so they're left out here.
export const config = {
  matcher: [
    "/home/:path*",
    "/search/:path*",
    "/album/:path*",
    "/artist/:path*",
    "/genre/:path*",
    "/liked/:path*",
    "/admin/:path*",
    "/account/:path*",
    "/requests/:path*",
  ],
};
