import { Prisma } from "@prisma/client";
import { ConflictError, NotFoundError } from "../../shared/errors";
import { paginated, type PaginationInput } from "../../shared/pagination";
import { isUniqueConstraintError } from "../auth/auth.repository";
import type { CourseInput, CourseUpdateInput } from "./course.schemas";
import { PrismaCourseRepository } from "./course.repository";

export class CourseService {
  constructor(private readonly repository: PrismaCourseRepository) {}

  async list(input: PaginationInput) {
    const result = await this.repository.list(input);
    return paginated(result.items, result.total, input.page, input.pageSize);
  }

  async getOne(id: string) {
    const course = await this.repository.findById(id);
    if (!course) throw new NotFoundError("Course not found.");
    return course;
  }

  async create(input: CourseInput) {
    try {
      return await this.repository.create(input);
    } catch (error) {
      if (isUniqueConstraintError(error)) throw new ConflictError("A course with this code already exists.");
      throw error;
    }
  }

  async update(id: string, input: CourseUpdateInput) {
    try {
      return await this.repository.update(id, input);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new NotFoundError("Course not found.");
      }
      if (isUniqueConstraintError(error)) throw new ConflictError("A course with this code already exists.");
      throw error;
    }
  }

  async delete(id: string) {
    try {
      return await this.repository.delete(id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new NotFoundError("Course not found.");
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new ConflictError("Course cannot be deleted while class sections use it.");
      }
      throw error;
    }
  }
}
