import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BackLink } from "@/components/BackLink";
import { prisma } from "@/lib/db";
import { ApiKeysClient } from "./ApiKeysClient";

export const dynamic = "force-dynamic";

export default async function ApiKeysPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login");
  }

  const keys = await prisma.apiKey.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      label: true,
      prefix: true,
      createdAt: true,
      lastUsedAt: true,
    },
  });

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 md:px-6">
      <BackLink fallbackHref="/account" label="Account" />

      <header className="mt-4 mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight">API keys</h1>
        <p className="text-sm text-muted-foreground">
          Keys for the public REST API (<span className="font-mono">/api/v1</span>
          ). The full key is shown exactly once when created — store it
          somewhere safe. See <span className="font-mono">docs/api.md</span> for
          usage.
        </p>
      </header>

      <ApiKeysClient
        keys={keys.map((k) => ({
          id: k.id,
          label: k.label,
          prefix: k.prefix,
          createdAt: k.createdAt.toISOString(),
          lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        }))}
      />
    </main>
  );
}
