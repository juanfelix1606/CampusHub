import type { StorageConfig } from "../../runtime-config";
import type { FileStorage } from "./file-storage";
import { LocalFileStorage } from "./local-file.storage";
import { S3FileStorage } from "./s3-file.storage";

export function createFileStorage(config: StorageConfig): FileStorage {
  return config.driver === "local"
    ? new LocalFileStorage(config.directory)
    : new S3FileStorage(config);
}
