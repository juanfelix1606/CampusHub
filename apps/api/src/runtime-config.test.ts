import { describe, expect, it } from "vitest";
import { loadRuntimeConfig } from "./runtime-config";

const validEnvironment = {
  JWT_ACCESS_SECRET: "a-valid-jwt-secret-with-enough-distinct-characters-123",
  ATTENDANCE_QR_SECRET: "a-valid-qr-secret-with-enough-distinct-characters-456",
  WEB_ORIGIN: "https://campushub.example",
  NODE_ENV: "production",
};

describe("runtime configuration", () => {
  it("rejects missing and weak secrets without echoing their values", () => {
    expect(() =>
      loadRuntimeConfig({
        ...validEnvironment,
        JWT_ACCESS_SECRET: "weak-secret",
      }),
    ).toThrow(/JWT_ACCESS_SECRET/);
    expect(() =>
      loadRuntimeConfig({
        ...validEnvironment,
        JWT_ACCESS_SECRET: "x".repeat(48),
      }),
    ).toThrow(/JWT_ACCESS_SECRET/);
    expect(() =>
      loadRuntimeConfig({
        ...validEnvironment,
        JWT_ACCESS_SECRET: undefined,
      }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it("requires independent secrets, a valid origin, and HTTPS in production", () => {
    expect(() =>
      loadRuntimeConfig({
        ...validEnvironment,
        ATTENDANCE_QR_SECRET: validEnvironment.JWT_ACCESS_SECRET,
      }),
    ).toThrow(/must be different/);
    expect(() =>
      loadRuntimeConfig({
        ...validEnvironment,
        WEB_ORIGIN: "https://campushub.example/dashboard",
      }),
    ).toThrow(/absolute HTTP\(S\) origin/);
    expect(() =>
      loadRuntimeConfig({
        ...validEnvironment,
        WEB_ORIGIN: "http://campushub.example",
      }),
    ).toThrow(/HTTPS in production/);
  });

  it("enables secure cookies for production configuration", () => {
    expect(loadRuntimeConfig(validEnvironment)).toMatchObject({
      port: 3000,
      auth: {
        webOrigin: validEnvironment.WEB_ORIGIN,
        cookieSecure: true,
        accessTokenSecret: validEnvironment.JWT_ACCESS_SECRET,
        attendanceQrSecret: validEnvironment.ATTENDANCE_QR_SECRET,
      },
    });
  });
});
