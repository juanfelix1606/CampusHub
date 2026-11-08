import { Prisma, PrismaClient } from "@prisma/client";
import type { CourseInput, CourseUpdateInput } from "./course.schemas";
import type { PaginationInput } from "../../shared/pagination";

export class PrismaCourseRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(input: PaginationInput) {
    const where: Prisma.CourseWhereInput = input.q
      ? {
          OR: [
            { code: { contains: input.q, mode: "insensitive" } },
            { name: { contains: input.q, mode: "insensitive" } },
          ],
        }
      : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({
        where,
        orderBy: { code: "asc" },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.course.count({ where }),
    ]);
    return { items, total };
  }

  findById(id: string) {
    return this.prisma.course.findUnique({ where: { id } });
  }

  create(input: CourseInput) {
    return this.prisma.course.create({ data: input });
  }

  update(id: string, input: CourseUpdateInput) {
    return this.prisma.course.update({ where: { id }, data: input });
  }

  async delete(id: string) {
    return this.prisma.course.delete({ where: { id } });
  }
}
