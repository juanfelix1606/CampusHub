import { AttendanceStatus } from "@prisma/client";

export function attendanceStatusAt(
  startedAt: Date,
  lateAfterMinutes: number,
  checkedInAt: Date,
): AttendanceStatus {
  const lateBoundary = startedAt.getTime() + lateAfterMinutes * 60_000;
  return checkedInAt.getTime() <= lateBoundary
    ? AttendanceStatus.PRESENT
    : AttendanceStatus.LATE;
}

export { attendanceCsv, attendanceCsvCell } from "../../shared/csv";
