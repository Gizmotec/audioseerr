// GET  /api/v1/request — list the key owner's requests, newest first.
//                        Admins can pass ?all=true for a global listing.
// POST /api/v1/request — create a request (quota-gated; see src/lib/requestCreate.ts).

import { RequestStatus } from "@prisma/client";
import { z } from "zod";
import { getApiUser, jsonError, parsePagination } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import {
  createRequestForUser,
  type CreateRequestInput,
} from "@/lib/requestCreate";
import { REQUEST_API_SELECT, requestToApiJson } from "./shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUSES = new Set<string>(Object.values(RequestStatus));

const createRequestSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ALBUM"),
    mbid: z.string().uuid("mbid must be a MusicBrainz release-group UUID"),
  }),
  z.object({
    type: z.literal("ARTIST"),
    mbid: z.string().uuid("mbid must be a MusicBrainz artist UUID"),
  }),
  z.object({
    type: z.literal("TRACK"),
    // Recording MBID when known; MusicBrainz's own recording id (resolved via
    // albumMbid) wins when available, and the album-page synthetic key
    // `<albumMbid>:<albumPosition>` is the final fallback.
    mbid: z.string().uuid().nullish(),
    albumMbid: z.string().uuid("albumMbid must be a MusicBrainz release-group UUID"),
    albumPosition: z.number().int().min(1, "albumPosition must be a positive integer"),
  }),
]);

export async function GET(request: Request) {
  const user = await getApiUser(request);
  if (!user) return jsonError(401, "Invalid or missing API key.");

  const searchParams = new URL(request.url).searchParams;

  const status = searchParams.get("status");
  if (status !== null && !VALID_STATUSES.has(status)) {
    return jsonError(
      400,
      `status must be one of: ${[...VALID_STATUSES].join(", ")}.`,
    );
  }

  const pagination = parsePagination(searchParams);
  if ("error" in pagination) return jsonError(400, pagination.error);

  // Global listing is admin-only; everyone else is scoped to their own rows.
  const all = searchParams.get("all") === "true";
  const scopeAll = all && user.role === "ADMIN";

  const rows = await prisma.request.findMany({
    where: {
      ...(scopeAll ? {} : { requestedById: user.id }),
      ...(status ? { status: status as RequestStatus } : {}),
    },
    orderBy: { requestedAt: "desc" },
    take: pagination.take,
    skip: pagination.skip,
    select: REQUEST_API_SELECT,
  });

  return Response.json(rows.map(requestToApiJson));
}

export async function POST(request: Request) {
  const user = await getApiUser(request);
  if (!user) return jsonError(401, "Invalid or missing API key.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Request body must be valid JSON.");
  }

  const parsed = createRequestSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.join(".") ?? "";
    return jsonError(
      400,
      `Invalid request body${where ? ` (${where})` : ""}: ${issue?.message ?? "validation failed"}`,
    );
  }

  const input: CreateRequestInput =
    parsed.data.type === "TRACK"
      ? {
          type: "TRACK",
          mbid: parsed.data.mbid ?? null,
          albumMbid: parsed.data.albumMbid,
          albumPosition: parsed.data.albumPosition,
        }
      : parsed.data;

  const result = await createRequestForUser(user.id, input);
  if (!result.ok) return jsonError(result.status, result.error);

  return Response.json(requestToApiJson(result.request), { status: 201 });
}
