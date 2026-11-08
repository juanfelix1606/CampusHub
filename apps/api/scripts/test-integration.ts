import { execFileSync } from "node:child_process";
import { createConnection } from "node:net";
import { resolve } from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: resolve(process.cwd(), "../../.env") });

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("TEST_DATABASE_URL is required for integration tests.");
}

const parsedUrl = new URL(databaseUrl);
if (!parsedUrl.pathname.replace(/^\//, "").endsWith("_test")) {
  throw new Error("TEST_DATABASE_URL must point to a dedicated database whose name ends with _test.");
}

const environment = { ...process.env, DATABASE_URL: databaseUrl };
const prismaCli = resolve(process.cwd(), "../../node_modules/prisma/build/index.js");
const vitestCli = resolve(process.cwd(), "../../node_modules/vitest/vitest.mjs");

async function waitForPostgres(url: URL): Promise<void> {
  const port = Number(url.port || 5432);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const connected = await new Promise<boolean>((resolveConnection) => {
      const connection = createConnection({ host: url.hostname, port });
      connection.once("connect", () => {
        connection.destroy();
        resolveConnection(true);
      });
      connection.once("error", () => resolveConnection(false));
    });
    if (connected) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000));
  }
  throw new Error(`PostgreSQL at ${url.hostname}:${port} was not ready after 30 seconds.`);
}

async function main(): Promise<void> {
  await waitForPostgres(parsedUrl);
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    stdio: "inherit",
    env: environment,
  });
  execFileSync(
  process.execPath,
  [
    vitestCli,
    "run",
    "src/modules/auth/auth.integration.test.ts",
    "src/modules/classes/classes.integration.test.ts",
  ],
  {
      stdio: "inherit",
      env: environment,
  },
  );
}

main().catch((error: unknown) => {
  console.error("Integration test setup failed:", error);
  process.exitCode = 1;
});
