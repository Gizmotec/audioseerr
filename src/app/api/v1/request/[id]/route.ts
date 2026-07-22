// GET /api/v1/request/[id] — a single request. Own rows only; admins can read
// anyone's. Everything else gets a 404 (not 403) so ids can't be probed.

import { getApiUser, jsonError } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { REQUEST_API_SELECT, requestToApiJson } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const user = await getApiUser(request);
  if (!user) return jsonError(401, "Invalid or missing API key.");

  const { id } = await ctx.params;

  const row = await prisma.request.findUnique({
    where: { id },
    select: { ...REQUEST_API_SELECT },
  });
  if (!row || (row.requestedById !== user.id && user.role !== "ADMIN")) {
    return jsonError(404, "Request not found.");
  }

  return Response.json(requestToApiJson(row));
}
