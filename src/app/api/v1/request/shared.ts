// Shared row shape for the v1 request endpoints (list, detail, create) so all
// three serialize a request identically.

import type { Prisma } from "@prisma/client";

export const REQUEST_API_SELECT = {
  id: true,
  type: true,
  mbid: true,
  title: true,
  artistName: true,
  albumTitle: true,
  status: true,
  requestedAt: true,
  approvedAt: true,
  declineReason: true,
  requestedById: true,
} satisfies Prisma.RequestSelect;

export type RequestApiRow = Prisma.RequestGetPayload<{
  select: typeof REQUEST_API_SELECT;
}>;

// Dates ride through as Date objects — Response.json serializes them to ISO
// 8601 via Date#toJSON.
export function requestToApiJson(r: RequestApiRow) {
  return {
    id: r.id,
    type: r.type,
    mbid: r.mbid,
    title: r.title,
    artistName: r.artistName,
    albumTitle: r.albumTitle,
    status: r.status,
    requestedAt: r.requestedAt,
    approvedAt: r.approvedAt,
    declineReason: r.declineReason,
    requestedById: r.requestedById,
  };
}
