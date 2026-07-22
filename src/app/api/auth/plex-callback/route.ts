import { fetchPlexPin, getPlexAuthConfig } from "@/lib/plex";

// Status probe for the Plex PIN login flow. The login page polls this while
// the user is over on app.plex.tv approving the PIN:
//
//   GET /api/auth/plex-callback?pinId=<digits>&code=<pin-code>
//     200 { status: "pending" }  PIN exists, not yet approved
//     200 { status: "ready" }    approved — client should now signIn("plex")
//     400/404                    bad or unknown PIN reference
//
// Security: the Plex authToken is NEVER returned here. "ready" only tells the
// browser to complete sign-in through the "plex" credentials provider, which
// re-fetches the PIN + user from plex.tv server-side (src/lib/external-auth.ts).
// The code must match the PIN — it's the flow's bearer secret, shown only to
// the browser that created the PIN, so guessing numeric PIN ids gets nothing.
//
// Lives under /api/* so src/proxy.ts (page-only matcher) doesn't gate it —
// same precedent as /api/health. It coexists with /api/auth/[...nextauth]
// because Next.js prefers the static `plex-callback` segment over the
// catch-all for this exact path.

export const runtime = "nodejs";
// PIN state changes by the second — never prerender or cache this route.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const config = getPlexAuthConfig();
  if (!config) {
    return Response.json({ error: "Plex sign-in is not enabled." }, { status: 404 });
  }

  const url = new URL(req.url);
  const pinId = url.searchParams.get("pinId") ?? "";
  const code = url.searchParams.get("code") ?? "";
  if (!/^\d+$/.test(pinId) || !code) {
    return Response.json({ error: "Invalid PIN reference." }, { status: 400 });
  }

  try {
    const pin = await fetchPlexPin(config.clientId, pinId);
    if (!pin || pin.code !== code) {
      return Response.json({ error: "Unknown PIN." }, { status: 404 });
    }
    return Response.json({ status: pin.authToken ? "ready" : "pending" });
  } catch {
    return Response.json(
      { error: "Could not reach Plex.tv." },
      { status: 502 },
    );
  }
}
