import { AttendanceStatus, PrismaClient, UserRole } from "@prisma/client";
import { ForbiddenError } from "../../shared/errors";

export interface RiskThresholds {
  attendancePercent: number;
  missedAssignments: number;
}

export class PrismaAnalyticsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async forStudent(studentId: string, now: Date) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId },
      include: {
        section: {
          include: {
            course: { select: { id: true, code: true, name: true } },
            semester: { select: { id: true, name: true } },
            attendanceSessions: {
              where: { OR: [{ closedAt: { not: null } }, { expiresAt: { lte: now } }] },
              include: {
                attendances: {
                  where: { studentId },
                  select: { status: true },
                },
              },
              orderBy: { createdAt: "asc" },
            },
            assignments: {
              include: {
                submissions: {
                  where: { studentId },
                  select: { score: true, submittedAt: true, isLate: true, gradedAt: true },
                },
              },
              orderBy: { deadline: "asc" },
            },
          },
        },
      },
    });

    const attendanceByClass = enrollments.map(({ section }) => {
      const attended = section.attendanceSessions.filter((session) => {
        const status = session.attendances[0]?.status;
        return status === AttendanceStatus.PRESENT || status === AttendanceStatus.LATE;
      }).length;
      const total = section.attendanceSessions.length;
      return {
        sectionId: section.id,
        className: `${section.course.code} · ${section.name}`,
        courseCode: section.course.code,
        semester: section.semester.name,
        attended,
        total,
        percentage: total === 0 ? 0 : Math.round((attended / total) * 10_000) / 100,
      };
    });

    const assignments = enrollments.flatMap(({ section }) =>
      section.assignments.map((assignment) => ({
        ...assignment,
        section: { id: section.id, code: section.course.code, name: section.name },
      })),
    );
    const upcomingAssignments = assignments
      .filter(
        ({ deadline, submissions }) =>
          deadline >= now && deadline <= addDays(now, 7) && submissions.length === 0,
      )
      .sort((left, right) => left.deadline.getTime() - right.deadline.getTime())
      .slice(0, 10)
      .map(({ id, title, deadline, section }) => ({ id, title, deadline, section }));
    const missingAssignments = assignments
      .filter(({ deadline, submissions }) => deadline < now && submissions.length === 0)
      .sort((left, right) => right.deadline.getTime() - left.deadline.getTime())
      .slice(0, 10)
      .map(({ id, title, deadline, section }) => ({ id, title, deadline, section }));

    const gradeRows = assignments
      .flatMap(({ id, title, maxScore, section, submissions }) =>
        submissions
          .filter((submission) => submission.score !== null && submission.gradedAt)
          .map((submission) => ({
            assignmentId: id,
            assignment: title,
            sectionId: section.id,
            courseCode: section.code,
            score: Number(submission.score),
            maxScore,
            gradedAt: submission.gradedAt!,
          })),
      )
      .sort((left, right) => left.gradedAt.getTime() - right.gradedAt.getTime());
    const gradesByClass = attendanceByClass.map((classInfo) => {
      const grades = gradeRows.filter((grade) => grade.sectionId === classInfo.sectionId);
      return {
        sectionId: classInfo.sectionId,
        className: classInfo.className,
        average:
          grades.length === 0
            ? null
            : Math.round(
                (grades.reduce((sum, grade) => sum + (grade.score / grade.maxScore) * 100, 0) /
                  grades.length) *
                  100,
              ) / 100,
        gradedAssignments: grades.length,
      };
    });

    return {
      attendanceByClass,
      upcomingAssignments,
      missingAssignments,
      gradesByClass,
      gradeTrend: gradeRows.map(({ assignment, courseCode, score, maxScore, gradedAt }) => ({
        assignment,
        courseCode,
        score: Math.round((score / maxScore) * 10000) / 100,
        gradedAt,
      })),
    };
  }

  async forLecturer(lecturerId: string, now: Date, thresholds: RiskThresholds) {
    const sections = await this.prisma.classSection.findMany({
      where: { lecturerId },
      include: {
        course: { select: { code: true, name: true } },
        semester: { select: { name: true, isActive: true } },
        enrollments: {
          include: {
            student: { select: { id: true, name: true, email: true } },
          },
        },
        attendanceSessions: {
          where: { OR: [{ closedAt: { not: null } }, { expiresAt: { lte: now } }] },
          include: { attendances: { select: { studentId: true, status: true } } },
          orderBy: { createdAt: "asc" },
        },
        assignments: {
          include: {
            submissions: {
              select: { studentId: true, score: true },
            },
          },
          orderBy: { deadline: "asc" },
        },
      },
      orderBy: [{ semester: { startsAt: "desc" } }, { course: { code: "asc" } }],
    });

    const attendanceBySession = sections.flatMap((section) =>
      section.attendanceSessions.map((session) => {
        const counts = countAttendance(session.attendances.map(({ status }) => status));
        counts.ABSENT += Math.max(0, section.enrollments.length - session.attendances.length);
        const total = section.enrollments.length;
        return {
          sessionId: session.id,
          title: session.title,
          createdAt: session.createdAt,
          className: `${section.course.code} · ${section.name}`,
          total,
          ...counts,
          percentage:
            total === 0 ? 0 : Math.round(((counts.PRESENT + counts.LATE) / total) * 10_000) / 100,
        };
      }),
    );

    const assignmentAnalytics = sections.flatMap((section) =>
      section.assignments.map((assignment) => {
        const scores = assignment.submissions
          .filter((submission) => submission.score !== null)
          .map(({ score }) => (Number(score) / assignment.maxScore) * 100);
        const submitted = assignment.submissions.length;
        const enrolled = section.enrollments.length;
        return {
          assignmentId: assignment.id,
          title: assignment.title,
          className: `${section.course.code} · ${section.name}`,
          deadline: assignment.deadline,
          enrolled,
          submitted,
          submissionRate: enrolled === 0 ? 0 : Math.round((submitted / enrolled) * 10_000) / 100,
          gradeDistribution: gradeBuckets.map((bucket) => ({
            range: bucket.label,
            count: scores.filter((score) => score >= bucket.min && score < bucket.max).length,
          })),
        };
      }),
    );

    const risks = sections
      .flatMap((section) => {
        const sessionCount = section.attendanceSessions.length;
        const overdue = section.assignments.filter((assignment) => assignment.deadline < now);
        return section.enrollments
          .map(({ student }) => {
            const attendanceCount = section.attendanceSessions.reduce((count, session) => {
              const record = session.attendances.find(
                (attendance) => attendance.studentId === student.id,
              );
              return (
                count +
                (record?.status === AttendanceStatus.PRESENT ||
                record?.status === AttendanceStatus.LATE
                  ? 1
                  : 0)
              );
            }, 0);
            const attendancePercent =
              sessionCount === 0
                ? 100
                : Math.round((attendanceCount / sessionCount) * 10_000) / 100;
            const missedAssignments = overdue.filter(
              (assignment) =>
                !assignment.submissions.some((submission) => submission.studentId === student.id),
            ).length;
            if (
              attendancePercent >= thresholds.attendancePercent &&
              missedAssignments < thresholds.missedAssignments
            )
              return null;
            return {
              studentId: student.id,
              name: student.name,
              email: student.email,
              className: `${section.course.code} · ${section.name}`,
              attendancePercent,
              missedAssignments,
            };
          })
          .filter((student): student is NonNullable<typeof student> => student !== null);
      })
      .slice(0, 50);

    return {
      attendanceBySession,
      assignmentAnalytics,
      risks,
      thresholds,
      classes: sections.map((section) => ({
        sectionId: section.id,
        className: `${section.course.code} · ${section.name}`,
        enrolled: section.enrollments.length,
        semester: section.semester.name,
      })),
    };
  }

  async forAdmin(now: Date) {
    const [userCounts, activeClasses, recentAnnouncements, recentAssignments, recentSessions] =
      await this.prisma.$transaction([
        this.prisma.$queryRaw<Array<{ role: UserRole; count: bigint }>>`
          SELECT "role", COUNT(*) AS "count"
          FROM "User"
          GROUP BY "role"
        `,
        this.prisma.classSection.count({ where: { semester: { isActive: true } } }),
        this.prisma.announcement.findMany({
          where: { createdAt: { gte: addDays(now, -7) } },
          select: { id: true, title: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
        this.prisma.assignment.count({ where: { createdAt: { gte: addDays(now, -7) } } }),
        this.prisma.attendanceSession.count({ where: { createdAt: { gte: addDays(now, -7) } } }),
      ]);
    return {
      usersByRole: Object.values(UserRole).map((role) => ({
        role,
        count: Number(userCounts.find((item) => item.role === role)?.count ?? 0),
      })),
      activeClasses,
      recentActivity: {
        since: addDays(now, -7),
        announcements: recentAnnouncements,
        assignmentsCreated: recentAssignments,
        attendanceSessionsOpened: recentSessions,
      },
    };
  }

  async getDashboard(user: { id: string; role: UserRole }, now: Date, thresholds: RiskThresholds) {
    if (user.role === UserRole.STUDENT) return this.forStudent(user.id, now);
    if (user.role === UserRole.LECTURER) return this.forLecturer(user.id, now, thresholds);
    if (user.role === UserRole.ADMIN) return this.forAdmin(now);
    throw new ForbiddenError();
  }
}

const gradeBuckets = [
  { label: "0–59", min: 0, max: 60 },
  { label: "60–69", min: 60, max: 70 },
  { label: "70–79", min: 70, max: 80 },
  { label: "80–89", min: 80, max: 90 },
  { label: "90–100", min: 90, max: Number.POSITIVE_INFINITY },
];

function countAttendance(statuses: AttendanceStatus[]) {
  return {
    PRESENT: statuses.filter((status) => status === AttendanceStatus.PRESENT).length,
    LATE: statuses.filter((status) => status === AttendanceStatus.LATE).length,
    EXCUSED: statuses.filter((status) => status === AttendanceStatus.EXCUSED).length,
    SICK: statuses.filter((status) => status === AttendanceStatus.SICK).length,
    ABSENT: statuses.filter((status) => status === AttendanceStatus.ABSENT).length,
  };
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
