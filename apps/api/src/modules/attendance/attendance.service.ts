import { randomUUID } from "node:crypto";
import { AttendanceStatus, UserRole } from "@prisma/client";
import { ConflictError, ForbiddenError, NotFoundError } from "../../shared/errors";
import { paginated } from "../../shared/pagination";
import { PrismaAttendanceRepository } from "./attendance.repository";
import type {
  AttendanceListInput,
  OpenSessionInput,
  StatusOverrideInput,
} from "./attendance.schemas";
import { attendanceCsv } from "./attendance.rules";
import { hashSessionNonce, issueQrToken, verifyQrToken } from "./attendance-token";

type AttendanceUser = { id: string; role: UserRole };

export class AttendanceService {
  constructor(
    private readonly repository: PrismaAttendanceRepository,
    private readonly qrSecret: string,
  ) {}

  async openSession(classId: string, lecturerId: string, input: OpenSessionInput) {
    const now = new Date();
    const session = await this.repository.openSession(
      classId,
      lecturerId,
      input,
      now,
      hashSessionNonce(),
    );
    return this.publicSession(session);
  }

  async listClassSessions(classId: string, lecturerId: string, page: number, pageSize: number) {
    const result = await this.repository.listClassSessions(classId, lecturerId, page, pageSize);
    return paginated(result.items, result.total, page, pageSize);
  }

  async getQrToken(sessionId: string, lecturerId: string) {
    const session = await this.repository.sessionOwnedByLecturer(sessionId, lecturerId);
    const now = new Date();
    this.assertSessionOpen(session, now);
    const qr = issueQrToken(session.id, this.qrSecret, now);
    return { ...qr, sessionId: session.id };
  }

  async checkIn(token: string, expectedSessionId: string, studentId: string) {
    const now = new Date();
    const claims = verifyQrToken(token, this.qrSecret, now);
    if (claims.sessionId !== expectedSessionId) {
      throw new ConflictError("QR code belongs to a different attendance session.");
    }
    const session = await this.repository.findSession(claims.sessionId);
    if (!session) throw new NotFoundError("Attendance session not found.");
    this.assertSessionOpen(session, now);
    if (claims.expiresAt > session.expiresAt) {
      throw new ConflictError("QR code outlives its attendance session.");
    }
    return this.repository.checkIn(session.id, studentId, now);
  }

  async closeSession(sessionId: string, lecturerId: string) {
    const result = await this.repository.closeSession(sessionId, lecturerId, new Date());
    return { id: result.id, closedAt: result.closedAt };
  }

  async listSessionAttendance(
    sessionId: string,
    lecturerId: string,
    input: AttendanceListInput,
  ) {
    const result = await this.repository.listSessionAttendance(sessionId, lecturerId, input);
    return {
      ...paginated(result.items, result.total, input.page, input.pageSize),
      counts: result.counts,
      session: this.publicSession(result.session),
    };
  }

  async listStudentAttendance(input: AttendanceListInput, studentId: string) {
    if (input.studentId && input.studentId !== studentId) {
      throw new ForbiddenError("You may only view your own attendance.");
    }
    const result = await this.repository.listSessionsForStudent(input, studentId);
    return paginated(result.items, result.total, input.page, input.pageSize);
  }

  async classSummary(classId: string, studentId: string) {
    const result = await this.repository.classSummary(classId, studentId);
    const { lecturerId: _lecturerId, ...section } = result.section;
    return { ...result, section };
  }

  async overrideStatus(
    sessionId: string,
    studentId: string,
    lecturerId: string,
    input: StatusOverrideInput,
  ) {
    const result = await this.repository.overrideStatus(
      sessionId,
      studentId,
      lecturerId,
      input,
      new Date(),
    );
    return result;
  }

  async exportSession(sessionId: string, lecturerId: string): Promise<string> {
    const { session, enrollments } = await this.repository.exportSession(sessionId, lecturerId);
    const rows = enrollments.map(({ student }) => ({
      studentId: student.id,
      studentName: student.name,
      email: student.email,
      status: student.attendances[0]?.status ?? AttendanceStatus.ABSENT,
      checkedInAt: student.attendances[0]?.checkedInAt ?? null,
    }));
    return attendanceCsv(rows, ["studentId", "studentName", "email", "status", "checkedInAt"]);
  }

  async exportClass(classId: string, lecturerId: string): Promise<string> {
    const sessions = await this.repository.exportClass(classId, lecturerId);
    const rows = sessions.flatMap((session) =>
      session.section.enrollments.map(({ student }) => {
        const attendance = session.attendances.find((record) => record.studentId === student.id);
        return {
          sessionId: session.id,
          sessionTitle: session.title,
          sessionDate: session.createdAt,
          studentId: student.id,
          studentName: student.name,
          email: student.email,
          status: attendance?.status ?? AttendanceStatus.ABSENT,
          checkedInAt: attendance?.checkedInAt ?? null,
        };
      }),
    );
    return attendanceCsv(rows, [
      "sessionId",
      "sessionTitle",
      "sessionDate",
      "studentId",
      "studentName",
      "email",
      "status",
      "checkedInAt",
    ]);
  }

  private assertSessionOpen(
    session: { closedAt: Date | null; expiresAt: Date },
    now: Date,
  ): void {
    if (session.closedAt || session.expiresAt <= now) {
      throw new ConflictError("Attendance session is closed or expired.");
    }
  }

  private publicSession<T extends { tokenHash?: string }>(session: T) {
    const { tokenHash: _tokenHash, ...safeSession } = session;
    return safeSession;
  }
}
