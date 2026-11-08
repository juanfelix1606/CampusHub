import dotenv from "dotenv";
import { resolve } from "node:path";
import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

dotenv.config({ path: resolve(__dirname, "../../../.env") });

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const demoPassword = process.env.DEMO_PASSWORD;
  if (!demoPassword || demoPassword.length < 12) {
    throw new Error("Set DEMO_PASSWORD to a throwaway password of at least 12 characters before seeding.");
  }

  const passwordHash = await bcrypt.hash(demoPassword, 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@campushub.local" },
    update: { name: "CampusHub Admin", passwordHash, role: UserRole.ADMIN },
    create: {
      name: "CampusHub Admin",
      email: "admin@campushub.local",
      passwordHash,
      role: UserRole.ADMIN,
    },
  });
  const lecturer = await prisma.user.upsert({
    where: { email: "dosen@campushub.local" },
    update: { name: "Dosen Demo", passwordHash, role: UserRole.LECTURER },
    create: {
      name: "Dosen Demo",
      email: "dosen@campushub.local",
      passwordHash,
      role: UserRole.LECTURER,
    },
  });
  const students = await Promise.all(
    ["mahasiswa1@campushub.local", "mahasiswa2@campushub.local"].map((email, index) =>
      prisma.user.upsert({
        where: { email },
        update: { name: `Mahasiswa Demo ${index + 1}`, passwordHash, role: UserRole.STUDENT },
        create: {
          name: `Mahasiswa Demo ${index + 1}`,
          email,
          passwordHash,
          role: UserRole.STUDENT,
        },
      }),
    ),
  );

  const semester = await prisma.semester.upsert({
    where: { name: "Ganjil 2026/2027" },
    update: { startsAt: new Date("2026-08-01"), endsAt: new Date("2027-01-31"), isActive: true },
    create: {
      name: "Ganjil 2026/2027",
      startsAt: new Date("2026-08-01"),
      endsAt: new Date("2027-01-31"),
      isActive: true,
    },
  });
  const course = await prisma.course.upsert({
    where: { code: "IF301" },
    update: { name: "Rekayasa Perangkat Lunak", credits: 3 },
    create: { code: "IF301", name: "Rekayasa Perangkat Lunak", credits: 3 },
  });
  const section = await prisma.classSection.upsert({
    where: {
      courseId_semesterId_name: { courseId: course.id, semesterId: semester.id, name: "A" },
    },
    update: { lecturerId: lecturer.id },
    create: {
      courseId: course.id,
      semesterId: semester.id,
      lecturerId: lecturer.id,
      name: "A",
    },
  });

  await Promise.all(
    students.map((student) =>
      prisma.enrollment.upsert({
        where: { sectionId_studentId: { sectionId: section.id, studentId: student.id } },
        update: {},
        create: { sectionId: section.id, studentId: student.id },
      }),
    ),
  );

  console.info(
    `Seed complete: ${admin.email}, ${lecturer.email}, ${students.map((student) => student.email).join(", ")}`,
  );
}

main()
  .catch((error: unknown) => {
    console.error("Database seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
