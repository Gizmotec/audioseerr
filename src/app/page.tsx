import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isSetupComplete } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  redirect("/home");
}
