import dotenv from "dotenv";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { AttendanceStatus, NotificationType, PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { validateDemoDatabase } from "../src/shared/demo-database";

dotenv.config({ path: resolve(__dirname, "../../../.env") });

const prisma = new PrismaClient();

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") validateDemoDatabase(process.env);
  const demoPassword = process.env.DEMO_PASSWORD;
  if (!demoPassword || demoPassword.length < 12) {
    throw new Error(
      "Set DEMO_PASSWORD to a throwaway password of at least 12 characters before seeding.",
    );
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

  const assignmentOne = await prisma.assignment.upsert({
    where: { id: "00000000-0000-4000-8000-000000000401" },
    update: {
      sectionId: section.id,
      title: "Rancangan kebutuhan sistem",
      description: "Susun kebutuhan fungsional dan nonfungsional untuk studi kasus.",
      deadline: new Date("2026-11-20T16:00:00.000Z"),
      maxScore: 100,
      allowLate: false,
    },
    create: {
      id: "00000000-0000-4000-8000-000000000401",
      sectionId: section.id,
      title: "Rancangan kebutuhan sistem",
      description: "Susun kebutuhan fungsional dan nonfungsional untuk studi kasus.",
      deadline: new Date("2026-11-20T16:00:00.000Z"),
      maxScore: 100,
      allowLate: false,
    },
  });
  const assignmentTwo = await prisma.assignment.upsert({
    where: { id: "00000000-0000-4000-8000-000000000402" },
    update: {
      sectionId: section.id,
      title: "Diagram arsitektur",
      description: "Buat diagram arsitektur dan jelaskan keputusan desain.",
      deadline: new Date("2026-11-05T16:00:00.000Z"),
      maxScore: 50,
      allowLate: true,
    },
    create: {
      id: "00000000-0000-4000-8000-000000000402",
      sectionId: section.id,
      title: "Diagram arsitektur",
      description: "Buat diagram arsitektur dan jelaskan keputusan desain.",
      deadline: new Date("2026-11-05T16:00:00.000Z"),
      maxScore: 50,
      allowLate: true,
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

  const gradedSubmission = await prisma.submission.upsert({
    where: {
      assignmentId_studentId: {
        assignmentId: assignmentOne.id,
        studentId: students[0].id,
      },
    },
    update: {
      textContent: "Demo: kebutuhan aktor mahasiswa, dosen, dan admin beserta batasan performa.",
      score: 88,
      feedback: "Kebutuhan sudah jelas; tambahkan prioritas untuk kebutuhan nonfungsional.",
      gradedAt: new Date("2026-11-08T10:00:00.000Z"),
      submittedAt: new Date("2026-11-07T10:00:00.000Z"),
      isLate: false,
      version: 1,
    },
    create: {
      assignmentId: assignmentOne.id,
      studentId: students[0].id,
      textContent: "Demo: kebutuhan aktor mahasiswa, dosen, dan admin beserta batasan performa.",
      score: 88,
      feedback: "Kebutuhan sudah jelas; tambahkan prioritas untuk kebutuhan nonfungsional.",
      gradedAt: new Date("2026-11-08T10:00:00.000Z"),
      submittedAt: new Date("2026-11-07T10:00:00.000Z"),
      isLate: false,
      version: 1,
    },
  });
  await prisma.submissionVersion.upsert({
    where: { submissionId_version: { submissionId: gradedSubmission.id, version: 1 } },
    update: {
      textContent: gradedSubmission.textContent,
      submittedAt: gradedSubmission.submittedAt,
      isLate: false,
    },
    create: {
      submissionId: gradedSubmission.id,
      version: 1,
      textContent: gradedSubmission.textContent,
      submittedAt: gradedSubmission.submittedAt,
      isLate: false,
    },
  });
  await prisma.gradeAudit.upsert({
    where: { id: "00000000-0000-4000-8000-000000000501" },
    update: {
      submissionId: gradedSubmission.id,
      graderId: lecturer.id,
      score: 88,
      feedback: gradedSubmission.feedback,
      gradedAt: gradedSubmission.gradedAt ?? new Date(),
    },
    create: {
      id: "00000000-0000-4000-8000-000000000501",
      submissionId: gradedSubmission.id,
      graderId: lecturer.id,
      score: 88,
      feedback: gradedSubmission.feedback,
      gradedAt: gradedSubmission.gradedAt ?? new Date(),
    },
  });

  const lateSubmission = await prisma.submission.upsert({
    where: {
      assignmentId_studentId: {
        assignmentId: assignmentTwo.id,
        studentId: students[1].id,
      },
    },
    update: {
      textContent: "Demo: diagram komponen dan uraian komunikasi antar layanan.",
      submittedAt: new Date("2026-11-07T09:00:00.000Z"),
      isLate: true,
      version: 1,
      score: null,
      feedback: null,
      gradedAt: null,
    },
    create: {
      assignmentId: assignmentTwo.id,
      studentId: students[1].id,
      textContent: "Demo: diagram komponen dan uraian komunikasi antar layanan.",
      submittedAt: new Date("2026-11-07T09:00:00.000Z"),
      isLate: true,
      version: 1,
    },
  });
  await prisma.submissionVersion.upsert({
    where: { submissionId_version: { submissionId: lateSubmission.id, version: 1 } },
    update: {
      textContent: lateSubmission.textContent,
      submittedAt: lateSubmission.submittedAt,
      isLate: true,
    },
    create: {
      submissionId: lateSubmission.id,
      version: 1,
      textContent: lateSubmission.textContent,
      submittedAt: lateSubmission.submittedAt,
      isLate: true,
    },
  });

  const attendanceSessions = [
    {
      id: "00000000-0000-4000-8000-000000000601",
      title: "Pertemuan 1 - Pengantar RPL",
      daysAgo: 21,
    },
    {
      id: "00000000-0000-4000-8000-000000000602",
      title: "Pertemuan 2 - Analisis Kebutuhan",
      daysAgo: 14,
    },
    {
      id: "00000000-0000-4000-8000-000000000603",
      title: "Pertemuan 3 - Pemodelan Sistem",
      daysAgo: 7,
    },
  ];
  const attendanceBySession = [
    [AttendanceStatus.PRESENT, AttendanceStatus.LATE],
    [AttendanceStatus.PRESENT, AttendanceStatus.EXCUSED],
    [AttendanceStatus.ABSENT, AttendanceStatus.SICK],
  ];
  const attendanceRecords = [];
  for (const [index, item] of attendanceSessions.entries()) {
    const createdAt = new Date(Date.now() - item.daysAgo * 24 * 60 * 60 * 1000);
    const expiresAt = new Date(createdAt.getTime() + 60 * 60 * 1000);
    const session = await prisma.attendanceSession.upsert({
      where: { id: item.id },
      update: {
        sectionId: section.id,
        lecturerId: lecturer.id,
        title: item.title,
        lateAfterMinutes: 10,
        tokenHash: createHash("sha256").update(item.id).digest("hex"),
        createdAt,
        expiresAt,
        closedAt: expiresAt,
      },
      create: {
        id: item.id,
        sectionId: section.id,
        lecturerId: lecturer.id,
        title: item.title,
        lateAfterMinutes: 10,
        tokenHash: createHash("sha256").update(item.id).digest("hex"),
        createdAt,
        expiresAt,
        closedAt: expiresAt,
      },
    });
    for (const [studentIndex, student] of students.entries()) {
      const status = attendanceBySession[index][studentIndex];
      const checkedInAt =
        status === AttendanceStatus.PRESENT || status === AttendanceStatus.LATE
          ? new Date(createdAt.getTime() + (status === AttendanceStatus.LATE ? 16 : 5) * 60_000)
          : null;
      const attendance = await prisma.attendance.upsert({
        where: { sessionId_studentId: { sessionId: session.id, studentId: student.id } },
        update: { status, checkedInAt },
        create: { sessionId: session.id, studentId: student.id, status, checkedInAt },
      });
      attendanceRecords.push({ attendance, studentIndex, sessionIndex: index });
    }
  }
  const overriddenRecord = attendanceRecords.find(
    (record) => record.sessionIndex === 1 && record.studentIndex === 1,
  );
  if (overriddenRecord) {
    await prisma.attendanceAudit.upsert({
      where: { id: "00000000-0000-4000-8000-000000000604" },
      update: {
        attendanceId: overriddenRecord.attendance.id,
        changedById: lecturer.id,
        previousStatus: AttendanceStatus.LATE,
        status: AttendanceStatus.EXCUSED,
        reason: "Izin disetujui dosen",
      },
      create: {
        id: "00000000-0000-4000-8000-000000000604",
        attendanceId: overriddenRecord.attendance.id,
        changedById: lecturer.id,
        previousStatus: AttendanceStatus.LATE,
        status: AttendanceStatus.EXCUSED,
        reason: "Izin disetujui dosen",
      },
    });
  }

  const classAnnouncement = await prisma.announcement.upsert({
    where: { id: "00000000-0000-4000-8000-000000000701" },
    update: {
      authorId: lecturer.id,
      sectionId: section.id,
      title: "Jadwal konsultasi proyek",
      body: "Konsultasi proyek tersedia setiap Rabu pukul 13.00-15.00 di ruang dosen.",
    },
    create: {
      id: "00000000-0000-4000-8000-000000000701",
      authorId: lecturer.id,
      sectionId: section.id,
      title: "Jadwal konsultasi proyek",
      body: "Konsultasi proyek tersedia setiap Rabu pukul 13.00-15.00 di ruang dosen.",
    },
  });
  const globalAnnouncement = await prisma.announcement.upsert({
    where: { id: "00000000-0000-4000-8000-000000000702" },
    update: {
      authorId: admin.id,
      sectionId: null,
      title: "Selamat datang di semester baru",
      body: "Periksa dashboard secara berkala untuk informasi akademik terbaru.",
    },
    create: {
      id: "00000000-0000-4000-8000-000000000702",
      authorId: admin.id,
      sectionId: null,
      title: "Selamat datang di semester baru",
      body: "Periksa dashboard secara berkala untuk informasi akademik terbaru.",
    },
  });
  const demoNotifications = [
    {
      id: "00000000-0000-4000-8000-000000000711",
      userId: students[0].id,
      type: NotificationType.ANNOUNCEMENT,
      title: classAnnouncement.title,
      body: classAnnouncement.body,
      href: "/dashboard",
      readAt: null,
    },
    {
      id: "00000000-0000-4000-8000-000000000712",
      userId: students[0].id,
      type: NotificationType.GRADE,
      title: "Nilai tersedia: Rancangan kebutuhan sistem",
      body: "Dosen telah memberikan nilai dan feedback untuk tugasmu.",
      href: "/student/assignments",
      readAt: null,
    },
    {
      id: "00000000-0000-4000-8000-000000000713",
      userId: students[0].id,
      type: NotificationType.ANNOUNCEMENT,
      title: globalAnnouncement.title,
      body: globalAnnouncement.body,
      href: "/dashboard",
      readAt: new Date(),
    },
    {
      id: "00000000-0000-4000-8000-000000000714",
      userId: students[1].id,
      type: NotificationType.ASSIGNMENT,
      title: "Tugas baru: Diagram arsitektur",
      body: "Tugas baru tersedia. Buka daftar tugas untuk melihat detail.",
      href: "/student/assignments",
      readAt: null,
    },
    {
      id: "00000000-0000-4000-8000-000000000715",
      userId: students[1].id,
      type: NotificationType.ATTENDANCE,
      title: "Sesi absensi dibuka",
      body: "Sesi absensi dibuka. Segera lakukan check-in melalui QR.",
      href: "/student/attendance",
      readAt: null,
    },
    {
      id: "00000000-0000-4000-8000-000000000716",
      userId: students[1].id,
      type: NotificationType.ANNOUNCEMENT,
      title: globalAnnouncement.title,
      body: globalAnnouncement.body,
      href: "/dashboard",
      readAt: null,
    },
  ];
  for (const notification of demoNotifications) {
    await prisma.notification.upsert({
      where: { id: notification.id },
      update: notification,
      create: notification,
    });
  }

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
