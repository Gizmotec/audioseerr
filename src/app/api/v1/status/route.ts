// Public status probe for the v1 REST API. Intentionally UNAUTHENTICATED —
// same posture as /api/health (src/proxy.ts doesn't match /api/*), and the
// version string is already exposed there.

import { currentAppVersion } from "@/lib/version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ status: "ok", version: currentAppVersion() });
}
