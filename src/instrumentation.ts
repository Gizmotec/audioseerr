export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { registerJobs } = await import("@/lib/jobs");
  registerJobs();
}
