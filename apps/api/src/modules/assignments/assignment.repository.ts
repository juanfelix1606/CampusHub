import { Prisma, PrismaClient } from "@prisma/client";
import type {
  AssignmentInput,
  AssignmentListQuery,
  GradeInput,
  SubmissionListQuery,
} from "./assignment.schemas";
import { assertGradeWithinMaximum, getSubmissionLateStatus } from "./assignment.rules";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../shared/errors";

export class PrismaAssignmentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  getClassOwner(classId: string) {
    return this.prisma.classSection.findUnique({
      where: { id: classId },
      select: { lecturerId: true },
    });
  }

  async isStudentEnrolled(classId: string, studentId: string): Promise<boolean> {
    return (await this.prisma.enrollment.count({ where: { sectionId: classId, studentId } })) > 0;
  }

  async highestScore(assignmentId: string): Promise<number | null> {
    const result = await this.prisma.submission.aggregate({
      where: { assignmentId },
      _max: { score: true },
    });
    return result._max.score === null ? null : Number(result._max.score);
  }

  findAssignment(id: string) {
    return this.prisma.assignment.findUnique({
      where: { id },
      include: { section: { select: { lecturerId: true } } },
    });
  }

  async list(input: AssignmentListQuery, user: { id: string; role: "LECTURER" | "STUDENT" }) {
    const where: Prisma.AssignmentWhereInput = {
      ...(input.classId ? { sectionId: input.classId } : {}),
      ...(user.role === "LECTURER"
        ? { section: { lecturerId: user.id } }
        : { section: { enrollments: { some: { studentId: user.id } } } }),
      ...(input.status && user.role === "STUDENT"
        ? {
            submissions:
              input.status === "NOT_SUBMITTED"
                ? { none: { studentId: user.id } }
                : {
                    some: {
                      studentId: user.id,
                      ...(input.status === "GRADED"
                        ? { score: { not: null } }
                        : input.status === "LATE"
                          ? { score: null, isLate: true }
                          : { score: null, isLate: false }),
                    },
                  },
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.assignment.findMany({
        where,
        include: {
          section: {
            include: {
              course: true,
              semester: true,
            },
          },
          submissions: {
            where: { studentId: user.id },
            include: { _count: { select: { versions: true } } },
          },
          _count: { select: { submissions: true } },
        },
        orderBy: [{ deadline: "asc" }, { createdAt: "desc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.assignment.count({ where }),
    ]);
    return { items, total };
  }

  create(
    sectionId: string,
    lecturerId: string,
    input: AssignmentInput,
    file: { key: string; name: string; contentType: string } | undefined,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const section = await transaction.$queryRaw<Array<{ lecturerId: string }>>`
        SELECT "lecturerId" FROM "ClassSection" WHERE "id" = ${sectionId}::uuid FOR UPDATE
      `;
      if (section.length === 0) throw new NotFoundError("Class section not found.");
      if (section[0].lecturerId !== lecturerId) {
        throw new ForbiddenError("Only the assigned lecturer can manage this class.");
      }
      return transaction.assignment.create({
        data: {
          sectionId,
          title: input.title,
          description: input.description || null,
          deadline: input.deadline,
          maxScore: input.maxScore,
          allowLate: input.allowLate,
          attachmentKey: file?.key,
          attachmentFileName: file?.name,
          attachmentContentType: file?.contentType,
        },
      });
    });
  }

  update(
    id: string,
    lecturerId: string,
    input: Partial<AssignmentInput>,
    file: { key: string; name: string; contentType: string } | undefined,
    removeAttachment: boolean,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Assignment" WHERE "id" = ${id}::uuid FOR UPDATE
      `;
      if (locked.length === 0) throw new NotFoundError("Assignment not found.");
      const assignment = await transaction.assignment.findUniqueOrThrow({
        where: { id },
        select: { sectionId: true },
      });
      const section = await transaction.$queryRaw<Array<{ lecturerId: string }>>`
        SELECT "lecturerId" FROM "ClassSection" WHERE "id" = ${assignment.sectionId}::uuid FOR UPDATE
      `;
      if (section.length === 0) throw new NotFoundError("Class section not found.");
      if (section[0].lecturerId !== lecturerId) {
        throw new ForbiddenError("Only the assigned lecturer can manage this class.");
      }
      if (input.maxScore !== undefined) {
        const highest = await transaction.submission.aggregate({
          where: { assignmentId: id },
          _max: { score: true },
        });
        if (highest._max.score !== null && Number(highest._max.score) > input.maxScore) {
          throw new ConflictError("Maximum score cannot be lower than an existing grade.");
        }
      }
      return transaction.assignment.update({
        where: { id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description || null } : {}),
          ...(input.deadline !== undefined ? { deadline: input.deadline } : {}),
          ...(input.maxScore !== undefined ? { maxScore: input.maxScore } : {}),
          ...(input.allowLate !== undefined ? { allowLate: input.allowLate } : {}),
          ...(file
            ? {
                attachmentKey: file.key,
                attachmentFileName: file.name,
                attachmentContentType: file.contentType,
              }
            : removeAttachment
              ? { attachmentKey: null, attachmentFileName: null, attachmentContentType: null }
              : {}),
        },
      });
    });
  }

  async delete(id: string, lecturerId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Assignment" WHERE "id" = ${id}::uuid FOR UPDATE
      `;
      if (locked.length === 0) return null;
      const assignment = await transaction.assignment.findUniqueOrThrow({
        where: { id },
        include: {
          section: { select: { lecturerId: true } },
          submissions: {
            include: { versions: { select: { fileKey: true } } },
          },
        },
      });
      const owner = await transaction.$queryRaw<Array<{ lecturerId: string }>>`
        SELECT "lecturerId" FROM "ClassSection" WHERE "id" = ${assignment.sectionId}::uuid FOR UPDATE
      `;
      if (owner.length === 0) throw new NotFoundError("Class section not found.");
      if (owner[0].lecturerId !== lecturerId) {
        throw new ForbiddenError("Only the assigned lecturer can manage this class.");
      }
      await transaction.assignment.delete({ where: { id } });
      return {
        fileKeys: [
          assignment.attachmentKey,
          ...assignment.submissions.flatMap((submission) => [
            submission.fileKey,
            ...submission.versions.map((version) => version.fileKey),
          ]),
        ].filter((key): key is string => key !== null),
      };
    });
  }

  async submit(
    assignmentId: string,
    studentId: string,
    data: {
      textContent: string | undefined;
      file: { key: string; name: string; contentType: string } | undefined;
    },
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Assignment" WHERE "id" = ${assignmentId}::uuid FOR UPDATE
      `;
      if (locked.length === 0) throw new NotFoundError("Assignment not found.");
      const assignment = await transaction.assignment.findUniqueOrThrow({
        where: { id: assignmentId },
        select: {
          deadline: true,
          allowLate: true,
          section: { select: { enrollments: { where: { studentId }, select: { id: true } } } },
        },
      });
      if (assignment.section.enrollments.length === 0) {
        throw new ForbiddenError("You must be enrolled in this class to submit work.");
      }

      const existing = await transaction.submission.findUnique({
        where: { assignmentId_studentId: { assignmentId, studentId } },
        select: { id: true, version: true },
      });
      const submittedAt = new Date();
      const isLate = getSubmissionLateStatus(
        assignment.deadline,
        assignment.allowLate,
        existing !== null,
        submittedAt,
      );
      const version = (existing?.version ?? 0) + 1;
      const content = {
        textContent: data.textContent || null,
        fileKey: data.file?.key ?? null,
        fileName: data.file?.name ?? null,
        contentType: data.file?.contentType ?? null,
        submittedAt,
        isLate,
      };
      if (existing) {
        const submission = await transaction.submission.update({
          where: { id: existing.id },
          data: {
            ...content,
            version,
            score: null,
            feedback: null,
            gradedAt: null,
            versions: { create: { ...content, version } },
          },
        });
        return submission;
      }
      return transaction.submission.create({
        data: {
          assignmentId,
          studentId,
          ...content,
          version,
          versions: { create: { ...content, version } },
        },
      });
    });
  }

  findStudentSubmission(assignmentId: string, studentId: string) {
    return this.prisma.submission.findUnique({
      where: { assignmentId_studentId: { assignmentId, studentId } },
      include: { versions: { orderBy: { version: "desc" } } },
    });
  }

  async listSubmissions(assignmentId: string, query: SubmissionListQuery) {
    const where: Prisma.SubmissionWhereInput = {
      assignmentId,
      ...(query.status === "GRADED"
        ? { score: { not: null } }
        : query.status === "LATE"
          ? { score: null, isLate: true }
          : query.status === "SUBMITTED"
            ? { score: null, isLate: false }
            : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.submission.findMany({
        where,
        include: {
          student: { select: { id: true, name: true, email: true } },
          versions: { orderBy: { version: "desc" } },
        },
        orderBy: [{ submittedAt: "desc" }, { student: { name: "asc" } }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.submission.count({ where }),
    ]);
    return { items, total };
  }

  async grade(
    assignmentId: string,
    submissionId: string,
    graderId: string,
    input: GradeInput,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Assignment" WHERE "id" = ${assignmentId}::uuid FOR UPDATE
      `;
      if (locked.length === 0) throw new NotFoundError("Assignment not found.");
      const assignment = await transaction.assignment.findUniqueOrThrow({
        where: { id: assignmentId },
        select: { maxScore: true, sectionId: true },
      });
      const owner = await transaction.$queryRaw<Array<{ lecturerId: string }>>`
        SELECT "lecturerId" FROM "ClassSection" WHERE "id" = ${assignment.sectionId}::uuid FOR UPDATE
      `;
      if (owner.length === 0) throw new NotFoundError("Class section not found.");
      if (owner[0].lecturerId !== graderId) {
        throw new ForbiddenError("Only the assigned lecturer can grade this class.");
      }
      const submission = await transaction.submission.findFirst({
        where: { id: submissionId, assignmentId },
      });
      if (!submission) throw new NotFoundError("Submission not found.");
      assertGradeWithinMaximum(input.score, assignment.maxScore);
      const gradeData = {
        score: new Prisma.Decimal(input.score),
        feedback: input.feedback || null,
      };
      await transaction.gradeAudit.create({
        data: {
          submissionId,
          graderId,
          previousScore: submission.score,
          score: gradeData.score,
          previousFeedback: submission.feedback,
          feedback: gradeData.feedback,
        },
      });
      return transaction.submission.update({
        where: { id: submissionId },
        data: { ...gradeData, gradedAt: new Date() },
      });
    });
  }

  findSubmission(assignmentId: string, submissionId: string) {
    return this.prisma.submission.findFirst({
      where: { id: submissionId, assignmentId },
      include: { assignment: { include: { section: { select: { lecturerId: true } } } } },
    });
  }

  findSubmissionVersion(assignmentId: string, submissionId: string, versionId: string) {
    return this.prisma.submissionVersion.findFirst({
      where: {
        id: versionId,
        submissionId,
        submission: { assignmentId },
      },
      include: {
        submission: {
          select: {
            studentId: true,
            assignment: { select: { section: { select: { lecturerId: true } } } },
          },
        },
      },
    });
  }

  async gradeHistory(submissionId: string) {
    return this.prisma.gradeAudit.findMany({
      where: { submissionId },
      include: { grader: { select: { id: true, name: true } } },
      orderBy: { gradedAt: "desc" },
    });
  }

  async classGrades(classId: string, studentId: string) {
    const assignments = await this.prisma.assignment.findMany({
      where: {
        sectionId: classId,
        section: { enrollments: { some: { studentId } } },
      },
      include: {
        submissions: {
          where: { studentId },
          select: { score: true, feedback: true, gradedAt: true, submittedAt: true, isLate: true },
        },
      },
      orderBy: { deadline: "asc" },
    });
    const graded = assignments.flatMap((assignment) =>
      assignment.submissions.filter((submission) => submission.score !== null),
    );
    const earned = graded.reduce((total, submission) => total + Number(submission.score), 0);
    const possible = assignments
      .filter((assignment) => assignment.submissions.some((submission) => submission.score !== null))
      .reduce((total, assignment) => total + assignment.maxScore, 0);
    return {
      assignments,
      summary: {
        totalAssignments: assignments.length,
        gradedAssignments: graded.length,
        earnedScore: earned,
        possibleScore: possible,
        averagePercentage: possible > 0 ? Math.round((earned / possible) * 10000) / 100 : null,
      },
    };
  }

  async attachment(id: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id },
      include: {
        section: { select: { lecturerId: true, enrollments: { select: { studentId: true } } } },
      },
    });
    return assignment;
  }

  async submissionFile(assignmentId: string, submissionId: string) {
    return this.prisma.submission.findFirst({
      where: { id: submissionId, assignmentId },
      include: {
        assignment: {
          include: {
            section: { select: { lecturerId: true, enrollments: { select: { studentId: true } } } },
          },
        },
      },
    });
  }
}
