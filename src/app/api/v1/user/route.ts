// GET /api/v1/user — the API key owner's own profile.

import { getApiUser, jsonError } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getApiUser(request);
  if (!user) return jsonError(401, "Invalid or missing API key.");

  return Response.json({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    requestQuota: user.requestQuota,
    autoApproveArtist: user.autoApproveArtist,
    autoApproveAlbum: user.autoApproveAlbum,
    autoApproveTrack: user.autoApproveTrack,
  });
}
