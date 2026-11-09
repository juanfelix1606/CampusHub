import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";
import { PrismaAuthRepository } from "./auth.repository";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for auth integration tests.");
if (!new URL(databaseUrl).pathname.replace(/^\//, "").endsWith("_test")) {
  throw new Error("Auth integration tests require a dedicated database ending in _test.");
}

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const marker = `auth-integration-${crypto.randomUUID()}`;
const app = createApp(
  {
    accessTokenSecret: "postgres-integration-test-secret-longer-than-32-characters",
    attendanceQrSecret: "postgres-attendance-qr-secret-longer-than-32-characters",
    accessTokenExpiresInSeconds: 900,
    refreshTokenExpiresInMs: 60_000,
    webOrigin: "http://localhost:5173",
    cookieSecure: false,
  },
  new PrismaAuthRepository(prisma),
  { database: prisma },
);

beforeAll(async () => {
  await prisma.$connect();
}, 20_000);

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: marker } } });
  await prisma.$disconnect();
});

describe("auth API with PostgreSQL Prisma repository", () => {
  it("registers, logs in, reads the current user, rotates refresh tokens, and logs out", async () => {
    const email = `${marker}@example.test`;
    const password = "Postgres-integration-password-123";
    const registration = await request(app)
      .post("/api/v1/auth/register")
      .send({ name: "Integration Student", email, password })
      .expect(201);
    const accessToken = registration.body.data.accessToken as string;
    const rawRefreshToken = registration.headers["set-cookie"][0].match(/refreshToken=([^;]+)/)?.[1];
    expect(rawRefreshToken).toBeTruthy();

    const stored = await prisma.refreshToken.findUniqueOrThrow({
      where: {
        tokenHash: createHash("sha256").update(rawRefreshToken!).digest("hex"),
      },
    });
    expect(stored.tokenHash).not.toBe(rawRefreshToken);

    await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200)
      .expect(({ body }) => expect(body.data.user.email).toBe(email));

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email, password })
      .expect(200);
    expect(login.body.data.user.role).toBe("STUDENT");

    const refresh = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Origin", "http://localhost:5173")
      .set("Cookie", `refreshToken=${rawRefreshToken}`)
      .expect(200);
    const rotatedToken = refresh.headers["set-cookie"][0].match(/refreshToken=([^;]+)/)?.[1];
    expect(rotatedToken).toBeTruthy();
    expect(await prisma.refreshToken.findUnique({ where: { id: stored.id } })).toMatchObject({
      revokedAt: expect.any(Date),
    });

    await request(app)
      .post("/api/v1/auth/refresh")
      .set("Origin", "http://localhost:5173")
      .set("Cookie", `refreshToken=${rawRefreshToken}`)
      .expect(401);

    await request(app)
      .post("/api/v1/auth/logout")
      .set("Origin", "http://localhost:5173")
      .set("Cookie", `refreshToken=${rotatedToken}`)
      .expect(200);
    const rotatedHash = createHash("sha256").update(rotatedToken!).digest("hex");
    expect(
      await prisma.refreshToken.findUnique({ where: { tokenHash: rotatedHash } }),
    ).toMatchObject({ revokedAt: expect.any(Date) });
  });
});
