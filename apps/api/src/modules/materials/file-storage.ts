import type { Readable } from "node:stream";

export interface FileStorage {
  save(key: string, contents: Buffer): Promise<void>;
  read(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
}
