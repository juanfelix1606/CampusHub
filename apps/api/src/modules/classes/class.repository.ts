import { Prisma, PrismaClient } from "@prisma/client";
import type { PaginationInput } from "../../shared/pagination";
import type { ClassInput, ClassUpdateInput } from "./class.schemas";

export type ClassListScope =
  | { role: "ADMIN" }
  | { role: "LECTURER"; userId: string }
  | { role: "STUDENT"; userId: string; enrolled: boolean };

export class PrismaClassRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(input: PaginationInput, scope: ClassListScope) {
    const where: Prisma.ClassSectionWhereInput = {
      ...(input.semesterId ? { semesterId: input.semesterId } : {}),
      ...(input.q
        ? {
            OR: [
              { name: { contains: input.q, mode: "insensitive" } },
              { course: { code: { contains: input.q, mode: "insensitive" } } },
              { course: { name: { contains: input.q, mode: "insensitive" } } },
            ],
          }
        : {}),
      ...(scope.role === "LECTURER" ? { lecturerId: scope.userId } : {}),
      ...(scope.role === "STUDENT"
        ? { enrollments: scope.enrolled ? { some: { studentId: scope.userId } } : { none: { studentId: scope.userId } } }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.classSection.findMany({
        where,
        include: {
          course: true,
          semester: true,
          lecturer: { select: { id: true, name: true, email: true } },
          _count: { select: { enrollments: true } },
        },
        orderBy: [{ semester: { startsAt: "desc" } }, { course: { code: "asc" } }, { name: "asc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.classSection.count({ where }),
    ]);
    return { items, total };
  }

  listSemesters() {
    return this.prisma.semester.findMany({ orderBy: { startsAt: "desc" } });
  }

  listLecturers() {
    return this.prisma.user.findMany({
      where: { role: "LECTURER" },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });
  }

  findLecturer(lecturerId: string) {
    return this.prisma.user.findFirst({ where: { id: lecturerId, role: "LECTURER" }, select: { id: true } });
  }

  findById(id: string) {
    return this.prisma.classSection.findUnique({
      where: { id },
      include: {
        course: true,
        semester: true,
        lecturer: { select: { id: true, name: true, email: true } },
        _count: { select: { enrollments: true } },
      },
    });
  }

  create(input: ClassInput) {
    return this.prisma.classSection.create({
      data: input,
      include: { course: true, semester: true, lecturer: { select: { id: true, name: true } } },
    });
  }

  async update(id: string, input: ClassUpdateInput) {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "ClassSection" WHERE "id" = ${id}::uuid FOR UPDATE`;
      if (input.capacity !== undefined) {
        const [section, enrollmentCount] = await Promise.all([
          transaction.classSection.findUnique({ where: { id }, select: { id: true } }),
          transaction.enrollment.count({ where: { sectionId: id } }),
        ]);
        if (!section) throw new ClassSectionNotFoundError();
        if (input.capacity < enrollmentCount) throw new ClassCapacityError();
      }
      return transaction.classSection.update({
        where: { id },
        data: input,
        include: { course: true, semester: true, lecturer: { select: { id: true, name: true } } },
      });
    });
  }

  async delete(id: string) {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "ClassSection" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const [enrollmentCount, materialCount] = await Promise.all([
        transaction.enrollment.count({ where: { sectionId: id } }),
        transaction.material.count({ where: { sectionId: id } }),
      ]);
      if (enrollmentCount > 0 || materialCount > 0) return false;
      await transaction.classSection.delete({ where: { id } });
      return true;
    });
  }

  async canAccess(sectionId: string, studentId: string): Promise<boolean> {
    return (
      (await this.prisma.enrollment.count({ where: { sectionId, studentId } })) > 0
    );
  }

  async enroll(sectionId: string, studentId: string): Promise<void> {
    const enrolled = await this.prisma.$transaction(async (transaction) => {
      const lockedRows = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "ClassSection" WHERE "id" = ${sectionId}::uuid FOR UPDATE
      `;
      if (lockedRows.length === 0) return false;
      const section = await transaction.classSection.findUnique({ where: { id: sectionId } });
      if (!section) return false;
      const existing = await transaction.enrollment.findUnique({
        where: { sectionId_studentId: { sectionId, studentId } },
      });
      if (existing) throw new EnrollmentDuplicateError();
      const enrollmentCount = await transaction.enrollment.count({ where: { sectionId } });
      if (enrollmentCount >= section.capacity) throw new ClassCapacityError();
      await transaction.enrollment.create({ data: { sectionId, studentId } });
      return true;
    });
    if (!enrolled) throw new ClassSectionNotFoundError();
  }

  async unenroll(sectionId: string, studentId: string): Promise<boolean> {
    const result = await this.prisma.enrollment.deleteMany({ where: { sectionId, studentId } });
    return result.count > 0;
  }
}

export class EnrollmentDuplicateError extends Error {}
export class ClassCapacityError extends Error {}
export class ClassSectionNotFoundError extends Error {}
