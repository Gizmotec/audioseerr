import { prisma } from "@/lib/db";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Weekly archival of dead-end requests (design doc §10). Declined and failed
 * rows older than 90 days are deleted outright — there's no separate archive
 * table in v1, and the user-facing "My requests" history doesn't surface
 * outcomes from that long ago anyway. Pending/approved/downloading/available
 * requests are never touched here.
 */
export async function pruneOldRequests(): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - NINETY_DAYS_MS);
  const result = await prisma.request.deleteMany({
    where: {
      status: { in: ["DECLINED", "FAILED"] },
      requestedAt: { lt: cutoff },
    },
  });
  return { deleted: result.count };
}
