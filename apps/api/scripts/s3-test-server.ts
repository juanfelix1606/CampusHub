import { createServer } from "node:http";

const accessKey = process.env.S3_ACCESS_KEY_ID;
const bucket = process.env.S3_BUCKET;
if (!accessKey || !bucket) throw new Error("S3_ACCESS_KEY_ID and S3_BUCKET are required.");

const objects = new Map<string, Buffer>();
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method === "GET" && url.pathname === "/health") {
    response.writeHead(200).end("ok");
    return;
  }
  if (!request.headers.authorization?.startsWith(`AWS4-HMAC-SHA256 Credential=${accessKey}/`)) {
    response.writeHead(403, { "Content-Type": "application/xml" });
    response.end("<Error><Code>AccessDenied</Code></Error>");
    return;
  }

  const prefix = `/${bucket}/`;
  if (!url.pathname.startsWith(prefix) || url.pathname === prefix) {
    response.writeHead(404, { "Content-Type": "application/xml" });
    response.end("<Error><Code>NoSuchBucket</Code></Error>");
    return;
  }
  const key = decodeURIComponent(url.pathname.slice(prefix.length));
  if (request.method === "PUT") {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    objects.set(key, Buffer.concat(chunks));
    response.writeHead(200).end();
    return;
  }
  if (request.method === "GET") {
    const body = objects.get(key);
    if (!body) {
      response.writeHead(404, { "Content-Type": "application/xml" });
      response.end("<Error><Code>NoSuchKey</Code></Error>");
      return;
    }
    response.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Length": body.length,
    });
    response.end(body);
    return;
  }
  if (request.method === "DELETE") {
    objects.delete(key);
    response.writeHead(204).end();
    return;
  }
  response.writeHead(405).end();
});

server.listen(9000, "127.0.0.1", () => console.log("S3 test server listening on 127.0.0.1:9000"));
