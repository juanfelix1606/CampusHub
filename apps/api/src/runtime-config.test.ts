import { describe, expect, it } from "vitest";
import { loadRuntimeConfig, loadStorageConfig } from "./runtime-config";
import { createFileStorage } from "./modules/materials/file-storage.factory";
import { LocalFileStorage } from "./modules/materials/local-file.storage";
import { S3FileStorage } from "./modules/materials/s3-file.storage";

const validEnvironment = {
  JWT_ACCESS_SECRET: "a-valid-jwt-secret-with-enough-distinct-characters-123",
  ATTENDANCE_QR_SECRET: "a-valid-qr-secret-with-enough-distinct-characters-456",
  WEB_ORIGIN: "https://campushub.example",
  NODE_ENV: "production",
  ALLOW_LOCAL_STORAGE: "true",
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

  describe("storage configuration", () => {
    const s3Environment = {
      STORAGE_DRIVER: "s3",
      S3_ENDPOINT: "https://storage.example.test",
      S3_REGION: "auto",
      S3_BUCKET: "private-files",
      S3_ACCESS_KEY_ID: "test-access",
      S3_SECRET_ACCESS_KEY: "test-secret",
      S3_FORCE_PATH_STYLE: "true",
    };

    it("defaults to local storage and requires explicit production opt-in", () => {
      expect(createFileStorage(loadStorageConfig({}, false))).toBeInstanceOf(LocalFileStorage);
      expect(() => loadStorageConfig({}, true)).toThrow(/Local storage is disabled/);
      expect(
        createFileStorage(loadStorageConfig({ ALLOW_LOCAL_STORAGE: "true" }, true)),
      ).toBeInstanceOf(LocalFileStorage);
      expect(() => loadStorageConfig({ ALLOW_LOCAL_STORAGE: "yes" }, true)).toThrow(
        /true or false/,
      );
      expect(() => loadStorageConfig({ STORAGE_DRIVER: "other" }, false)).toThrow(/local or s3/);
    });

    it("requires complete S3 configuration and selects the S3 adapter", () => {
      for (const name of [
        "S3_ENDPOINT",
        "S3_REGION",
        "S3_BUCKET",
        "S3_ACCESS_KEY_ID",
        "S3_SECRET_ACCESS_KEY",
      ]) {
        expect(() => loadStorageConfig({ ...s3Environment, [name]: "" }, true)).toThrow(name);
      }
      const config = loadStorageConfig(s3Environment, true);
      expect(config).toMatchObject({ driver: "s3", forcePathStyle: true });
      expect(createFileStorage(config)).toBeInstanceOf(S3FileStorage);
      expect(() =>
        loadStorageConfig({ ...s3Environment, S3_FORCE_PATH_STYLE: "yes" }, true),
      ).toThrow(/S3_FORCE_PATH_STYLE/);
      expect(() =>
        loadStorageConfig({ ...s3Environment, S3_ENDPOINT: "http://localhost:9000" }, true),
      ).toThrow(/HTTPS/);
      expect(() =>
        loadStorageConfig(
          { ...s3Environment, S3_ENDPOINT: "https://user:pass@example.test" },
          false,
        ),
      ).toThrow(/S3_ENDPOINT/);
    });
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
