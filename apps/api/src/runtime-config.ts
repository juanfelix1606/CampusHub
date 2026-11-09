import type { AuthConfig } from "./modules/auth/auth.types";

export interface RuntimeConfig {
  port: number;
  auth: AuthConfig;
}

export function loadRuntimeConfig(environment: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const port = Number(environment.API_PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("API_PORT must be a valid TCP port.");
  }

  const accessTokenSecret = environment.JWT_ACCESS_SECRET;
  const attendanceQrSecret = environment.ATTENDANCE_QR_SECRET;
  assertStrongSecret("JWT_ACCESS_SECRET", accessTokenSecret);
  assertStrongSecret("ATTENDANCE_QR_SECRET", attendanceQrSecret);
  if (accessTokenSecret === attendanceQrSecret) {
    throw new Error("JWT_ACCESS_SECRET and ATTENDANCE_QR_SECRET must be different.");
  }

  const webOrigin = environment.WEB_ORIGIN ?? "http://localhost:5173";
  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(webOrigin);
  } catch {
    throw new Error("WEB_ORIGIN must be an absolute HTTP(S) origin.");
  }
  if (parsedOrigin.origin !== webOrigin || !["http:", "https:"].includes(parsedOrigin.protocol)) {
    throw new Error("WEB_ORIGIN must be an absolute HTTP(S) origin without a path.");
  }

  const production = environment.NODE_ENV === "production";
  if (production && parsedOrigin.protocol !== "https:") {
    throw new Error("WEB_ORIGIN must use HTTPS in production.");
  }

  return {
    port,
    auth: {
      accessTokenSecret,
      attendanceQrSecret,
      accessTokenExpiresInSeconds: 15 * 60,
      refreshTokenExpiresInMs: 30 * 24 * 60 * 60 * 1000,
      webOrigin,
      cookieSecure: production,
    },
  };
}

function assertStrongSecret(name: string, value: string | undefined): asserts value is string {
  if (!value || value.length < 32 || new Set(value).size < 12) {
    throw new Error(
      `${name} must be at least 32 characters and contain at least 12 distinct characters.`,
    );
  }
}
