import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { createFileStorage } from "../modules/materials/file-storage.factory";
import type { FileStorage } from "../modules/materials/file-storage";
import { loadStorageConfig } from "../runtime-config";

export class IntegrationFileStorage implements FileStorage {
  readonly keys = new Set<string>();

  private constructor(
    private readonly delegate: FileStorage,
    private readonly directory?: string,
  ) {}

  static create(): IntegrationFileStorage {
    if (process.env.STORAGE_DRIVER === "s3") {
      return new IntegrationFileStorage(createFileStorage(loadStorageConfig(process.env, false)));
    }
    const directory = mkdtempSync(join(tmpdir(), "campushub-integration-storage-"));
    return new IntegrationFileStorage(createFileStorage({ driver: "local", directory }), directory);
  }

  async save(key: string, contents: Buffer): Promise<void> {
    await this.delegate.save(key, contents);
    this.keys.add(key);
  }

  read(key: string): Promise<Readable> {
    return this.delegate.read(key);
  }

  async delete(key: string): Promise<void> {
    await this.delegate.delete(key);
    this.keys.delete(key);
  }

  async cleanup(): Promise<void> {
    for (const key of this.keys) await this.delete(key);
    if (this.directory) await rm(this.directory, { recursive: true, force: true });
  }
}
