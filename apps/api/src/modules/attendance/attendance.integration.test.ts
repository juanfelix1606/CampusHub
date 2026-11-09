import { AttendanceStatus, PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";
import { PrismaAuthRepository } from "../auth/auth.repository";
import { hashSessionNonce, issueQrToken } from "./attendance-token";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl)
  throw new Error("TEST_DATABASE_URL is required for attendance integration tests.");
if (!new URL(databaseUrl).pathname.replace(/^\//, "").endsWith("_test")) {
  throw new Error("Attendance integration tests require a dedicated database ending in _test.");
}

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const marker = `attendance-integration-${randomUUID()}`;
const accessSecret = "postgres-integration-test-secret-longer-than-32-characters";
const qrSecret = "postgres-attendance-qr-secret-longer-than-32-characters";
const app = createApp(
  {
    accessTokenSecret: accessSecret,
    attendanceQrSecret: qrSecret,
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
  otherStudent: randomUUID(),
  outsider: randomUUID(),
  course: randomUUID(),
  semester: randomUUID(),
  section: randomUUID(),
  otherSection: randomUUID(),
};

function bearer(userId: string, role: UserRole) {
  return {
    Authorization: `Bearer ${jwt.sign({ role }, accessSecret, {
      algorithm: "HS256",
      subject: userId,
      expiresIn: 900,
    })}`,
  };
}

async function openSession(classId = ids.section, title = "Integration attendance") {
  const response = await request(app)
    .post(`/api/v1/classes/${classId}/attendance/sessions`)
    .set(bearer(ids.lecturer, UserRole.LECTURER))
    .send({ title, durationMinutes: 60, lateAfterMinutes: 10 })
    .expect(201);
  return response.body.data.session as { id: string; createdAt: string };
}

async function getQr(sessionId: string) {
  const response = await request(app)
    .get(`/api/v1/attendance/sessions/${sessionId}/qr`)
    .set(bearer(ids.lecturer, UserRole.LECTURER))
    .expect(200);
  return response.body.data as { token: string; sessionId: string; expiresAt: string };
}

beforeAll(async () => {
  await prisma.$connect();
  const passwordHash = await bcrypt.hash("Integration-only-password-123", 4);
  await prisma.user.createMany({
    data: [
      {
        id: ids.admin,
        name: "Attendance Admin",
        email: `${marker}-admin@test.local`,
        passwordHash,
        role: "ADMIN",
      },
      {
        id: ids.lecturer,
        name: "Attendance Lecturer",
        email: `${marker}-lecturer@test.local`,
        passwordHash,
        role: "LECTURER",
      },
      {
        id: ids.otherLecturer,
        name: "Other Attendance Lecturer",
        email: `${marker}-other-lecturer@test.local`,
        passwordHash,
        role: "LECTURER",
      },
      {
        id: ids.student,
        name: "Attendance Student",
        email: `${marker}-student@test.local`,
        passwordHash,
        role: "STUDENT",
      },
      {
        id: ids.otherStudent,
        name: "Second Attendance Student",
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
      code: `Q${randomUUID().slice(0, 7).toUpperCase()}`,
      name: "Attendance Integration Course",
      credits: 3,
    },
  });
  await prisma.classSection.createMany({
    data: [
      {
        id: ids.section,
        courseId: ids.course,
        semesterId: ids.semester,
        lecturerId: ids.lecturer,
        name: "A",
      },
      {
        id: ids.otherSection,
        courseId: ids.course,
        semesterId: ids.semester,
        lecturerId: ids.lecturer,
        name: "B",
      },
    ],
  });
  await prisma.enrollment.createMany({
    data: [
      { sectionId: ids.section, studentId: ids.student },
      { sectionId: ids.section, studentId: ids.otherStudent },
      { sectionId: ids.otherSection, studentId: ids.student },
    ],
  });

  for (let index = 0; index < 3; index += 1) {
    const startedAt = new Date(Date.now() - (index + 2) * 24 * 60 * 60 * 1000);
    const session = await prisma.attendanceSession.create({
      data: {
        sectionId: ids.section,
        lecturerId: ids.lecturer,
        title: `Historical session ${index + 1}`,
        lateAfterMinutes: 10,
        tokenHash: hashSessionNonce(),
        createdAt: startedAt,
        expiresAt: new Date(startedAt.getTime() + 60 * 60 * 1000),
        closedAt: new Date(startedAt.getTime() + 60 * 60 * 1000),
      },
    });
    const statuses = [
      [AttendanceStatus.PRESENT, AttendanceStatus.LATE, AttendanceStatus.ABSENT],
      [AttendanceStatus.LATE, AttendanceStatus.EXCUSED, AttendanceStatus.ABSENT],
      [AttendanceStatus.PRESENT, AttendanceStatus.SICK, AttendanceStatus.ABSENT],
    ][index];
    for (const [studentIndex, studentId] of [ids.student, ids.otherStudent].entries()) {
      await prisma.attendance.create({
        data: {
          sessionId: session.id,
          studentId,
          status: statuses[studentIndex],
          checkedInAt:
            statuses[studentIndex] === AttendanceStatus.PRESENT ||
            statuses[studentIndex] === AttendanceStatus.LATE
              ? new Date(startedAt.getTime() + 2 * 60_000)
              : null,
        },
      });
    }
  }
}, 20_000);

afterAll(async () => {
  await prisma.classSection.deleteMany({ where: { id: { in: [ids.section, ids.otherSection] } } });
  await prisma.course.deleteMany({ where: { id: ids.course } });
  await prisma.semester.deleteMany({ where: { id: ids.semester } });
  await prisma.user.deleteMany({ where: { email: { startsWith: marker } } });
  await prisma.$disconnect();
});

afterEach(async () => {
  await prisma.attendanceSession.updateMany({
    where: { sectionId: { in: [ids.section, ids.otherSection] }, closedAt: null },
    data: { closedAt: new Date() },
  });
});

describe("QR attendance with PostgreSQL", () => {
  it("opens sessions only for the assigned lecturer and blocks overlapping live sessions", async () => {
    await request(app)
      .post(`/api/v1/classes/${ids.section}/attendance/sessions`)
      .set(bearer(ids.otherLecturer, UserRole.LECTURER))
      .send({ title: "Not allowed", durationMinutes: 60 })
      .expect(403);

    const session = await openSession();
    await request(app)
      .post(`/api/v1/classes/${ids.section}/attendance/sessions`)
      .set(bearer(ids.lecturer, UserRole.LECTURER))
      .send({ title: "Overlapping", durationMinutes: 30 })
      .expect(409);
    await request(app)
      .get(`/api/v1/attendance/sessions/${session.id}/qr`)
      .set(bearer(ids.otherLecturer, UserRole.LECTURER))
      .expect(403);
    await request(app)
      .get(`/api/v1/attendance/sessions/${session.id}/qr`)
      .set(bearer(ids.student, UserRole.STUDENT))
      .expect(403);
    await request(app)
      .get(`/api/v1/attendance/sessions/${session.id}/qr`)
      .set(bearer(ids.admin, UserRole.ADMIN))
      .expect(403);
  });

  it("checks in enrolled students once and serializes simultaneous duplicate requests", async () => {
    const session = await openSession(ids.section, "Concurrent check-in");
    const qr = await getQr(session.id);
    const body = { sessionId: session.id, token: qr.token };
    const headers = bearer(ids.student, UserRole.STUDENT);
    const historyBeforeCheckIn = await request(app)
      .get(`/api/v1/attendance/me?classId=${ids.section}`)
      .set(headers)
      .expect(200);
    expect(
      historyBeforeCheckIn.body.data.items.some((item: { id: string }) => item.id === session.id),
    ).toBe(false);
    const results = await Promise.all([
      request(app).post("/api/v1/attendance/check-in").set(headers).send(body),
      request(app).post("/api/v1/attendance/check-in").set(headers).send(body),
    ]);
    expect(results.map(({ status }) => status).sort()).toEqual([201, 409]);
    const records = await prisma.attendance.findMany({ where: { sessionId: session.id } });
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe(AttendanceStatus.PRESENT);
    const historyAfterCheckIn = await request(app)
      .get(`/api/v1/attendance/me?classId=${ids.section}`)
      .set(headers)
      .expect(200);
    expect(
      historyAfterCheckIn.body.data.items.find((item: { id: string }) => item.id === session.id)
        .myAttendance.status,
    ).toBe(AttendanceStatus.PRESENT);

    await request(app)
      .post("/api/v1/attendance/check-in")
      .set(bearer(ids.outsider, UserRole.STUDENT))
      .send(body)
      .expect(403);
  });

  it("binds a token to the requested session and rejects expired tokens", async () => {
    const first = await openSession(ids.section, "Token owner");
    const other = await openSession(ids.otherSection, "Other token owner");
    const firstQr = await getQr(first.id);
    await request(app)
      .post("/api/v1/attendance/check-in")
      .set(bearer(ids.student, UserRole.STUDENT))
      .send({ sessionId: other.id, token: firstQr.token })
      .expect(409);

    const expiredToken = issueQrToken(first.id, qrSecret, new Date(Date.now() - 120_000)).token;
    await request(app)
      .post("/api/v1/attendance/check-in")
      .set(bearer(ids.student, UserRole.STUDENT))
      .send({ sessionId: first.id, token: expiredToken })
      .expect(401);
  });

  it("marks late check-ins using server time and rejects check-in after closing", async () => {
    const lateSession = await prisma.attendanceSession.create({
      data: {
        sectionId: ids.section,
        lecturerId: ids.lecturer,
        title: "Late check-in test",
        lateAfterMinutes: 0,
        tokenHash: hashSessionNonce(),
        createdAt: new Date(Date.now() - 60_000),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      },
    });
    const lateQr = await getQr(lateSession.id);
    await request(app)
      .post("/api/v1/attendance/check-in")
      .set(bearer(ids.otherStudent, UserRole.STUDENT))
      .send({ sessionId: lateSession.id, token: lateQr.token })
      .expect(201)
      .expect(({ body }) => expect(body.data.attendance.status).toBe(AttendanceStatus.LATE));

    const closedSession = await openSession(ids.otherSection, "Closed session");
    const closedQr = await getQr(closedSession.id);
    await request(app)
      .post(`/api/v1/attendance/sessions/${closedSession.id}/close`)
      .set(bearer(ids.lecturer, UserRole.LECTURER))
      .expect(200);
    await request(app)
      .post("/api/v1/attendance/check-in")
      .set(bearer(ids.student, UserRole.STUDENT))
      .send({ sessionId: closedSession.id, token: closedQr.token })
      .expect(409);
    await request(app)
      .get(`/api/v1/attendance/sessions/${closedSession.id}/qr`)
      .set(bearer(ids.lecturer, UserRole.LECTURER))
      .expect(409);
  });

  it("records manual status overrides and returns live roster counts with audit history", async () => {
    const session = await openSession(ids.section, "Manual override session");
    const qr = await getQr(session.id);
    await request(app)
      .post("/api/v1/attendance/check-in")
      .set(bearer(ids.student, UserRole.STUDENT))
      .send({ sessionId: session.id, token: qr.token })
      .expect(201);
    await request(app)
      .patch(`/api/v1/attendance/sessions/${session.id}/records/${ids.student}`)
      .set(bearer(ids.lecturer, UserRole.LECTURER))
      .send({ status: "EXCUSED", reason: "Surat izin diterima" })
      .expect(200);

    const records = await request(app)
      .get(`/api/v1/attendance/sessions/${session.id}/records?page=1&pageSize=1`)
      .set(bearer(ids.lecturer, UserRole.LECTURER))
      .expect(200);
    expect(records.body.data.items).toHaveLength(1);
    expect(records.body.data.counts).toMatchObject({ EXCUSED: 1, ABSENT: 1 });
    const attendance = await prisma.attendance.findUniqueOrThrow({
      where: { sessionId_studentId: { sessionId: session.id, studentId: ids.student } },
      include: { audits: true },
    });
    expect(attendance.audits[0]).toMatchObject({
      changedById: ids.lecturer,
      previousStatus: AttendanceStatus.PRESENT,
      status: AttendanceStatus.EXCUSED,
      reason: "Surat izin diterima",
    });
  });

  it("lists student history, class percentages, filters and injection-safe CSV exports", async () => {
    await prisma.user.update({
      where: { id: ids.student },
      data: { name: '=HYPERLINK("https://example.test","Click")' },
    });
    const summary = await request(app)
      .get(`/api/v1/classes/${ids.section}/attendance/me`)
      .set(bearer(ids.student, UserRole.STUDENT))
      .expect(200);
    expect(summary.body.data.summary.totalSessions).toBeGreaterThanOrEqual(3);
    expect(summary.body.data.summary.percentage).toBeGreaterThanOrEqual(0);
    expect(
      ["PRESENT", "LATE", "EXCUSED", "SICK", "ABSENT"].reduce(
        (total, status) => total + summary.body.data.summary[status],
        0,
      ),
    ).toBe(summary.body.data.summary.totalSessions);

    const history = await request(app)
      .get(`/api/v1/attendance/me?status=PRESENT&page=1&pageSize=10`)
      .set(bearer(ids.student, UserRole.STUDENT))
      .expect(200);
    expect(history.body.data.items.length).toBeGreaterThanOrEqual(2);

    const exportSession = await prisma.attendanceSession.findFirstOrThrow({
      where: { sectionId: ids.section, title: "Historical session 1" },
    });
    const csv = await request(app)
      .get(`/api/v1/attendance/sessions/${exportSession.id}/export.csv`)
      .set(bearer(ids.lecturer, UserRole.LECTURER))
      .expect(200);
    expect(csv.text).toContain("'=HYPERLINK(");
    expect(csv.headers["content-type"]).toContain("text/csv");

    await request(app)
      .get(`/api/v1/classes/${ids.section}/attendance/export.csv`)
      .set(bearer(ids.otherLecturer, UserRole.LECTURER))
      .expect(403);
  });
});
