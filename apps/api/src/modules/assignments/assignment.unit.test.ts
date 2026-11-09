import { describe, expect, it } from "vitest";
import { BadRequestError, ConflictError } from "../../shared/errors";
import {
  assertGradeWithinMaximum,
  assertSubmissionHasContent,
  getSubmissionLateStatus,
} from "./assignment.rules";

describe("assignment deadline rules", () => {
  const deadline = new Date("2026-11-09T12:00:00.000Z");

  it("accepts a submission exactly at the deadline as on time", () => {
    expect(getSubmissionLateStatus(deadline, false, false, deadline)).toBe(false);
  });

  it("rejects a first late submission when the assignment disallows late work", () => {
    expect(() =>
      getSubmissionLateStatus(deadline, false, false, new Date(deadline.getTime() + 1)),
    ).toThrow(ConflictError);
  });

  it("accepts and marks late work only when the lecturer enabled the policy", () => {
    expect(
      getSubmissionLateStatus(deadline, true, false, new Date(deadline.getTime() + 1)),
    ).toBe(true);
  });

  it("does not allow resubmission after the deadline, even when late work is enabled", () => {
    expect(() =>
      getSubmissionLateStatus(deadline, true, true, new Date(deadline.getTime() + 1)),
    ).toThrow("A submission can only be replaced before the deadline.");
  });
});

describe("grading and submission validation", () => {
  it("accepts scores from zero through the assignment maximum", () => {
    expect(() => assertGradeWithinMaximum(0, 100)).not.toThrow();
    expect(() => assertGradeWithinMaximum(100, 100)).not.toThrow();
    expect(() => assertGradeWithinMaximum(100.5, 100)).toThrow(BadRequestError);
  });

  it("requires nonempty text or an uploaded file", () => {
    expect(() => assertSubmissionHasContent(undefined, false)).toThrow(BadRequestError);
    expect(() => assertSubmissionHasContent("  ", false)).toThrow(BadRequestError);
    expect(() => assertSubmissionHasContent("Answer", false)).not.toThrow();
    expect(() => assertSubmissionHasContent(undefined, true)).not.toThrow();
  });
});
