import type { NextAuthConfig } from "next-auth";

// Edge-safe slice of the Auth.js config. Anything imported here must run in
// the Edge runtime (no Prisma, no bcrypt, no Node-only APIs). The full config
// in src/auth.ts extends this with the Credentials provider for API routes.
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    authorized({ auth }) {
      // Returning false makes Auth.js redirect to pages.signIn.
      // Setup-state gating happens in /login and /home themselves, since the
      // proxy runs in the Edge runtime and can't reach Prisma.
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;
