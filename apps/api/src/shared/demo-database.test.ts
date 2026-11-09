import { describe, expect, it } from "vitest";
import { validateDemoDatabase } from "./demo-database";

const valid = {
  DATABASE_URL: "postgresql://test:test@db-pooler.example.test/campushub_demo",
  DIRECT_DATABASE_URL: "postgresql://test:test@db.example.test/campushub_demo",
  DEMO_DATABASE_NAME: "campushub_demo",
  CONFIRM_DEMO_DATABASE: "yes",
  DEMO_PASSWORD: "valid-demo-password-123",
};

describe("demo database guard", () => {
  it("accepts a confirmed dedicated database and rejects accidental targets", () => {
    expect(validateDemoDatabase(valid)).toBe(valid.DIRECT_DATABASE_URL);
    expect(() => validateDemoDatabase({ ...valid, CONFIRM_DEMO_DATABASE: "" })).toThrow();
    expect(() => validateDemoDatabase({ ...valid, DEMO_DATABASE_NAME: "campushub" })).toThrow();
    expect(() =>
      validateDemoDatabase({
        ...valid,
        DIRECT_DATABASE_URL: "postgresql://other.example/campushub_demo",
      }),
    ).toThrow();
    expect(() => validateDemoDatabase({ ...valid, DIRECT_DATABASE_URL: "invalid" })).toThrow(
      /valid database URLs/,
    );
    expect(() => validateDemoDatabase({ ...valid, DEMO_PASSWORD: "weak" })).toThrow();
  });
  it("requires a second explicit confirmation for destructive reset", () => {
    expect(() => validateDemoDatabase(valid, true)).toThrow(/Reset/);
    expect(validateDemoDatabase({ ...valid, CONFIRM_DEMO_RESET: "campushub_demo" }, true)).toBe(
      valid.DIRECT_DATABASE_URL,
    );
  });
});
