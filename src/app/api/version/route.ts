import { auth } from "@/auth";
import { getVersionCheck } from "@/lib/version";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  return Response.json(await getVersionCheck());
}
