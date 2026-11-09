CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'EXCUSED', 'SICK', 'ABSENT');

ALTER TABLE "AttendanceSession"
ADD COLUMN "title" TEXT NOT NULL DEFAULT 'Sesi absensi',
ADD COLUMN "lateAfterMinutes" INTEGER NOT NULL DEFAULT 10,
ADD CONSTRAINT "AttendanceSession_lateAfterMinutes_nonnegative" CHECK ("lateAfterMinutes" >= 0);

ALTER TABLE "Attendance"
ALTER COLUMN "checkedInAt" DROP NOT NULL,
ADD COLUMN "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT';

CREATE INDEX "AttendanceSession_sectionId_closedAt_expiresAt_idx"
ON "AttendanceSession"("sectionId", "closedAt", "expiresAt");
CREATE INDEX "Attendance_sessionId_status_idx"
ON "Attendance"("sessionId", "status");

CREATE TABLE "AttendanceAudit" (
  "id" UUID NOT NULL,
  "attendanceId" UUID NOT NULL,
  "changedById" UUID NOT NULL,
  "previousStatus" "AttendanceStatus",
  "status" "AttendanceStatus" NOT NULL,
  "reason" VARCHAR(500),
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AttendanceAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AttendanceAudit_attendanceId_changedAt_idx"
ON "AttendanceAudit"("attendanceId", "changedAt");

ALTER TABLE "AttendanceAudit"
ADD CONSTRAINT "AttendanceAudit_attendanceId_fkey"
FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id")
ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "AttendanceAudit_changedById_fkey"
FOREIGN KEY ("changedById") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
