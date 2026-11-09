export function validateDemoDatabase(environment: NodeJS.ProcessEnv, reset = false): string {
  const direct = environment.DIRECT_DATABASE_URL || environment.DATABASE_URL;
  const runtime = environment.DATABASE_URL;
  const expected = environment.DEMO_DATABASE_NAME;
  if (environment.CONFIRM_DEMO_DATABASE !== "yes" || !direct || !runtime || !expected) {
    throw new Error(
      "Set CONFIRM_DEMO_DATABASE=yes and DEMO_DATABASE_NAME for the dedicated demo database.",
    );
  }
  let directUrl: URL;
  let runtimeUrl: URL;
  try {
    directUrl = new URL(direct);
    runtimeUrl = new URL(runtime);
  } catch {
    throw new Error("DATABASE_URL and DIRECT_DATABASE_URL must be valid database URLs.");
  }
  const normalizeHost = (host: string) => host.replace(/-pooler(?=\.)/, "");
  if (
    !expected.endsWith("_demo") ||
    decodeURIComponent(directUrl.pathname.slice(1)) !== expected ||
    decodeURIComponent(runtimeUrl.pathname.slice(1)) !== expected ||
    normalizeHost(directUrl.hostname) !== normalizeHost(runtimeUrl.hostname) ||
    (directUrl.port || "5432") !== (runtimeUrl.port || "5432")
  ) {
    throw new Error(
      "Both URLs must reference the same dedicated *_demo database named by DEMO_DATABASE_NAME.",
    );
  }
  if (reset && environment.CONFIRM_DEMO_RESET !== expected) {
    throw new Error(
      "Reset erases the entire database. Set CONFIRM_DEMO_RESET to DEMO_DATABASE_NAME.",
    );
  }
  const password = environment.DEMO_PASSWORD;
  if (!password || password.length < 12 || new Set(password).size < 8) {
    throw new Error("DEMO_PASSWORD must have at least 12 characters and 8 distinct characters.");
  }
  return direct;
}
