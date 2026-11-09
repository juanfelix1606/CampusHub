import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { loadStorageConfig } from "../src/runtime-config";
import { createFileStorage } from "../src/modules/materials/file-storage.factory";

dotenv.config({ path: resolve(__dirname, "../../../.env") });

async function main(): Promise<void> {
  const config = loadStorageConfig(process.env, process.env.NODE_ENV === "production");
  if (config.driver !== "s3") throw new Error("STORAGE_DRIVER=s3 is required for this smoke test.");
  const storage = createFileStorage(config);
  const key = `smoke-tests/${randomUUID()}.txt`;
  const data = Buffer.from(`CampusHub storage smoke test ${randomUUID()}`);
  try {
    await storage.save(key, data);
    const stream = await storage.read(key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    if (!Buffer.concat(chunks).equals(data))
      throw new Error("Downloaded object differs from uploaded content.");
    console.info("S3 upload and download succeeded.");
  } finally {
    await storage.delete(key);
    console.info("S3 test object deleted.");
  }
}

main().catch((error: unknown) => {
  console.error("Storage smoke test failed:", error instanceof Error ? error.name : "UnknownError");
  process.exitCode = 1;
});
