import { AttendanceStatus, Prisma, PrismaClient } from "@prisma/client";
import { ConflictError, ForbiddenError, NotFoundError } from "../../shared/errors";
import type {
  AttendanceListInput,
  OpenSessionInput,
  StatusOverrideInput,
} from "./attendance.schemas";
import { attendanceStatusAt } from "./attendance.rules";

export class PrismaAttendanceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async openSession(
    classId: string,
    lecturerId: string,
    input: OpenSessionInput,
    now: Date,
    tokenHash: string,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const owner = await transaction.$queryRaw<Array<{ lecturerId: string }>>`
        SELECT "lecturerId" FROM "ClassSection" WHERE "id" = ${classId}::uuid FOR UPDATE
      `;
      if (owner.length === 0) throw new NotFoundError("Class section not found.");
      if (owner[0].lecturerId !== lecturerId) {
        throw new ForbiddenError("Only the assigned lecturer can open attendance.");
      }
      const active = await transaction.attendanceSession.findFirst({
        where: {
          sectionId: classId,
          closedAt: null,
          expiresAt: { gt: now },
        },
        select: { id: true },
      });
      if (active) throw new ConflictError("This class already has an open attendance session.");
      return transaction.attendanceSession.create({
        data: {
          sectionId: classId,
          lecturerId,
          title: input.title,
          lateAfterMinutes: input.lateAfterMinutes,
          tokenHash,
          createdAt: now,
          expiresAt: new Date(now.getTime() + input.durationMinutes * 60_000),
        },
        include: { section: { include: { course: true, semester: true } } },
      });
    });
  }

  async listClassSessions(classId: string, lecturerId: string, page: number, pageSize: number) {
    await this.assertLecturerOwnsClass(classId, lecturerId);
    const where = { sectionId: classId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.attendanceSession.findMany({
        where,
        include: {
          attendances: { select: { status: true } },
          section: {
            include: {
              course: true,
              semester: true,
              _count: { select: { enrollments: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.attendanceSession.count({ where }),
    ]);
    return {
      items: items.map(({ tokenHash: _tokenHash, attendances, section, ...session }) => {
        const counts = countStatuses(attendances.map((attendance) => attendance.status));
        counts.ABSENT += Math.max(0, section._count.enrollments - attendances.length);
        return {
          ...session,
          section: {
            id: section.id,
            name: section.name,
            course: section.course,
            semester: section.semester,
          },
          counts,
        };
      }),
      total,
    };
  }

  async findSession(sessionId: string) {
    return this.prisma.attendanceSession.findUnique({
      where: { id: sessionId },
      include: { section: { select: { lecturerId: true, course: true, semester: true } } },
    });
  }

  async closeSession(sessionId: string, lecturerId: string, now: Date) {
    return this.prisma.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "AttendanceSession" WHERE "id" = ${sessionId}::uuid FOR UPDATE
      `;
      if (!locked.length) throw new NotFoundError("Attendance session not found.");
      const session = await transaction.attendanceSession.findUniqueOrThrow({
        where: { id: sessionId },
        include: { section: { select: { lecturerId: true } } },
      });
      if (session.section.lecturerId !== lecturerId) {
        throw new ForbiddenError("Only the assigned lecturer can close this session.");
      }
      if (session.closedAt) throw new ConflictError("Attendance session is already closed.");
      return transaction.attendanceSession.update({
        where: { id: sessionId },
        data: { closedAt: now },
      });
    });
  }

  async checkIn(sessionId: string, studentId: string, now: Date) {
    return this.prisma.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "AttendanceSession" WHERE "id" = ${sessionId}::uuid FOR UPDATE
      `;
      if (!locked.length) throw new NotFoundError("Attendance session not found.");
      const session = await transaction.attendanceSession.findUniqueOrThrow({
        where: { id: sessionId },
        select: {
          id: true,
          createdAt: true,
          expiresAt: true,
          closedAt: true,
          lateAfterMinutes: true,
          sectionId: true,
        },
      });
      if (session.closedAt || session.expiresAt <= now) {
        throw new ConflictError("Attendance session is closed or expired.");
      }
      const enrolled = await transaction.enrollment.findUnique({
        where: { sectionId_studentId: { sectionId: session.sectionId, studentId } },
        select: { id: true },
      });
      if (!enrolled) throw new ForbiddenError("You must be enrolled in this class to check in.");
      const existing = await transaction.attendance.findUnique({
        where: { sessionId_studentId: { sessionId, studentId } },
        select: { id: true },
      });
      if (existing) throw new ConflictError("You have already checked in for this session.");
      return transaction.attendance.create({
        data: {
          sessionId,
          studentId,
          checkedInAt: now,
          status: attendanceStatusAt(session.createdAt, session.lateAfterMinutes, now),
        },
        include: { student: { select: { id: true, name: true, email: true } } },
      });
    });
  }

  async listSessionsForStudent(input: AttendanceListInput, studentId: string) {
    const where: Prisma.AttendanceSessionWhereInput = {
      ...(input.sessionId ? { id: input.sessionId } : {}),
      ...(input.classId ? { sectionId: input.classId } : {}),
      section: { enrollments: { some: { studentId } } },
      AND: [
        {
          OR: [
            { closedAt: { not: null } },
            { expiresAt: { lte: new Date() } },
            { attendances: { some: { studentId } } },
          ],
        },
        ...(input.status
          ? [
              input.status === AttendanceStatus.ABSENT
                ? {
                    OR: [
                      { attendances: { none: { studentId } } },
                      { attendances: { some: { studentId, status: AttendanceStatus.ABSENT } } },
                    ],
                  }
                : { attendances: { some: { studentId, status: input.status } } },
            ]
          : []),
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.attendanceSession.findMany({
        where,
        include: {
          section: { include: { course: true, semester: true } },
          attendances: { where: { studentId }, select: { status: true, checkedInAt: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.attendanceSession.count({ where }),
    ]);
    return {
      items: items.map(({ tokenHash: _tokenHash, attendances, ...session }) => ({
        ...session,
        myAttendance: attendances[0] ?? null,
      })),
      total,
    };
  }

  async classSummary(classId: string, studentId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { sectionId_studentId: { sectionId: classId, studentId } },
      include: { section: { include: { course: true, semester: true } } },
    });
    if (!enrollment) throw new ForbiddenError("You must be enrolled in this class.");
    const sessions = await this.prisma.attendanceSession.findMany({
      where: {
        sectionId: classId,
        OR: [{ closedAt: { not: null } }, { expiresAt: { lte: new Date() } }],
      },
      include: { attendances: { where: { studentId }, select: { status: true } } },
      orderBy: { createdAt: "desc" },
    });
    const counts = countStatuses(
      sessions.map((session) => session.attendances[0]?.status ?? AttendanceStatus.ABSENT),
    );
    const total = sessions.length;
    return {
      section: enrollment.section,
      sessions: sessions.map(({ tokenHash: _tokenHash, attendances, ...session }) => ({
        ...session,
        myAttendance: attendances[0] ?? null,
      })),
      summary: {
        totalSessions: total,
        ...counts,
        percentage:
          total === 0 ? 0 : Math.round(((counts.PRESENT + counts.LATE) / total) * 10_000) / 100,
      },
    };
  }

  async listSessionAttendance(sessionId: string, lecturerId: string, input: AttendanceListInput) {
    const session = await this.sessionOwnedByLecturer(sessionId, lecturerId);
    const statusFilter = input.status;
    const where: Prisma.EnrollmentWhereInput = {
      sectionId: session.sectionId,
      ...(input.studentId ? { studentId: input.studentId } : {}),
      ...(statusFilter
        ? statusFilter === AttendanceStatus.ABSENT
          ? {
              OR: [
                { student: { attendances: { none: { sessionId } } } },
                {
                  student: {
                    attendances: { some: { sessionId, status: AttendanceStatus.ABSENT } },
                  },
                },
              ],
            }
          : { student: { attendances: { some: { sessionId, status: statusFilter } } } }
        : {}),
    };
    const [enrollments, total, rosterSize, statusRows] = await this.prisma.$transaction([
      this.prisma.enrollment.findMany({
        where,
        include: {
          student: {
            select: {
              id: true,
              name: true,
              email: true,
              attendances: {
                where: { sessionId },
                include: {
                  audits: {
                    include: { changedBy: { select: { id: true, name: true } } },
                    orderBy: { changedAt: "desc" },
                  },
                },
              },
            },
          },
        },
        orderBy: { student: { name: "asc" } },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.enrollment.count({ where }),
      this.prisma.enrollment.count({ where: { sectionId: session.sectionId } }),
      this.prisma.attendance.findMany({
        where: { sessionId },
        select: { status: true },
      }),
    ]);
    const counts = countStatuses(statusRows.map(({ status }) => status));
    counts.ABSENT += Math.max(0, rosterSize - statusRows.length);
    return {
      items: enrollments.map(({ student }) => ({
        student: { id: student.id, name: student.name, email: student.email },
        attendance: student.attendances[0] ?? null,
      })),
      total,
      counts,
      session,
    };
  }

  async overrideStatus(
    sessionId: string,
    studentId: string,
    lecturerId: string,
    input: StatusOverrideInput,
    now: Date,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "AttendanceSession" WHERE "id" = ${sessionId}::uuid FOR UPDATE
      `;
      if (!locked.length) throw new NotFoundError("Attendance session not found.");
      const session = await transaction.attendanceSession.findUniqueOrThrow({
        where: { id: sessionId },
        select: { sectionId: true, section: { select: { lecturerId: true } } },
      });
      if (session.section.lecturerId !== lecturerId) {
        throw new ForbiddenError("Only the assigned lecturer can update attendance.");
      }
      const enrollment = await transaction.enrollment.findUnique({
        where: { sectionId_studentId: { sectionId: session.sectionId, studentId } },
        select: { id: true },
      });
      if (!enrollment) throw new NotFoundError("Student is not enrolled in this class.");
      const current = await transaction.attendance.findUnique({
        where: { sessionId_studentId: { sessionId, studentId } },
      });
      if (current?.status === input.status) return current;
      const attendance = current
        ? await transaction.attendance.update({
            where: { id: current.id },
            data: {
              status: input.status,
              ...(input.status === AttendanceStatus.PRESENT ||
              input.status === AttendanceStatus.LATE
                ? { checkedInAt: current.checkedInAt ?? now }
                : {}),
            },
          })
        : await transaction.attendance.create({
            data: {
              sessionId,
              studentId,
              status: input.status,
              checkedInAt:
                input.status === AttendanceStatus.PRESENT || input.status === AttendanceStatus.LATE
                  ? now
                  : null,
            },
          });
      await transaction.attendanceAudit.create({
        data: {
          attendanceId: attendance.id,
          changedById: lecturerId,
          previousStatus: current?.status ?? null,
          status: input.status,
          reason: input.reason || null,
          changedAt: now,
        },
      });
      return attendance;
    });
  }

  async exportSession(sessionId: string, lecturerId: string) {
    const result = await this.listSessionAttendance(sessionId, lecturerId, {
      page: 1,
      pageSize: 100,
      status: undefined,
      sessionId: undefined,
      studentId: undefined,
    });
    const enrollments = await this.prisma.enrollment.findMany({
      where: { sectionId: result.session.sectionId },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            attendances: { where: { sessionId }, select: { status: true, checkedInAt: true } },
          },
        },
      },
      orderBy: { student: { name: "asc" } },
    });
    return { session: result.session, enrollments };
  }

  async exportClass(classId: string, lecturerId: string) {
    await this.assertLecturerOwnsClass(classId, lecturerId);
    return this.prisma.attendanceSession.findMany({
      where: { sectionId: classId },
      include: {
        attendances: {
          include: { student: { select: { id: true, name: true, email: true } } },
        },
        section: {
          include: { course: true, semester: true, enrollments: { include: { student: true } } },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async assertLecturerOwnsClass(classId: string, lecturerId: string): Promise<void> {
    const section = await this.prisma.classSection.findUnique({
      where: { id: classId },
      select: { lecturerId: true },
    });
    if (!section) throw new NotFoundError("Class section not found.");
    if (section.lecturerId !== lecturerId) throw new ForbiddenError("You do not teach this class.");
  }

  async sessionOwnedByLecturer(sessionId: string, lecturerId: string) {
    const session = await this.findSession(sessionId);
    if (!session) throw new NotFoundError("Attendance session not found.");
    if (session.section.lecturerId !== lecturerId) {
      throw new ForbiddenError("You do not teach this class.");
    }
    return session;
  }
}

function countStatuses(statuses: AttendanceStatus[]) {
  return {
    PRESENT: statuses.filter((status) => status === AttendanceStatus.PRESENT).length,
    LATE: statuses.filter((status) => status === AttendanceStatus.LATE).length,
    EXCUSED: statuses.filter((status) => status === AttendanceStatus.EXCUSED).length,
    SICK: statuses.filter((status) => status === AttendanceStatus.SICK).length,
    ABSENT: statuses.filter((status) => status === AttendanceStatus.ABSENT).length,
  };
}
