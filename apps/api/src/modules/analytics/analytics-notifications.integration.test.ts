import { AttendanceStatus, NotificationType, PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";
import { PrismaAuthRepository } from "../auth/auth.repository";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for analytics integration tests.");
if (!new URL(databaseUrl).pathname.replace(/^\//, "").endsWith("_test")) {
  throw new Error("Analytics integration tests require a dedicated database ending in _test.");
}

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const marker = `analytics-integration-${randomUUID()}`;
const accessSecret = "postgres-integration-test-secret-longer-than-32-characters";
const app = createApp(
  {
    accessTokenSecret: accessSecret,
    attendanceQrSecret: "postgres-attendance-qr-secret-longer-than-32-characters",
    accessTokenExpiresInSeconds: 900,
    refreshTokenExpiresInMs: 60_000,
    webOrigin: "http://localhost:5173",
    cookieSecure: false,
  },
  new PrismaAuthRepository(prisma),
  { database: prisma },
);
const ids = {
  admin: randomUUID(),
  lecturer: randomUUID(),
  otherLecturer: randomUUID(),
  student: randomUUID(),
  outsider: randomUUID(),
  course: randomUUID(),
  semester: randomUUID(),
  section: randomUUID(),
  gradedAssignment: randomUUID(),
  upcomingAssignment: randomUUID(),
  missingAssignment: randomUUID(),
};

function bearer(userId: string, role: UserRole) {
  return { Authorization: `Bearer ${accessToken(userId, role)}` };
}

function accessToken(userId: string, role: UserRole): string {
  return jwt.sign({ role }, accessSecret, {
    algorithm: "HS256",
    subject: userId,
    expiresIn: 900,
  });
}

beforeAll(async () => {
  await prisma.$connect();
  const passwordHash = await bcrypt.hash("Integration-only-password-123", 4);
  await prisma.user.createMany({
    data: [
      {
        id: ids.admin,
        name: "Analytics Admin",
        email: `${marker}-admin@test.local`,
        passwordHash,
        role: "ADMIN",
      },
      {
        id: ids.lecturer,
        name: "Analytics Lecturer",
        email: `${marker}-lecturer@test.local`,
        passwordHash,
        role: "LECTURER",
      },
      {
        id: ids.otherLecturer,
        name: "Other Analytics Lecturer",
        email: `${marker}-other-lecturer@test.local`,
        passwordHash,
        role: "LECTURER",
      },
      {
        id: ids.student,
        name: '=HYPERLINK("https://example.test")',
        email: `${marker}-student@test.local`,
        passwordHash,
        role: "STUDENT",
      },
      {
        id: ids.outsider,
        name: "Analytics Outsider",
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
      isActive: true,
    },
  });
  await prisma.course.create({
    data: {
      id: ids.course,
      code: `A${randomUUID().slice(0, 7).toUpperCase()}`,
      name: "Analytics Course",
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
  await prisma.enrollment.create({
    data: { sectionId: ids.section, studentId: ids.student },
  });
  const now = Date.now();
  const graded = await prisma.assignment.create({
    data: {
      id: ids.gradedAssignment,
      sectionId: ids.section,
      title: "Integration graded assignment",
      deadline: new Date(now - 3 * 24 * 60 * 60 * 1000),
      maxScore: 100,
    },
  });
  await prisma.assignment.createMany({
    data: [
      {
        id: ids.upcomingAssignment,
        sectionId: ids.section,
        title: "Integration upcoming assignment",
        deadline: new Date(now + 2 * 24 * 60 * 60 * 1000),
        maxScore: 100,
      },
      {
        id: ids.missingAssignment,
        sectionId: ids.section,
        title: "Integration missing assignment",
        deadline: new Date(now - 24 * 60 * 60 * 1000),
        maxScore: 100,
      },
    ],
  });
  await prisma.submission.create({
    data: {
      assignmentId: graded.id,
      studentId: ids.student,
      textContent: "Integration answer",
      score: 80,
      gradedAt: new Date(now - 24 * 60 * 60 * 1000),
    },
  });
  const sessionCreatedAt = new Date(now - 2 * 24 * 60 * 60 * 1000);
  const session = await prisma.attendanceSession.create({
    data: {
      sectionId: ids.section,
      lecturerId: ids.lecturer,
      title: "Integration completed session",
      lateAfterMinutes: 10,
      tokenHash: randomUUID(),
      createdAt: sessionCreatedAt,
      expiresAt: new Date(sessionCreatedAt.getTime() + 60 * 60 * 1000),
      closedAt: new Date(sessionCreatedAt.getTime() + 60 * 60 * 1000),
    },
  });
  await prisma.attendance.create({
    data: { sessionId: session.id, studentId: ids.student, status: AttendanceStatus.PRESENT },
  });
}, 20_000);

afterAll(async () => {
  await prisma.classSection.deleteMany({ where: { id: ids.section } });
  await prisma.course.deleteMany({ where: { id: ids.course } });
  await prisma.semester.deleteMany({ where: { id: ids.semester } });
  await prisma.announcement.deleteMany({ where: { authorId: ids.admin } });
  await prisma.user.deleteMany({ where: { email: { startsWith: marker } } });
  await prisma.$disconnect();
});

describe("analytics, announcements, notifications, and grade export with PostgreSQL", () => {
  it("calculates role dashboards and enforces dashboard authentication", async () => {
    await request(app).get("/api/v1/dashboard").expect(401);

    const studentDashboard = await request(app)
      .get("/api/v1/dashboard")
      .set(bearer(ids.student, UserRole.STUDENT))
      .expect(200);
    expect(studentDashboard.body.data.attendanceByClass[0]).toMatchObject({
      sectionId: ids.section,
      attended: 1,
      total: 1,
      percentage: 100,
    });
    expect(
      studentDashboard.body.data.upcomingAssignments.map((item: { id: string }) => item.id),
    ).toContain(ids.upcomingAssignment);
    expect(
      studentDashboard.body.data.missingAssignments.map((item: { id: string }) => item.id),
    ).toContain(ids.missingAssignment);
    expect(studentDashboard.body.data.gradesByClass[0].average).toBe(80);

    const lecturerDashboard = await request(app)
      .get("/api/v1/dashboard")
      .set(bearer(ids.lecturer, UserRole.LECTURER))
      .expect(200);
    expect(lecturerDashboard.body.data.attendanceBySession[0]).toMatchObject({
      total: 1,
      PRESENT: 1,
      percentage: 100,
    });
    expect(
      lecturerDashboard.body.data.assignmentAnalytics
        .find((item: { assignmentId: string }) => item.assignmentId === ids.gradedAssignment)
        .gradeDistribution.find((bucket: { range: string }) => bucket.range === "80–89").count,
    ).toBe(1);
    expect(lecturerDashboard.body.data.classes).toHaveLength(1);

    const unrelated = await request(app)
      .get("/api/v1/dashboard")
      .set(bearer(ids.otherLecturer, UserRole.LECTURER))
      .expect(200);
    expect(unrelated.body.data.classes).toHaveLength(0);
    const outsiderDashboard = await request(app)
      .get("/api/v1/dashboard")
      .set(bearer(ids.outsider, UserRole.STUDENT))
      .expect(200);
    expect(outsiderDashboard.body.data.attendanceByClass).toHaveLength(0);
    expect(outsiderDashboard.body.data.upcomingAssignments).toHaveLength(0);

    const adminDashboard = await request(app)
      .get("/api/v1/dashboard")
      .set(bearer(ids.admin, UserRole.ADMIN))
      .expect(200);
    expect(adminDashboard.body.data.usersByRole).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "ADMIN" }),
        expect.objectContaining({ role: "LECTURER" }),
        expect.objectContaining({ role: "STUDENT" }),
      ]),
    );
  });

  it("limits announcements and notifications to their intended audience and owner", async () => {
    await request(app)
      .post("/api/v1/announcements")
      .set(bearer(ids.lecturer, UserRole.LECTURER))
      .send({
        sectionId: ids.section,
        title: "Class integration announcement",
        body: "For enrolled students only.",
      })
      .expect(201);
    await request(app)
      .post("/api/v1/announcements")
      .set(bearer(ids.admin, UserRole.ADMIN))
      .send({ title: "Global integration announcement", body: "For all students." })
      .expect(201);
    await request(app)
      .post("/api/v1/announcements")
      .set(bearer(ids.otherLecturer, UserRole.LECTURER))
      .send({
        sectionId: ids.section,
        title: "Unauthorized announcement",
        body: "Must be rejected.",
      })
      .expect(403);

    const studentAnnouncements = await request(app)
      .get("/api/v1/announcements")
      .set(bearer(ids.student, UserRole.STUDENT))
      .expect(200);
    expect(studentAnnouncements.body.data.items).toHaveLength(2);
    const outsiderAnnouncements = await request(app)
      .get("/api/v1/announcements")
      .set(bearer(ids.outsider, UserRole.STUDENT))
      .expect(200);
    expect(outsiderAnnouncements.body.data.items).toHaveLength(1);

    const studentNotifications = await request(app)
      .get("/api/v1/notifications")
      .set(bearer(ids.student, UserRole.STUDENT))
      .expect(200);
    const sectionNotification = studentNotifications.body.data.items.find(
      (item: { title: string }) => item.title === "Class integration announcement",
    );
    expect(sectionNotification).toBeDefined();
    expect(studentNotifications.body.data.unreadCount).toBeGreaterThanOrEqual(2);

    await request(app)
      .patch(`/api/v1/notifications/${sectionNotification.id}/read`)
      .set(bearer(ids.outsider, UserRole.STUDENT))
      .expect(404);
    await request(app)
      .patch(`/api/v1/notifications/${sectionNotification.id}/read`)
      .set(bearer(ids.student, UserRole.STUDENT))
      .expect(200);
    await request(app)
      .post("/api/v1/notifications/read-all")
      .set(bearer(ids.student, UserRole.STUDENT))
      .expect(200);
    const afterRead = await request(app)
      .get("/api/v1/notifications")
      .set(bearer(ids.student, UserRole.STUDENT))
      .expect(200);
    expect(afterRead.body.data.unreadCount).toBe(0);
  });

  it("creates event notifications, restricts class exports, and neutralizes CSV formulas", async () => {
    const created = await request(app)
      .post(`/api/v1/classes/${ids.section}/assignments`)
      .set(bearer(ids.lecturer, UserRole.LECTURER))
      .send({
        title: "Event integration assignment",
        deadline: new Date(Date.now() + 86_400_000).toISOString(),
        maxScore: 100,
        allowLate: false,
      })
      .expect(201);
    const assignmentId = created.body.data.assignment.id as string;
    await request(app)
      .post(`/api/v1/assignments/${assignmentId}/submissions/me`)
      .set(bearer(ids.student, UserRole.STUDENT))
      .send({ textContent: "Answer from integration test" })
      .expect(201);
    const submitted = await prisma.submission.findUniqueOrThrow({
      where: { assignmentId_studentId: { assignmentId, studentId: ids.student } },
    });
    await request(app)
      .patch(`/api/v1/assignments/${assignmentId}/submissions/${submitted.id}/grade`)
      .set(bearer(ids.lecturer, UserRole.LECTURER))
      .send({ score: 91, feedback: "Clear and complete." })
      .expect(200);
    await request(app)
      .post(`/api/v1/classes/${ids.section}/attendance/sessions`)
      .set(bearer(ids.lecturer, UserRole.LECTURER))
      .send({ title: "Notification integration session", durationMinutes: 30, lateAfterMinutes: 5 })
      .expect(201);

    const notices = await request(app)
      .get("/api/v1/notifications?page=1&pageSize=100")
      .set(bearer(ids.student, UserRole.STUDENT))
      .expect(200);
    expect(notices.body.data.items.map((item: { type: NotificationType }) => item.type)).toEqual(
      expect.arrayContaining([
        NotificationType.ASSIGNMENT,
        NotificationType.GRADE,
        NotificationType.ATTENDANCE,
      ]),
    );

    await request(app)
      .get(`/api/v1/classes/${ids.section}/grades/export.csv`)
      .set(bearer(ids.otherLecturer, UserRole.LECTURER))
      .expect(403);
    const exportResponse = await request(app)
      .get(`/api/v1/classes/${ids.section}/grades/export.csv`)
      .set(bearer(ids.lecturer, UserRole.LECTURER))
      .expect(200);
    expect(exportResponse.text).toContain("'=HYPERLINK");
    expect(exportResponse.headers["content-type"]).toContain("text/csv");
    await request(app)
      .get(`/api/v1/classes/${ids.section}/grades/export.csv`)
      .set(bearer(ids.admin, UserRole.ADMIN))
      .expect(200);
  });
});
