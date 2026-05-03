import { redirect } from "next/navigation";
import { isSetupComplete } from "@/lib/settings";
import { SetupWizard } from "./SetupWizard";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await isSetupComplete()) {
    redirect("/login");
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <SetupWizard />
    </main>
  );
}
