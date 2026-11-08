import { describe, expect, it } from "vitest";
import { ForbiddenError } from "../../shared/errors";
import { assertLecturerOwnsClass, assertStudentEnrolled } from "./resource-access";
import { validateMaterialFile } from "./material.service";

describe("material upload validation", () => {
  it("accepts a PDF with matching MIME type, extension, and signature", () => {
    expect(
      validateMaterialFile({
        originalname: "lecture.pdf",
        mimetype: "application/pdf",
        size: 9,
        buffer: Buffer.from("%PDF-1.7"),
      }),
    ).toEqual({ extension: ".pdf", mimeType: "application/pdf" });
  });

  it("rejects mismatched extensions and MIME types", () => {
    expect(() =>
      validateMaterialFile({
        originalname: "lecture.txt",
        mimetype: "text/plain",
        size: 6,
        buffer: Buffer.from("%PDF-1.7"),
      }),
    ).toThrow("Only PDF, PNG, and JPEG");
  });

  it("rejects MIME-type spoofing when the file signature does not match", () => {
    expect(() =>
      validateMaterialFile({
        originalname: "spoof.pdf",
        mimetype: "application/pdf",
        size: 18,
        buffer: Buffer.from("not actually a pdf"),
      }),
    ).toThrow("File content does not match");
  });

  it("rejects oversized content", () => {
    expect(() =>
      validateMaterialFile({
        originalname: "lecture.pdf",
        mimetype: "application/pdf",
        size: 10 * 1024 * 1024 + 1,
        buffer: Buffer.from("%PDF-1.7"),
      }),
    ).toThrow("10 MB or smaller");
  });
});

describe("resource-level access rules", () => {
  it("allows only the assigned lecturer to manage a class", () => {
    expect(() => assertLecturerOwnsClass("lecturer-1", "lecturer-1")).not.toThrow();
    expect(() => assertLecturerOwnsClass("lecturer-1", "lecturer-2")).toThrow(ForbiddenError);
  });

  it("allows students to access materials only when enrolled", () => {
    expect(() => assertStudentEnrolled(true)).not.toThrow();
    expect(() => assertStudentEnrolled(false)).toThrow(ForbiddenError);
  });
});
