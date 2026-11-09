import dotenv from "dotenv";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { validateDemoDatabase } from "../src/shared/demo-database";

dotenv.config({ path: resolve(__dirname, "../../../.env") });

const mode = process.argv[2];
if (mode !== "seed" && mode !== "reset") throw new Error("Use seed or reset.");
const databaseUrl = validateDemoDatabase(process.env, mode === "reset");
const cli = resolve(__dirname, "../../../node_modules/prisma/build/index.js");
const environment = { ...process.env, DATABASE_URL: databaseUrl, DIRECT_DATABASE_URL: databaseUrl };
if (mode === "reset") {
  execFileSync(process.execPath, [cli, "migrate", "reset", "--force", "--skip-seed"], {
    cwd: resolve(__dirname, ".."),
    env: environment,
    stdio: "inherit",
  });
}
execFileSync(process.execPath, [cli, "db", "seed"], {
  cwd: resolve(__dirname, ".."),
  env: environment,
  stdio: "inherit",
});
