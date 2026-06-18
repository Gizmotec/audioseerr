import { redirect } from "next/navigation";

// The admin queue was merged into /requests (role-aware). Keep this path as a
// redirect so old links/bookmarks still work.
export default function AdminRequestsRedirect() {
  redirect("/requests");
}
