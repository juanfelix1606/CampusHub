import { open, mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Readable } from "node:stream";
import type { FileStorage } from "./file-storage";

export class LocalFileStorage implements FileStorage {
  private readonly rootDirectory: string;

  constructor(directory = process.env.MATERIAL_STORAGE_DIR ?? "uploads/materials") {
    this.rootDirectory = resolve(resolve(__dirname, "../../../../../"), directory);
  }

  async save(key: string, contents: Buffer): Promise<void> {
    const path = this.resolveKey(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents, { flag: "wx" });
  }

  async read(key: string): Promise<Readable> {
    const file = await open(this.resolveKey(key), "r");
    return file.createReadStream();
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.resolveKey(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  private resolveKey(key: string): string {
    const path = resolve(this.rootDirectory, key);
    if (!path.startsWith(`${this.rootDirectory}\\`) && !path.startsWith(`${this.rootDirectory}/`)) {
      throw new Error("Invalid storage key.");
    }
    return path;
  }
}
