import { ForbiddenError } from "../../shared/errors";

export function assertLecturerOwnsClass(classLecturerId: string, userId: string): void {
  if (classLecturerId !== userId) {
    throw new ForbiddenError("You can only manage materials in classes you teach.");
  }
}

export function assertStudentEnrolled(isEnrolled: boolean): void {
  if (!isEnrolled) {
    throw new ForbiddenError("Enroll in this class to access its materials.");
  }
}
