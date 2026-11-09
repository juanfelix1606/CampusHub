import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";
import { PrismaAuthRepository } from "../auth/auth.repository";
import type { FileStorage } from "../materials/file-storage";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for class integration tests.");
if (!new URL(databaseUrl).pathname.replace(/^\//, "").endsWith("_test")) {
  throw new Error("Class integration tests require a dedicated database ending in _test.");
}

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const marker = `classes-integration-${randomUUID()}`;
const secret = "postgres-integration-test-secret-longer-than-32-characters";
const config = {
  accessTokenSecret: secret,
  attendanceQrSecret: "postgres-attendance-qr-secret-longer-than-32-characters",
  accessTokenExpiresInSeconds: 900,
  refreshTokenExpiresInMs: 60_000,
  webOrigin: "http://localhost:5173",
  cookieSecure: false,
};

class MemoryFileStorage implements FileStorage {
  files = new Map<string, Buffer>();
  async save(key: string, contents: Buffer) { this.files.set(key, Buffer.from(contents)); }
  async read(key: string) {
    const contents = this.files.get(key);
    if (!contents) throw new Error("File not found.");
    return Buffer.from(contents);
  }
  async delete(key: string) { this.files.delete(key); }
}

const storage = new MemoryFileStorage();
const app = createApp(config, new PrismaAuthRepository(prisma), {
  database: prisma,
  materialStorage: storage,
});
const ids = {
  admin: randomUUID(),
  lecturer: randomUUID(),
  otherLecturer: randomUUID(),
  student: randomUUID(),
  otherStudent: randomUUID(),
  thirdStudent: randomUUID(),
  course: randomUUID(),
  semester: randomUUID(),
  section: randomUUID(),
  concurrentSection: randomUUID(),
};

function accessToken(userId: string, role: UserRole): string {
  return jwt.sign({ role }, secret, { algorithm: "HS256", subject: userId, expiresIn: 900 });
}

function bearer(userId: string, role: UserRole) {
  return { Authorization: `Bearer ${accessToken(userId, role)}` };
}

beforeAll(async () => {
  await prisma.$connect();
  const passwordHash = await bcrypt.hash("Integration-only-password-123", 4);
  await prisma.user.createMany({
    data: [
      { id: ids.admin, name: "Test Admin", email: `${marker}-admin@test.local`, passwordHash, role: "ADMIN" },
      { id: ids.lecturer, name: "Test Lecturer", email: `${marker}-lecturer@test.local`, passwordHash, role: "LECTURER" },
      { id: ids.otherLecturer, name: "Other Lecturer", email: `${marker}-other-lecturer@test.local`, passwordHash, role: "LECTURER" },
      { id: ids.student, name: "Test Student", email: `${marker}-student@test.local`, passwordHash, role: "STUDENT" },
      { id: ids.otherStudent, name: "Other Student", email: `${marker}-other-student@test.local`, passwordHash, role: "STUDENT" },
      { id: ids.thirdStudent, name: "Third Student", email: `${marker}-third-student@test.local`, passwordHash, role: "STUDENT" },
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
    data: { id: ids.course, code: `T${randomUUID().slice(0, 7).toUpperCase()}`, name: "Integration Course", credits: 3 },
  });
  await prisma.classSection.create({
    data: {
      id: ids.section,
      courseId: ids.course,
      semesterId: ids.semester,
      lecturerId: ids.lecturer,
      name: "A",
      capacity: 2,
    },
  });
}, 20_000);

afterAll(async () => {
  await prisma.classSection.deleteMany({ where: { id: { in: [ids.section, ids.concurrentSection] } } });
  await prisma.course.deleteMany({ where: { id: ids.course } });
  await prisma.semester.deleteMany({ where: { id: ids.semester } });
  await prisma.user.deleteMany({ where: { email: { startsWith: marker } } });
  await prisma.$disconnect();
});

describe("course, class, enrollment, and material access with PostgreSQL", () => {
  it("limits class management and material access to the lecturer and enrolled students", async () => {
    await request(app)
      .post(`/api/v1/classes/${ids.section}/materials`)
      .set(bearer(ids.otherLecturer, UserRole.LECTURER))
      .field("title", "Unauthorized upload")
      .attach("file", Buffer.from("%PDF-1.4\n"), {
        filename: "notes.pdf",
        contentType: "application/pdf",
      })
      .expect(403);

    await request(app)
      .get(`/api/v1/classes/${ids.section}/materials`)
      .set(bearer(ids.student, UserRole.STUDENT))
      .expect(403);

    await request(app)
      .post(`/api/v1/classes/${ids.section}/enrollments/me`)
      .set(bearer(ids.student, UserRole.STUDENT))
      .expect(201);
    await request(app)
      .post(`/api/v1/classes/${ids.section}/enrollments/me`)
      .set(bearer(ids.otherStudent, UserRole.STUDENT))
      .expect(201);
    await request(app)
      .patch(`/api/v1/classes/${ids.section}`)
      .set(bearer(ids.admin, UserRole.ADMIN))
      .send({ capacity: 1 })
      .expect(409);
    await request(app)
      .post(`/api/v1/classes/${ids.section}/enrollments/me`)
      .set(bearer(ids.thirdStudent, UserRole.STUDENT))
      .expect(409);

    await request(app)
      .post(`/api/v1/classes/${ids.section}/materials`)
      .set(bearer(ids.lecturer, UserRole.LECTURER))
      .field("title", "Week one notes")
      .field("description", "A PDF used by the integration test.")
      .attach("file", Buffer.from("%PDF-1.4\nCampusHub test"), {
        filename: "notes.pdf",
        contentType: "application/pdf",
      })
      .expect(201)
      .expect(({ body }) => expect(body.data.material.fileKey).not.toBe("notes.pdf"));

    const materials = await request(app)
      .get(`/api/v1/classes/${ids.section}/materials?page=1&pageSize=5`)
      .set(bearer(ids.student, UserRole.STUDENT))
      .expect(200);
    expect(materials.body.data.items).toHaveLength(1);
    const materialId = materials.body.data.items[0].id as string;
    await request(app)
      .patch(`/api/v1/materials/${materialId}`)
      .set(bearer(ids.lecturer, UserRole.LECTURER))
      .send({ title: "Updated week one notes" })
      .expect(200)
      .expect(({ body }) => expect(body.data.material.title).toBe("Updated week one notes"));

    await request(app)
      .get(`/api/v1/materials/${materialId}/download`)
      .set(bearer(ids.student, UserRole.STUDENT))
      .expect(200)
      .expect((response) => expect(response.body.toString()).toContain("%PDF-1.4"));
    await request(app)
      .get(`/api/v1/materials/${materialId}/download`)
      .set(bearer(ids.thirdStudent, UserRole.STUDENT))
      .expect(403);
    await request(app)
      .patch(`/api/v1/materials/${materialId}`)
      .set(bearer(ids.otherLecturer, UserRole.LECTURER))
      .field("title", "Hijack")
      .expect(403);
    await request(app)
      .delete(`/api/v1/materials/${materialId}`)
      .set(bearer(ids.lecturer, UserRole.LECTURER))
      .expect(204);
    expect(storage.files.size).toBe(0);
  });

  it("rejects mismatched and spoofed upload types", async () => {
    await request(app)
      .post(`/api/v1/classes/${ids.section}/materials`)
      .set(bearer(ids.lecturer, UserRole.LECTURER))
      .field("title", "Wrong extension")
      .attach("file", Buffer.from("%PDF-1.4\n"), {
        filename: "notes.txt",
        contentType: "text/plain",
      })
      .expect(400);

    await request(app)
      .post(`/api/v1/classes/${ids.section}/materials`)
      .set(bearer(ids.lecturer, UserRole.LECTURER))
      .field("title", "Spoofed content")
      .attach("file", Buffer.from("not actually a pdf"), {
        filename: "spoof.pdf",
        contentType: "application/pdf",
      })
      .expect(400);
  });

  it("serializes concurrent enrollment so a single-seat class cannot overfill", async () => {
    await prisma.classSection.create({
      data: {
        id: ids.concurrentSection,
        courseId: ids.course,
        semesterId: ids.semester,
        lecturerId: ids.lecturer,
        name: "Concurrent",
        capacity: 1,
      },
    });

    const responses = await Promise.all([
      request(app)
        .post(`/api/v1/classes/${ids.concurrentSection}/enrollments/me`)
        .set(bearer(ids.student, UserRole.STUDENT)),
      request(app)
        .post(`/api/v1/classes/${ids.concurrentSection}/enrollments/me`)
        .set(bearer(ids.otherStudent, UserRole.STUDENT)),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await prisma.enrollment.count({ where: { sectionId: ids.concurrentSection } })).toBe(1);
  });

  it("allows administrators to create courses and sections with pagination and filters", async () => {
    const course = await request(app)
      .post("/api/v1/courses")
      .set(bearer(ids.admin, UserRole.ADMIN))
      .send({ code: "CAP101", name: "Capacity Planning", credits: 3 })
      .expect(201);
    await request(app)
      .get(`/api/v1/courses/${course.body.data.course.id}`)
      .set(bearer(ids.admin, UserRole.ADMIN))
      .expect(200)
      .expect(({ body }) => expect(body.data.course.code).toBe("CAP101"));
    await request(app)
      .post("/api/v1/courses")
      .set(bearer(ids.admin, UserRole.ADMIN))
      .send({ code: "CAP101", name: "Duplicate Course", credits: 2 })
      .expect(409);

    const createdSection = await request(app)
      .post("/api/v1/classes")
      .set(bearer(ids.admin, UserRole.ADMIN))
      .send({
        courseId: course.body.data.course.id,
        semesterId: ids.semester,
        lecturerId: ids.lecturer,
        name: "B",
        capacity: 25,
      })
      .expect(201);
    expect(createdSection.body.data.classSection.capacity).toBe(25);
    const listing = await request(app)
      .get(`/api/v1/classes?q=Capacity&semesterId=${ids.semester}&page=1&pageSize=1`)
      .set(bearer(ids.admin, UserRole.ADMIN))
      .expect(200);
    expect(listing.body.data.pagination).toMatchObject({ page: 1, pageSize: 1, total: 1 });
    await request(app)
      .patch(`/api/v1/classes/${createdSection.body.data.classSection.id}`)
      .set(bearer(ids.admin, UserRole.ADMIN))
      .send({ capacity: 0 })
      .expect(400);
    await prisma.classSection.delete({ where: { id: createdSection.body.data.classSection.id } });
    await prisma.course.delete({ where: { id: course.body.data.course.id } });
  });
});
