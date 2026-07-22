import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { authConfig } from "@/auth.config";
import { buildExternalProviders } from "@/lib/external-auth";
import {
  buildOidcProvider,
  OIDC_PROVIDER_ID,
  provisionOidcUser,
} from "@/lib/oidc";

// OIDC/SSO is registered only when the admin has enabled and configured it in
// the database. Auth.js builds its config at module init, so the DB is read
// once at process start (see src/lib/oidc.ts) — SSO setting changes apply on
// the next restart, and the admin settings page says so.
const oidcProvider = buildOidcProvider();

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const username = credentials?.username;
        const password = credentials?.password;
        if (typeof username !== "string" || typeof password !== "string") {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { username },
        });
        if (!user) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          name: user.username,
          email: user.email,
          role: user.role,
        };
      },
    }),
    ...(oidcProvider ? [oidcProvider] : []),
    // Plex/Jellyfin sign-ins: credentials providers that verify against the
    // upstream service inside authorize() (src/lib/external-auth.ts). Empty
    // when neither is configured via environment variables.
    ...buildExternalProviders(),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === OIDC_PROVIDER_ID) {
        // The email claim is the link key to a local account — without it we
        // can neither match an existing user nor provision a new one.
        return typeof profile?.email === "string" && profile.email.length > 0;
      }
      return true;
    },
    async jwt({ token, user, account, profile }) {
      if (account?.provider === OIDC_PROVIDER_ID) {
        // SSO sign-ins carry no local user id — resolve the local account
        // (link by email, or auto-provision a USER account) here so token.id
        // always references our own User table.
        const local = await provisionOidcUser({
          email: profile?.email as string | null | undefined,
          preferred_username: profile?.preferred_username as
            | string
            | null
            | undefined,
          name: profile?.name as string | null | undefined,
        });
        if (local) {
          token.id = local.id;
          token.role = local.role;
        }
        return token;
      }
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as { role?: string }).role = token.role as string | undefined;
      }
      return session;
    },
  },
});
