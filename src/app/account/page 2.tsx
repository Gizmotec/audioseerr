import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// The per-user Spotify flow now lives on the settings page's Integrations
// tab. Keep this route as a shim for old bookmarks and OAuth error redirects.
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  qs.set("section", "integrations");
  for (const key of ["connected", "error", "reason"]) {
    const value = params[key];
    if (value) qs.set(key, value);
  }
  redirect(`/admin/settings?${qs.toString()}`);
}
