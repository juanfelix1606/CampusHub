import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { FileStorage } from "./file-storage";

export class LocalFileStorage implements FileStorage {
  private readonly rootDirectory = resolve(
    resolve(__dirname, "../../../../../"),
    process.env.MATERIAL_STORAGE_DIR ?? "uploads/materials",
  );

  async save(key: string, contents: Buffer): Promise<void> {
    const path = this.resolveKey(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents, { flag: "wx" });
  }

  read(key: string): Promise<Buffer> {
    return readFile(this.resolveKey(key));
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
