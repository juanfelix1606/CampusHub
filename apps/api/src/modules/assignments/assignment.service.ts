import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import type { UserRole } from "@prisma/client";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../shared/errors";
import { paginated } from "../../shared/pagination";
import type { DomainEventBus } from "../../shared/domain-events";
import { attendanceCsv } from "../../shared/csv";
import type { FileStorage } from "../materials/file-storage";
import { validateMaterialFile, type UploadedMaterialFile } from "../materials/material-upload";
import { PrismaAssignmentRepository } from "./assignment.repository";
import type {
  AssignmentInput,
  AssignmentListQuery,
  AssignmentUpdate,
  GradeInput,
  SubmissionListQuery,
} from "./assignment.schemas";
import {
  assertGradeWithinMaximum,
  assertSubmissionHasContent,
  getSubmissionLateStatus,
} from "./assignment.rules";

type AssignmentUser = { id: string; role: UserRole };

export class AssignmentService {
  constructor(
    private readonly repository: PrismaAssignmentRepository,
    private readonly storage: FileStorage,
    private readonly events: DomainEventBus,
  ) {}

  async list(input: AssignmentListQuery, user: AssignmentUser) {
    if (user.role !== "LECTURER" && user.role !== "STUDENT") throw new ForbiddenError();
    if (input.classId) await this.assertClassAccess(input.classId, user);
    if (input.status && user.role !== "STUDENT") {
      throw new BadRequestError("Status filtering is available only for student assignment lists.");
    }
    const result = await this.repository.list(input, { id: user.id, role: user.role });
    return paginated(
      result.items.map((assignment) => {
        const publicAssignment = this.publicAssignment(assignment);
        if (user.role !== "STUDENT" || !("submissions" in assignment)) return publicAssignment;
        const submission = assignment.submissions[0];
        return {
          ...publicAssignment,
          studentStatus: !submission
            ? "NOT_SUBMITTED"
            : submission.score !== null
              ? "GRADED"
              : submission.isLate
                ? "LATE"
                : "SUBMITTED",
        };
      }),
      result.total,
      input.page,
      input.pageSize,
    );
  }

  private assertSubmissionAccess(
    studentId: string,
    lecturerId: string,
    user: AssignmentUser,
  ): void {
    if (user.role === "LECTURER") {
      this.assertLecturerOwnsResource(lecturerId, user.id);
      return;
    }
    if (user.role === "STUDENT" && studentId === user.id) return;
    throw new ForbiddenError("You may only access submissions from your class or your own work.");
  }

  async getOne(id: string, user: AssignmentUser) {
    const assignment = await this.requireAssignmentAccess(id, user);
    return this.publicAssignment(assignment);
  }

  async create(
    classId: string,
    lecturerId: string,
    input: AssignmentInput,
    file?: UploadedMaterialFile,
  ) {
    await this.assertLecturerOwnsClass(classId, lecturerId);
    const storedFile = file ? await this.storeFile(file) : undefined;
    let assignment;
    try {
      assignment = await this.repository.create(classId, lecturerId, input, storedFile);
    } catch (error) {
      if (storedFile) await this.storage.delete(storedFile.key);
      throw error;
    }
    await this.events.publish({
      type: "assignment.created",
      sectionId: classId,
      assignmentId: assignment.id,
      title: assignment.title,
    });
    return this.publicAssignment(assignment);
  }

  async update(
    id: string,
    lecturerId: string,
    input: AssignmentUpdate,
    file?: UploadedMaterialFile,
  ) {
    const assignment = await this.requireLecturerAssignment(id, lecturerId);
    if (file && input.removeAttachment) {
      throw new BadRequestError("Replace an attachment or remove it, not both.");
    }
    if (input.maxScore !== undefined) {
      const current = await this.repository.highestScore(id);
      if (current !== null && input.maxScore < current) {
        throw new ConflictError("Maximum score cannot be lower than an existing grade.");
      }
    }
    const storedFile = file ? await this.storeFile(file) : undefined;
    const result = await this.repository
      .update(id, lecturerId, input, storedFile, input.removeAttachment === true)
      .catch(async (error: unknown) => {
        if (storedFile) await this.storage.delete(storedFile.key);
        throw error;
      });
    const oldAttachmentKey = storedFile || input.removeAttachment ? assignment.attachmentKey : null;
    if (oldAttachmentKey) await this.storage.delete(oldAttachmentKey);
    return this.publicAssignment(result);
  }

  async delete(id: string, lecturerId: string): Promise<void> {
    await this.requireLecturerAssignment(id, lecturerId);
    const deleted = await this.repository.delete(id, lecturerId);
    if (!deleted) throw new NotFoundError("Assignment not found.");
    for (const key of deleted.fileKeys) await this.storage.delete(key);
  }

  async submit(
    assignmentId: string,
    studentId: string,
    textContent: string | undefined,
    file?: UploadedMaterialFile,
  ) {
    const assignment = await this.requireStudentAssignment(assignmentId, studentId);
    assertSubmissionHasContent(textContent, Boolean(file));
    const current = await this.repository.findStudentSubmission(assignmentId, studentId);
    getSubmissionLateStatus(
      assignment.deadline,
      assignment.allowLate,
      Boolean(current),
      new Date(),
    );
    const storedFile = file ? await this.storeFile(file) : undefined;
    try {
      const submission = await this.repository.submit(assignmentId, studentId, {
        textContent: textContent?.trim() || undefined,
        file: storedFile,
      });
      return this.publicSubmission(submission);
    } catch (error) {
      if (storedFile) await this.storage.delete(storedFile.key);
      throw error;
    }
  }

  async mySubmission(assignmentId: string, studentId: string) {
    await this.requireStudentAssignment(assignmentId, studentId);
    const submission = await this.repository.findStudentSubmission(assignmentId, studentId);
    if (!submission) return null;
    return {
      ...this.publicSubmission(submission),
      versions: submission.versions.map(({ fileKey: _fileKey, ...version }) => version),
      gradeHistory: await this.repository.gradeHistory(submission.id),
    };
  }

  async listSubmissions(assignmentId: string, lecturerId: string, query: SubmissionListQuery) {
    await this.requireLecturerAssignment(assignmentId, lecturerId);
    const result = await this.repository.listSubmissions(assignmentId, query);
    return paginated(
      result.items.map((submission) => ({
        ...this.publicSubmission(submission),
        student: submission.student,
        versions: submission.versions.map(({ fileKey: _fileKey, ...version }) => version),
      })),
      result.total,
      query.page,
      query.pageSize,
    );
  }

  async grade(assignmentId: string, submissionId: string, lecturerId: string, input: GradeInput) {
    const assignment = await this.requireLecturerAssignment(assignmentId, lecturerId);
    assertGradeWithinMaximum(input.score, assignment.maxScore);
    const submission = await this.repository.grade(assignmentId, submissionId, lecturerId, input);
    await this.events.publish({
      type: "assignment.graded",
      studentId: submission.studentId,
      assignmentId,
      title: assignment.title,
    });
    return this.publicSubmission(submission);
  }

  async exportClassGrades(classId: string, user: AssignmentUser): Promise<string> {
    if (user.role !== "ADMIN" && user.role !== "LECTURER") {
      throw new ForbiddenError("Only admins or the assigned lecturer can export class grades.");
    }
    const section = await this.repository.gradeExport(classId);
    if (!section) throw new NotFoundError("Class section not found.");
    if (user.role === "LECTURER" && section.lecturerId !== user.id) {
      throw new ForbiddenError("You do not teach this class.");
    }
    const rows = section.enrollments.flatMap(({ student }) =>
      section.assignments.map((assignment) => {
        const submission = assignment.submissions.find((item) => item.studentId === student.id);
        return {
          course: section.course.code,
          class: section.name,
          semester: section.semester.name,
          studentId: student.id,
          studentName: student.name,
          email: student.email,
          assignment: assignment.title,
          deadline: assignment.deadline,
          score:
            submission?.score === null || submission?.score === undefined
              ? null
              : Number(submission.score),
          maxScore: assignment.maxScore,
          feedback: submission?.feedback ?? null,
          gradedAt: submission?.gradedAt ?? null,
        };
      }),
    );
    return attendanceCsv(rows, [
      "course",
      "class",
      "semester",
      "studentId",
      "studentName",
      "email",
      "assignment",
      "deadline",
      "score",
      "maxScore",
      "feedback",
      "gradedAt",
    ]);
  }

  async classGrades(classId: string, studentId: string) {
    await this.assertClassAccess(classId, { id: studentId, role: "STUDENT" });
    const result = await this.repository.classGrades(classId, studentId);
    return {
      summary: result.summary,
      assignments: result.assignments.map((assignment) => {
        const { attachmentKey: _attachmentKey, ...publicAssignment } = assignment;
        return publicAssignment;
      }),
    };
  }

  async downloadAttachment(assignmentId: string, user: AssignmentUser) {
    const assignment = await this.requireAssignmentAccess(assignmentId, user);
    if (
      !assignment.attachmentKey ||
      !assignment.attachmentFileName ||
      !assignment.attachmentContentType
    ) {
      throw new NotFoundError("Assignment attachment not found.");
    }
    return {
      fileName: assignment.attachmentFileName,
      contentType: assignment.attachmentContentType,
      contents: await this.storage.read(assignment.attachmentKey),
    };
  }

  async downloadSubmissionFile(assignmentId: string, submissionId: string, user: AssignmentUser) {
    const submission = await this.repository.findSubmission(assignmentId, submissionId);
    if (!submission) throw new NotFoundError("Submission not found.");
    this.assertSubmissionAccess(
      submission.studentId,
      submission.assignment.section.lecturerId,
      user,
    );
    if (!submission.fileKey || !submission.fileName || !submission.contentType) {
      throw new NotFoundError("Submission file not found.");
    }
    return {
      fileName: submission.fileName,
      contentType: submission.contentType,
      contents: await this.storage.read(submission.fileKey),
    };
  }

  async downloadSubmissionVersion(
    assignmentId: string,
    submissionId: string,
    versionId: string,
    user: AssignmentUser,
  ) {
    const version = await this.repository.findSubmissionVersion(
      assignmentId,
      submissionId,
      versionId,
    );
    if (!version) throw new NotFoundError("Submission version not found.");
    this.assertSubmissionAccess(
      version.submission.studentId,
      version.submission.assignment.section.lecturerId,
      user,
    );
    if (!version.fileKey || !version.fileName || !version.contentType) {
      throw new NotFoundError("Submission version file not found.");
    }
    return {
      fileName: version.fileName,
      contentType: version.contentType,
      contents: await this.storage.read(version.fileKey),
    };
  }

  private async requireAssignmentAccess(id: string, user: AssignmentUser) {
    const assignment = await this.repository.findAssignment(id);
    if (!assignment) throw new NotFoundError("Assignment not found.");
    if (user.role === "LECTURER") {
      this.assertLecturerOwnsResource(assignment.section.lecturerId, user.id);
    } else if (user.role === "STUDENT") {
      await this.assertStudentEnrolled(assignment.sectionId, user.id);
    } else {
      throw new ForbiddenError();
    }
    return assignment;
  }

  private async requireLecturerAssignment(id: string, lecturerId: string) {
    const assignment = await this.repository.findAssignment(id);
    if (!assignment) throw new NotFoundError("Assignment not found.");
    this.assertLecturerOwnsResource(assignment.section.lecturerId, lecturerId);
    return assignment;
  }

  private async requireStudentAssignment(id: string, studentId: string) {
    const assignment = await this.requireAssignmentAccess(id, { id: studentId, role: "STUDENT" });
    return assignment;
  }

  private async assertClassAccess(classId: string, user: AssignmentUser): Promise<void> {
    const section = await this.repository.getClassOwner(classId);
    if (!section) throw new NotFoundError("Class section not found.");
    if (user.role === "LECTURER") {
      this.assertLecturerOwnsResource(section.lecturerId, user.id);
      return;
    }
    if (user.role === "STUDENT") {
      await this.assertStudentEnrolled(classId, user.id);
      return;
    }
    throw new ForbiddenError();
  }

  private async assertLecturerOwnsClass(classId: string, lecturerId: string): Promise<void> {
    const section = await this.repository.getClassOwner(classId);
    if (!section) throw new NotFoundError("Class section not found.");
    this.assertLecturerOwnsResource(section.lecturerId, lecturerId);
  }

  private assertLecturerOwnsResource(ownerId: string, lecturerId: string): void {
    if (ownerId !== lecturerId)
      throw new ForbiddenError("Only the assigned lecturer can manage this class.");
  }

  private async assertStudentEnrolled(classId: string, studentId: string): Promise<void> {
    if (!(await this.repository.isStudentEnrolled(classId, studentId))) {
      throw new ForbiddenError("You must be enrolled in this class.");
    }
  }

  private async storeFile(file: UploadedMaterialFile) {
    const { extension, mimeType } = validateMaterialFile(file);
    const key = `${randomUUID()}${extension}`;
    await this.storage.save(key, file.buffer);
    return {
      key,
      name: basename(file.originalname)
        .replace(/[^\w.-]/g, "_")
        .slice(0, 180),
      contentType: mimeType,
    };
  }

  private publicAssignment<T extends { attachmentKey?: string | null }>(assignment: T) {
    const { attachmentKey: _attachmentKey, ...publicAssignment } = assignment;
    if ("submissions" in publicAssignment && Array.isArray(publicAssignment.submissions)) {
      return {
        ...publicAssignment,
        submissions: publicAssignment.submissions.map((submission) => {
          const { fileKey: _fileKey, ...publicSubmission } = submission;
          return publicSubmission;
        }),
      };
    }
    return publicAssignment;
  }

  private publicSubmission<T extends { fileKey?: string | null }>(submission: T) {
    const { fileKey: _fileKey, ...publicSubmission } = submission;
    return publicSubmission;
  }
}
