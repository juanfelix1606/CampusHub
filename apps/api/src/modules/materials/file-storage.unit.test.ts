import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalFileStorage } from "./local-file.storage";
import { S3FileStorage } from "./s3-file.storage";
import type { FileStorage } from "./file-storage";

async function contents(storage: FileStorage, key: string): Promise<Buffer> {
  const stream = await storage.read(key);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

describe("local file storage", () => {
  let directory: string;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "campushub-storage-test-"));
  });
  afterAll(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  it("stores, streams, and deletes files while rejecting unsafe keys", async () => {
    const storage = new LocalFileStorage(directory);
    const key = `${randomUUID()}.pdf`;
    const data = Buffer.from("%PDF-1.4\nlocal");
    await storage.save(key, data);
    await expect(contents(storage, key)).resolves.toEqual(data);
    await expect(storage.save(key, data)).rejects.toThrow();
    await expect(storage.read("../outside.pdf")).rejects.toThrow("Invalid storage key.");
    await storage.delete(key);
    await expect(storage.read(key)).rejects.toThrow();
  });
});

describe("S3-compatible storage over HTTP", () => {
  let server: Server;
  let endpoint: string;
  const objects = new Map<string, Buffer>();
  const requests: string[] = [];
  beforeAll(async () => {
    server = createServer(async (request, response) => {
      if (!request.headers.authorization?.startsWith("AWS4-HMAC-SHA256 ")) {
        response.writeHead(403).end();
        return;
      }
      const path = new URL(request.url ?? "/", "http://localhost").pathname;
      requests.push(`${request.method} ${path}`);
      if (request.method === "PUT") {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        objects.set(path, Buffer.concat(chunks));
        response.writeHead(200).end();
      } else if (request.method === "GET") {
        const body = objects.get(path);
        if (!body) {
          response
            .writeHead(404, { "Content-Type": "application/xml" })
            .end("<Error><Code>NoSuchKey</Code></Error>");
          return;
        }
        response.writeHead(200, { "Content-Length": body.length }).end(body);
      } else if (request.method === "DELETE") {
        objects.delete(path);
        response.writeHead(204).end();
      } else {
        response.writeHead(405).end();
      }
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    if (server)
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
  });
  it("sends authenticated S3 requests and propagates missing-object errors", async () => {
    const storage = new S3FileStorage({
      driver: "s3",
      endpoint,
      region: "auto",
      bucket: "private-test",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
      forcePathStyle: true,
    });
    const key = `${randomUUID()}.pdf`;
    const data = Buffer.from("%PDF-1.4\ns3");
    await storage.save(key, data);
    await expect(contents(storage, key)).resolves.toEqual(data);
    await storage.delete(key);
    await expect(storage.read(key)).rejects.toThrow();
    expect(requests).toEqual([
      `PUT /private-test/${key}`,
      `GET /private-test/${key}`,
      `DELETE /private-test/${key}`,
      `GET /private-test/${key}`,
    ]);
  });
});
