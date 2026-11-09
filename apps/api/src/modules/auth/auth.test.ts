import { UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../app";
import { ConflictError } from "../../shared/errors";
import { authorize, authenticate } from "./auth.middleware";
import type { AuthRepository, AuthUser, StoredRefreshToken } from "./auth.types";

const config = {
  accessTokenSecret: "test-only-signing-secret-that-is-at-least-32-chars",
  attendanceQrSecret: "test-only-attendance-qr-secret-at-least-32-chars",
  accessTokenExpiresInSeconds: 900,
  refreshTokenExpiresInMs: 60_000,
  webOrigin: "http://localhost:5173",
  cookieSecure: false,
};

class InMemoryAuthRepository implements AuthRepository {
  users = new Map<string, AuthUser & { passwordHash: string }>();
  tokens = new Map<string, StoredRefreshToken>();

  async findUserByEmail(email: string) {
    return [...this.users.values()].find((user) => user.email === email) ?? null;
  }

  async findUserById(id: string) {
    const user = [...this.users.values()].find((candidate) => candidate.id === id);
    if (!user) return null;
    const { passwordHash: _passwordHash, ...authUser } = user;
    return authUser;
  }

  async createStudent(input: { name: string; email: string; passwordHash: string }) {
    if (await this.findUserByEmail(input.email)) {
      throw new ConflictError("An account with this email already exists.");
    }
    const user = { id: crypto.randomUUID(), ...input, role: UserRole.STUDENT };
    this.users.set(user.id, user);
    const { passwordHash: _passwordHash, ...authUser } = user;
    return authUser;
  }

  async createRefreshToken(input: { userId: string; tokenHash: string; expiresAt: Date }) {
    const user = await this.findUserById(input.userId);
    if (!user) throw new Error("User not found");
    const token = {
      id: crypto.randomUUID(),
      ...input,
      revokedAt: null,
      user,
    };
    this.tokens.set(input.tokenHash, token);
  }

  async findRefreshToken(tokenHash: string) {
    return this.tokens.get(tokenHash) ?? null;
  }

  async rotateRefreshToken(input: {
    id: string;
    oldTokenHash: string;
    newTokenHash: string;
    expiresAt: Date;
    now: Date;
  }) {
    const current = this.tokens.get(input.oldTokenHash);
    if (
      !current ||
      current.id !== input.id ||
      current.revokedAt !== null ||
      current.expiresAt <= input.now
    ) {
      return false;
    }
    current.revokedAt = input.now;
    this.tokens.set(input.newTokenHash, {
      ...current,
      id: crypto.randomUUID(),
      expiresAt: input.expiresAt,
      revokedAt: null,
    });
    return true;
  }

  async revokeRefreshToken(input: { id: string; tokenHash: string; now: Date }) {
    const token = this.tokens.get(input.tokenHash);
    if (token?.id === input.id && token.revokedAt === null) token.revokedAt = input.now;
  }

  addUser(user: AuthUser & { passwordHash: string }) {
    this.users.set(user.id, user);
  }
}

describe("authentication API", () => {
  let repository: InMemoryAuthRepository;
  let app: express.Express;

  beforeEach(() => {
    repository = new InMemoryAuthRepository();
    app = createApp(config, repository);
  });

  it("registers a student, stores only a refresh-token hash, and sets an httpOnly cookie", async () => {
    const response = await request(app).post("/api/v1/auth/register").send({
      name: "Test Student",
      email: "student@example.test",
      password: "A-long-demo-password-123",
    });

    expect(response.status).toBe(201);
    expect(response.body.data.user.role).toBe("STUDENT");
    expect(response.body.data).not.toHaveProperty("refreshToken");
    expect(response.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(response.headers["set-cookie"][0]).toContain("SameSite=Lax");
    expect(repository.tokens.size).toBe(1);
    expect(repository.tokens.keys().next().value).not.toBe(
      response.headers["set-cookie"][0].match(/refreshToken=([^;]+)/)?.[1],
    );
    await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${response.body.data.accessToken}`)
      .expect(200)
      .expect(({ body }) => expect(body.data.user.email).toBe("student@example.test"));
  });

  it("uses a secure, same-site refresh cookie when production security is enabled", async () => {
    const originSecret = "origin-proxy-test-secret-longer-than-thirty-two-characters";
    const productionApp = createApp(
      { ...config, cookieSecure: true, originSecret, proxyHops: 2 },
      repository,
    );
    await request(productionApp).post("/api/v1/auth/login").expect(403);
    await request(productionApp).get("/api/v1/health").expect(200);
    await request(productionApp).get("/api/docs").set("x-origin-secret", originSecret).expect(404);
    const response = await request(productionApp)
      .post("/api/v1/auth/register")
      .set("x-origin-secret", originSecret)
      .send({
        name: "Production Cookie Student",
        email: "production-cookie@example.test",
        password: "A-long-demo-password-123",
      });

    expect(response.status).toBe(201);
    expect(response.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(response.headers["set-cookie"][0]).toContain("Secure");
    expect(response.headers["set-cookie"][0]).toContain("SameSite=Lax");
    expect(response.headers["set-cookie"][0]).not.toContain("SameSite=None");
    expect(productionApp.get("trust proxy")).toBe(2);
  });

  it("isolates login limits by forwarded client IP only after authenticating the proxy", async () => {
    const originSecret = "origin-proxy-test-secret-longer-than-thirty-two-characters";
    const productionApp = createApp(
      { ...config, cookieSecure: true, originSecret, proxyHops: 2 },
      repository,
    );
    const login = (client: string) =>
      request(productionApp)
        .post("/api/v1/auth/login")
        .set("Origin", config.webOrigin)
        .set("x-origin-secret", originSecret)
        .set("X-Forwarded-For", `${client}, 198.51.100.10`)
        .send({ email: "missing@example.test", password: "password" });
    for (let attempt = 0; attempt < 20; attempt++) await login("192.0.2.1").expect(401);
    await login("192.0.2.1").expect(429);
    await login("192.0.2.2").expect(401);
    await request(productionApp)
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", "192.0.2.3, 198.51.100.10")
      .send({})
      .expect(403);
  });

  it("only exposes opt-in proxy diagnostics behind the origin secret", async () => {
    const originSecret = "origin-proxy-test-secret-longer-than-thirty-two-characters";
    const productionApp = createApp(
      { ...config, cookieSecure: true, originSecret, proxyHops: 2, proxyDiagnostics: true },
      repository,
    );
    await request(productionApp).get("/api/v1/proxy-diagnostic").expect(403);
    await request(productionApp)
      .get("/api/v1/proxy-diagnostic")
      .set("x-origin-secret", originSecret)
      .set("X-Forwarded-For", "192.0.2.12, 198.51.100.10")
      .expect(200)
      .expect(({ body }) => expect(body.clientIp).toBe("192.0.2.12"));
    await request(app).get("/api/v1/proxy-diagnostic").expect(404);
  });

  it("sets security headers and only grants CORS access to the configured web origin", async () => {
    const allowed = await request(app)
      .get("/api/v1/health")
      .set("Origin", config.webOrigin)
      .expect(200);
    expect(allowed.headers["x-content-type-options"]).toBe("nosniff");
    expect(allowed.headers["x-powered-by"]).toBeUndefined();
    expect(allowed.headers["access-control-allow-origin"]).toBe(config.webOrigin);

    const disallowed = await request(app)
      .get("/api/v1/health")
      .set("Origin", "https://untrusted.example")
      .expect(200);
    expect(disallowed.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("rejects duplicate registrations and invalid input", async () => {
    const payload = {
      name: "Test Student",
      email: "student@example.test",
      password: "A-long-demo-password-123",
    };
    await request(app).post("/api/v1/auth/register").send(payload).expect(201);
    await request(app)
      .post("/api/v1/auth/register")
      .send(payload)
      .expect(409)
      .expect(({ body }) => expect(body.error.code).toBe("CONFLICT"));
    await request(app)
      .post("/api/v1/auth/register")
      .send({ ...payload, email: "not-an-email" })
      .expect(400)
      .expect(({ body }) => expect(body.error.code).toBe("VALIDATION_ERROR"));
  });

  it("logs in with valid credentials and rejects invalid credentials", async () => {
    const passwordHash = await bcrypt.hash("A-long-demo-password-123", 4);
    repository.addUser({
      id: crypto.randomUUID(),
      name: "Test Student",
      email: "student@example.test",
      role: UserRole.STUDENT,
      passwordHash,
    });

    const success = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "STUDENT@example.test", password: "A-long-demo-password-123" })
      .expect(200);
    expect(success.body.data.accessToken).toBeTypeOf("string");

    await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "student@example.test", password: "incorrect-password" })
      .expect(401)
      .expect(({ body }) => expect(body.error.code).toBe("UNAUTHORIZED"));
    await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "unknown@example.test", password: "incorrect-password" })
      .expect(401)
      .expect(({ body }) => expect(body.error.code).toBe("UNAUTHORIZED"));
  });

  it("rejects /me without an access token", async () => {
    await request(app)
      .get("/api/v1/auth/me")
      .expect(401)
      .expect(({ body }) => expect(body.error.code).toBe("UNAUTHORIZED"));
  });

  it("denies a student on an admin-only route", async () => {
    const accessToken = (
      await request(app).post("/api/v1/auth/register").send({
        name: "Another Student",
        email: "another@example.test",
        password: "A-long-demo-password-123",
      })
    ).body.data.accessToken as string;
    const rbacApp = express();
    rbacApp.get(
      "/admin",
      authenticate(config.accessTokenSecret),
      authorize(UserRole.ADMIN),
      (_req, res) => {
        res.sendStatus(204);
      },
    );
    rbacApp.use(
      (
        error: unknown,
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction,
      ) => {
        const status = (error as { statusCode?: number }).statusCode ?? 500;
        res.status(status).json({ status });
      },
    );

    await request(rbacApp).get("/admin").set("Authorization", `Bearer ${accessToken}`).expect(403);
  });

  it("rotates refresh tokens and rejects reuse of the previous token", async () => {
    const registration = await request(app).post("/api/v1/auth/register").send({
      name: "Test Student",
      email: "student@example.test",
      password: "A-long-demo-password-123",
    });
    const oldCookie = registration.headers["set-cookie"][0].match(/refreshToken=([^;]+)/)?.[1];
    expect(oldCookie).toBeTruthy();

    const refreshed = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Origin", config.webOrigin)
      .set("Cookie", `refreshToken=${oldCookie}`)
      .expect(200);
    const newCookie = refreshed.headers["set-cookie"][0].match(/refreshToken=([^;]+)/)?.[1];
    expect(newCookie).toBeTruthy();
    expect(newCookie).not.toBe(oldCookie);

    await request(app)
      .post("/api/v1/auth/refresh")
      .set("Origin", config.webOrigin)
      .set("Cookie", `refreshToken=${oldCookie}`)
      .expect(401);
    await request(app)
      .post("/api/v1/auth/refresh")
      .set("Origin", config.webOrigin)
      .set("Cookie", `refreshToken=${newCookie}`)
      .expect(200);
  });

  it("revokes the refresh token on logout", async () => {
    const registration = await request(app).post("/api/v1/auth/register").send({
      name: "Test Student",
      email: "student@example.test",
      password: "A-long-demo-password-123",
    });
    const cookie = registration.headers["set-cookie"][0].match(/refreshToken=([^;]+)/)?.[1];

    await request(app)
      .post("/api/v1/auth/logout")
      .set("Origin", config.webOrigin)
      .set("Cookie", `refreshToken=${cookie}`)
      .expect(200);
    await request(app)
      .post("/api/v1/auth/refresh")
      .set("Origin", config.webOrigin)
      .set("Cookie", `refreshToken=${cookie}`)
      .expect(401);
  });

  it("requires a trusted origin for refresh-cookie operations", async () => {
    await request(app).post("/api/v1/auth/refresh").expect(403);
  });

  it("rejects requests from an untrusted browser origin", async () => {
    await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", "https://attacker.example")
      .send({ email: "student@example.test", password: "password" })
      .expect(403);
  });

  it("only exposes credentialed CORS to the configured web origin", async () => {
    const allowed = await request(app)
      .get("/api/v1/health")
      .set("Origin", config.webOrigin)
      .expect(200);
    expect(allowed.headers["access-control-allow-origin"]).toBe(config.webOrigin);
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");

    const denied = await request(app)
      .get("/api/v1/health")
      .set("Origin", "https://attacker.example")
      .expect(200);
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
