import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";
import { PrismaAuthRepository } from "../auth/auth.repository";
import { IntegrationFileStorage } from "../../testing/integration-file-storage";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error("TEST_DATABASE_URL is required for assignment integration tests.");
if (!new URL(databaseUrl).pathname.replace(/^\//, "").endsWith("_test")) {
  throw new Error("Assignment integration tests require a dedicated database ending in _test.");
}

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const marker = `assignments-integration-${randomUUID()}`;
const secret = "postgres-integration-test-secret-longer-than-32-characters";
const storage = IntegrationFileStorage.create();
const app = createApp(
  {
    accessTokenSecret: secret,
    attendanceQrSecret: "postgres-attendance-qr-secret-longer-than-32-characters",
    accessTokenExpiresInSeconds: 900,
    refreshTokenExpiresInMs: 60_000,
    webOrigin: "http://localhost:5173",
    cookieSecure: false,
  },
  new PrismaAuthRepository(prisma),
  { database: prisma, materialStorage: storage },
);
const ids = {
  lecturer: randomUUID(),
  otherLecturer: randomUUID(),
  student: randomUUID(),
  otherStudent: randomUUID(),
  outsider: randomUUID(),
  course: randomUUID(),
  semester: randomUUID(),
  section: randomUUID(),
  assignment: randomUUID(),
  lateRejectAssignment: randomUUID(),
  lateAcceptAssignment: randomUUID(),
  concurrentAssignment: randomUUID(),
};

function bearer(userId: string, role: UserRole) {
  return {
    Authorization: `Bearer ${jwt.sign({ role }, secret, {
      algorithm: "HS256",
      subject: userId,
      expiresIn: 900,
    })}`,
  };
}

beforeAll(async () => {
  await prisma.$connect();
  const passwordHash = await bcrypt.hash("Integration-only-password-123", 4);
  await prisma.user.createMany({
    data: [
      {
        id: ids.lecturer,
        name: "Assignment Lecturer",
        email: `${marker}-lecturer@test.local`,
        passwordHash,
        role: "LECTURER",
      },
      {
        id: ids.otherLecturer,
        name: "Other Assignment Lecturer",
        email: `${marker}-other-lecturer@test.local`,
        passwordHash,
        role: "LECTURER",
      },
      {
        id: ids.student,
        name: "Assignment Student",
        email: `${marker}-student@test.local`,
        passwordHash,
        role: "STUDENT",
      },
      {
        id: ids.otherStudent,
        name: "Other Assignment Student",
        email: `${marker}-other-student@test.local`,
        passwordHash,
        role: "STUDENT",
      },
      {
        id: ids.outsider,
        name: "Outsider Student",
        email: `${marker}-outsider@test.local`,
        passwordHash,
        role: "STUDENT",
      },
    ],
  });
  await prisma.semester.create({
    data: {
      id: ids.semester,
      name: `${marker}-semester`,
      startsAt: new Date("2026-08-01"),
      endsAt: new Date("2027-01-31"),
    },
  });
  await prisma.course.create({
    data: {
      id: ids.course,
      code: `A${randomUUID().slice(0, 7).toUpperCase()}`,
      name: "Assignment Course",
      credits: 3,
    },
  });
  await prisma.classSection.create({
    data: {
      id: ids.section,
      courseId: ids.course,
      semesterId: ids.semester,
      lecturerId: ids.lecturer,
      name: "A",
    },
  });
  await prisma.enrollment.createMany({
    data: [
      { sectionId: ids.section, studentId: ids.student },
      { sectionId: ids.section, studentId: ids.otherStudent },
    ],
  });
  await prisma.assignment.createMany({
    data: [
      {
        id: ids.assignment,
        sectionId: ids.section,
        title: "Future deadline test",
        deadline: new Date(Date.now() + 60 * 60 * 1000),
        maxScore: 20,
      },
      {
        id: ids.lateRejectAssignment,
        sectionId: ids.section,
        title: "Late rejection test",
        deadline: new Date(Date.now() - 60 * 60 * 1000),
        allowLate: false,
      },
      {
        id: ids.lateAcceptAssignment,
        sectionId: ids.section,
        title: "Late acceptance test",
        deadline: new Date(Date.now() - 60 * 60 * 1000),
        allowLate: true,
      },
      {
        id: ids.concurrentAssignment,
        sectionId: ids.section,
        title: "Concurrent submission test",
        deadline: new Date(Date.now() + 60 * 60 * 1000),
      },
    ],
  });
}, 20_000);

afterAll(async () => {
  await storage.cleanup();
  await prisma.classSection.deleteMany({ where: { id: ids.section } });
  await prisma.course.deleteMany({ where: { id: ids.course } });
  await prisma.semester.deleteMany({ where: { id: ids.semester } });
  await prisma.user.deleteMany({ where: { email: { startsWith: marker } } });
  await prisma.$disconnect();
});

describe("assignments, submissions, and grading with PostgreSQL", () => {
  it("publishes the assignment operations in Swagger UI", async () => {
    const docs = await request(app).get("/api/docs/swagger-ui-init.js").expect(200);
    expect(docs.text).toContain("/classes/{classId}/assignments");
    expect(docs.text).toContain("/assignments/{assignmentId}/submissions/me");
  });

  it("creates, updates, and deletes assignments for the class lecturer", async () => {
    const lecturer = bearer(ids.lecturer, UserRole.LECTURER);
    const created = await request(app)
      .post(`/api/v1/classes/${ids.section}/assignments`)
      .set(lecturer)
      .send({
        title: "CRUD integration task",
        description: "Created through the lecturer endpoint.",
        deadline: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        maxScore: 40,
        allowLate: true,
      })
      .expect(201);
    const assignmentId = created.body.data.assignment.id as string;
    expect(created.body.data.assignment.allowLate).toBe(true);

    await request(app)
      .patch(`/api/v1/assignments/${assignmentId}`)
      .set(lecturer)
      .send({ title: "Updated CRUD task", description: "Updated through API." })
      .expect(200)
      .expect(({ body }) => expect(body.data.assignment.title).toBe("Updated CRUD task"));

    await request(app).delete(`/api/v1/assignments/${assignmentId}`).set(lecturer).expect(204);
    expect(await prisma.assignment.findUnique({ where: { id: assignmentId } })).toBeNull();
  });

  it("allows only the assigned lecturer to manage class assignments", async () => {
    await request(app)
      .post(`/api/v1/classes/${ids.section}/assignments`)
      .set(bearer(ids.otherLecturer, UserRole.LECTURER))
      .send({
        title: "Unauthorized task",
        deadline: new Date(Date.now() + 60_000).toISOString(),
      })
      .expect(403);

    await request(app)
      .get(`/api/v1/assignments/${ids.assignment}`)
      .set(bearer(ids.outsider, UserRole.STUDENT))
      .expect(403);
    await request(app)
      .patch(`/api/v1/assignments/${ids.assignment}`)
      .set(bearer(ids.otherLecturer, UserRole.LECTURER))
      .send({ title: "Unauthorized update" })
      .expect(403);
  });

  it("retains resubmission versions and resets the active grade", async () => {
    const student = bearer(ids.student, UserRole.STUDENT);
    await request(app)
      .post(`/api/v1/assignments/${ids.assignment}/submissions/me`)
      .set(student)
      .field("textContent", "First version")
      .expect(201);
    const second = await request(app)
      .post(`/api/v1/assignments/${ids.assignment}/submissions/me`)
      .set(student)
      .field("textContent", "Revised version")
      .expect(201);
    expect(second.body.data.submission.version).toBe(2);

    const submission = await prisma.submission.findUniqueOrThrow({
      where: { assignmentId_studentId: { assignmentId: ids.assignment, studentId: ids.student } },
    });
    await request(app)
      .patch(`/api/v1/assignments/${ids.assignment}/submissions/${submission.id}/grade`)
      .set(bearer(ids.lecturer, UserRole.LECTURER))
      .send({ score: 17.5, feedback: "Good revision." })
      .expect(200);
    const submissionHistory = await request(app)
      .get(`/api/v1/assignments/${ids.assignment}/submissions/me`)
      .set(student)
      .expect(200);
    expect(submissionHistory.body.data.submission.versions).toHaveLength(2);
    expect(submissionHistory.body.data.submission.score).toBe("17.5");
    expect(submissionHistory.body.data.submission.gradeHistory).toHaveLength(1);
    const gradeSummary = await request(app)
      .get(`/api/v1/classes/${ids.section}/grades/me`)
      .set(student)
      .expect(200);
    expect(gradeSummary.body.data.summary.gradedAssignments).toBe(1);
    await request(app)
      .get(`/api/v1/classes/${ids.section}/grades/me`)
      .set(bearer(ids.outsider, UserRole.STUDENT))
      .expect(403);
    const anotherStudentView = await request(app)
      .get(`/api/v1/assignments/${ids.assignment}/submissions/me`)
      .set(bearer(ids.otherStudent, UserRole.STUDENT))
      .expect(200);
    expect(anotherStudentView.body.data.submission).toBeNull();

    const resubmission = await request(app)
      .post(`/api/v1/assignments/${ids.assignment}/submissions/me`)
      .set(student)
      .field("textContent", "Final version")
      .expect(201);
    expect(resubmission.body.data.submission.version).toBe(3);
    expect(resubmission.body.data.submission.score).toBeNull();
    expect(
      await prisma.submission.count({
        where: { assignmentId: ids.assignment, studentId: ids.student },
      }),
    ).toBe(1);
    expect(await prisma.submissionVersion.count({ where: { submissionId: submission.id } })).toBe(
      3,
    );
  });

  it("enforces late policies and labels accepted late submissions", async () => {
    await request(app)
      .post(`/api/v1/assignments/${ids.lateRejectAssignment}/submissions/me`)
      .set(bearer(ids.student, UserRole.STUDENT))
      .field("textContent", "Too late")
      .expect(409);

    const lateSubmission = await request(app)
      .post(`/api/v1/assignments/${ids.lateAcceptAssignment}/submissions/me`)
      .set(bearer(ids.student, UserRole.STUDENT))
      .field("textContent", "Accepted late")
      .expect(201);
    expect(lateSubmission.body.data.submission.isLate).toBe(true);

    await request(app)
      .post(`/api/v1/assignments/${ids.lateAcceptAssignment}/submissions/me`)
      .set(bearer(ids.student, UserRole.STUDENT))
      .field("textContent", "Late replacement")
      .expect(409);
  });

  it("serializes concurrent submissions into one active row with two versions", async () => {
    const url = `/api/v1/assignments/${ids.concurrentAssignment}/submissions/me`;
    const headers = bearer(ids.student, UserRole.STUDENT);
    const responses = await Promise.all([
      request(app).post(url).set(headers).field("textContent", "Concurrent answer A"),
      request(app).post(url).set(headers).field("textContent", "Concurrent answer B"),
    ]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    const submission = await prisma.submission.findUniqueOrThrow({
      where: {
        assignmentId_studentId: {
          assignmentId: ids.concurrentAssignment,
          studentId: ids.student,
        },
      },
    });
    expect(submission.version).toBe(2);
    expect(
      await prisma.submission.count({ where: { assignmentId: ids.concurrentAssignment } }),
    ).toBe(1);
    expect(await prisma.submissionVersion.count({ where: { submissionId: submission.id } })).toBe(
      2,
    );
  });

  it("validates grade bounds and records who changed a grade and when", async () => {
    const assignmentId = ids.assignment;
    await request(app)
      .post(`/api/v1/assignments/${assignmentId}/submissions/me`)
      .set(bearer(ids.otherStudent, UserRole.STUDENT))
      .field("textContent", "Grading test submission")
      .expect(201);
    const submission = await prisma.submission.findUniqueOrThrow({
      where: {
        assignmentId_studentId: { assignmentId, studentId: ids.otherStudent },
      },
    });
    const gradeUrl = `/api/v1/assignments/${assignmentId}/submissions/${submission.id}/grade`;
    const lecturer = bearer(ids.lecturer, UserRole.LECTURER);
    await request(app).patch(gradeUrl).set(lecturer).send({ score: 20.01 }).expect(400);
    await request(app).patch(gradeUrl).set(lecturer).send({ score: -1 }).expect(400);
    await request(app)
      .patch(gradeUrl)
      .set(lecturer)
      .send({ score: 18.5, feedback: "First grade" })
      .expect(200);
    await request(app)
      .patch(gradeUrl)
      .set(lecturer)
      .send({ score: 19, feedback: "Updated grade" })
      .expect(200);
    await request(app)
      .patch(`/api/v1/assignments/${assignmentId}`)
      .set(lecturer)
      .send({ maxScore: 10 })
      .expect(409);
    const audit = await prisma.gradeAudit.findMany({
      where: { submissionId: submission.id },
      orderBy: { gradedAt: "asc" },
    });
    expect(audit).toHaveLength(2);
    expect(audit[1]).toMatchObject({
      graderId: ids.lecturer,
      previousScore: expect.objectContaining({ toNumber: expect.any(Function) }),
      score: expect.objectContaining({ toNumber: expect.any(Function) }),
    });
    expect(audit[1].previousScore?.toNumber()).toBe(18.5);
  });

  it("blocks cross-student file access, cross-lecturer grading, and invalid uploads", async () => {
    const submissionResponse = await request(app)
      .post(`/api/v1/assignments/${ids.assignment}/submissions/me`)
      .set(bearer(ids.student, UserRole.STUDENT))
      .field("textContent", "File privacy test")
      .attach("file", Buffer.from("%PDF-1.4\nassignment test"), {
        filename: "work.pdf",
        contentType: "application/pdf",
      })
      .expect(201);
    const submissionId = submissionResponse.body.data.submission.id as string;
    await request(app)
      .get(`/api/v1/assignments/${ids.assignment}/submissions/${submissionId}/file`)
      .set(bearer(ids.otherStudent, UserRole.STUDENT))
      .expect(403);
    await request(app)
      .get(`/api/v1/assignments/${ids.assignment}/submissions/${submissionId}/file`)
      .set(bearer(ids.student, UserRole.STUDENT))
      .expect(200)
      .expect((response) => expect(response.body.toString()).toContain("%PDF-1.4"));
    const historicalVersion = await prisma.submissionVersion.findFirstOrThrow({
      where: { submissionId, fileKey: { not: null } },
    });
    await request(app)
      .get(
        `/api/v1/assignments/${ids.assignment}/submissions/${submissionId}/versions/${historicalVersion.id}/file`,
      )
      .set(bearer(ids.outsider, UserRole.STUDENT))
      .expect(403);
    await request(app)
      .get(
        `/api/v1/assignments/${ids.assignment}/submissions/${submissionId}/versions/${historicalVersion.id}/file`,
      )
      .set(bearer(ids.student, UserRole.STUDENT))
      .expect(200);
    await request(app)
      .post(`/api/v1/assignments/${ids.assignment}/submissions/me`)
      .set(bearer(ids.student, UserRole.STUDENT))
      .field("textContent", "Replacement retains the previous file version")
      .expect(201);
    await request(app)
      .patch(`/api/v1/assignments/${ids.assignment}/submissions/${submissionId}/grade`)
      .set(bearer(ids.otherLecturer, UserRole.LECTURER))
      .send({ score: 10 })
      .expect(403);

    await request(app)
      .post(`/api/v1/assignments/${ids.assignment}/submissions/me`)
      .set(bearer(ids.student, UserRole.STUDENT))
      .field("textContent", "Invalid attachment")
      .attach("file", Buffer.from("not a PDF"), {
        filename: "spoof.pdf",
        contentType: "application/pdf",
      })
      .expect(400);
    expect(storage.keys.size).toBe(1);
  });

  it("enforces the score maximum in PostgreSQL and filters assignment statuses", async () => {
    const assignment = await prisma.assignment.create({
      data: {
        sectionId: ids.section,
        title: `Database constraint ${randomUUID()}`,
        deadline: new Date(Date.now() + 60_000),
        maxScore: 5,
      },
    });
    const submission = await prisma.submission.create({
      data: {
        assignmentId: assignment.id,
        studentId: ids.student,
        textContent: "Constraint check",
        versions: { create: { version: 1, textContent: "Constraint check" } },
      },
    });
    await expect(
      prisma.submission.update({ where: { id: submission.id }, data: { score: 6 } }),
    ).rejects.toThrow("Submission score exceeds assignment maximum");

    const filtered = await request(app)
      .get("/api/v1/assignments?status=NOT_SUBMITTED&page=1&pageSize=100")
      .set(bearer(ids.otherStudent, UserRole.STUDENT))
      .expect(200);
    expect(filtered.body.data.items.some((item: { id: string }) => item.id === assignment.id)).toBe(
      true,
    );
  });
});
