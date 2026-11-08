import { Prisma, PrismaClient } from "@prisma/client";
import type { MaterialFields, MaterialUpdate } from "./material.schemas";

export class PrismaMaterialRepository {
  constructor(private readonly prisma: PrismaClient) {}

  getClassOwner(classId: string) {
    return this.prisma.classSection.findUnique({
      where: { id: classId },
      select: { lecturerId: true },
    });
  }

  async canAccessClass(classId: string, studentId: string): Promise<boolean> {
    return (
      (await this.prisma.enrollment.count({ where: { sectionId: classId, studentId } })) > 0
    );
  }

  async list(classId: string, page: number, pageSize: number) {
    const where = { sectionId: classId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.material.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.material.count({ where }),
    ]);
    return { items, total };
  }

  findById(id: string) {
    return this.prisma.material.findUnique({ where: { id } });
  }

  create(input: MaterialFields & {
    sectionId: string;
    lecturerId: string;
    fileKey: string;
    fileName: string;
    contentType: string;
  }) {
    return this.prisma.material.create({ data: input });
  }

  update(id: string, input: MaterialUpdate & Partial<{
    fileKey: string;
    fileName: string;
    contentType: string;
  }>) {
    return this.prisma.material.update({ where: { id }, data: input });
  }

  async delete(id: string) {
    return this.prisma.material.delete({ where: { id } });
  }

  async findWithClassAccess(id: string) {
    const material = await this.prisma.material.findUnique({
      where: { id },
      include: { section: { select: { lecturerId: true } } },
    });
    return material;
  }
}
