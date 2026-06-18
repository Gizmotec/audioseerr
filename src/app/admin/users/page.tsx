import { redirect } from "next/navigation";

// User management moved into the Settings page as a tab. Keep this path as a
// redirect so old links/bookmarks still work.
export default function AdminUsersRedirect() {
  redirect("/admin/settings?tab=users");
}
