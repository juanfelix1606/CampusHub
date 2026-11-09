import type { AuthConfig } from "./modules/auth/auth.types";

export interface RuntimeConfig {
  port: number;
  auth: AuthConfig;
  storage: StorageConfig;
}

export interface S3StorageConfig {
  driver: "s3";
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

export type StorageConfig = { driver: "local"; directory?: string } | S3StorageConfig;

function readBoolean(name: string, value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === "") return defaultValue;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false.`);
}

export function loadStorageConfig(
  environment: NodeJS.ProcessEnv,
  production: boolean,
): StorageConfig {
  const driver = environment.STORAGE_DRIVER || "local";
  if (driver === "local") {
    if (production && !readBoolean("ALLOW_LOCAL_STORAGE", environment.ALLOW_LOCAL_STORAGE, false)) {
      throw new Error(
        "Local storage is disabled in production; configure S3 or explicitly set ALLOW_LOCAL_STORAGE=true.",
      );
    }
    return { driver, directory: environment.MATERIAL_STORAGE_DIR || undefined };
  }
  if (driver !== "s3") throw new Error("STORAGE_DRIVER must be local or s3.");

  function required(name: string): string {
    const value = environment[name];
    if (!value?.trim()) throw new Error(`${name} is required when STORAGE_DRIVER=s3.`);
    return value;
  }
  const endpoint = required("S3_ENDPOINT");
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("S3_ENDPOINT must be an absolute HTTP(S) URL.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("S3_ENDPOINT must be an HTTP(S) URL without credentials, query, or fragment.");
  }
  if (production && url.protocol !== "https:") {
    throw new Error("S3_ENDPOINT must use HTTPS in production.");
  }
  return {
    driver,
    endpoint,
    region: required("S3_REGION"),
    bucket: required("S3_BUCKET"),
    accessKeyId: required("S3_ACCESS_KEY_ID"),
    secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
    forcePathStyle: readBoolean("S3_FORCE_PATH_STYLE", environment.S3_FORCE_PATH_STYLE, false),
  };
}

export function loadRuntimeConfig(environment: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const port = Number(environment.PORT ?? environment.API_PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT or API_PORT must be a valid TCP port.");
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
  const originSecret = environment.ORIGIN_PROXY_SECRET;
  if (production) {
    assertStrongSecret("ORIGIN_PROXY_SECRET", originSecret);
    if (originSecret === accessTokenSecret || originSecret === attendanceQrSecret) {
      throw new Error("ORIGIN_PROXY_SECRET must differ from the other secrets.");
    }
  }
  const proxyHops = Number(environment.PROXY_HOPS ?? (production ? 2 : 0));
  if (
    !Number.isInteger(proxyHops) ||
    proxyHops < 0 ||
    proxyHops > 5 ||
    (production && proxyHops === 0)
  ) {
    throw new Error("PROXY_HOPS must be an integer from 0 to 5, and at least 1 in production.");
  }

  return {
    port,
    storage: loadStorageConfig(environment, production),
    auth: {
      accessTokenSecret,
      attendanceQrSecret,
      accessTokenExpiresInSeconds: 15 * 60,
      refreshTokenExpiresInMs: 30 * 24 * 60 * 60 * 1000,
      webOrigin,
      cookieSecure: production,
      originSecret,
      proxyHops,
      proxyDiagnostics: readBoolean("PROXY_DIAGNOSTICS", environment.PROXY_DIAGNOSTICS, false),
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
