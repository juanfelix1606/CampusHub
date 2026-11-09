import { BadRequestError, ConflictError } from "../../shared/errors";

export function getSubmissionLateStatus(
  deadline: Date,
  allowLate: boolean,
  hasSubmittedBefore: boolean,
  now: Date,
): boolean {
  const isLate = now.getTime() > deadline.getTime();
  if (isLate && !allowLate) {
    throw new ConflictError("The submission deadline has passed.");
  }
  if (hasSubmittedBefore && isLate) {
    throw new ConflictError("A submission can only be replaced before the deadline.");
  }
  return isLate;
}

export function assertGradeWithinMaximum(score: number, maxScore: number): void {
  if (!Number.isFinite(score) || score < 0 || score > maxScore) {
    throw new BadRequestError(`Score must be between 0 and ${maxScore}.`);
  }
}

export function assertSubmissionHasContent(
  textContent: string | undefined,
  hasFile: boolean,
): void {
  if (!textContent?.trim() && !hasFile) {
    throw new BadRequestError("Provide submission text or a file.");
  }
}
