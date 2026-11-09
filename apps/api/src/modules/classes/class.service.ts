import { Prisma } from "@prisma/client";
import {
  ClassCapacityError,
  EnrollmentDuplicateError,
  ClassSectionNotFoundError,
  PrismaClassRepository,
  type ClassListScope,
} from "./class.repository";
import type { ClassInput, ClassUpdateInput } from "./class.schemas";
import { ConflictError, NotFoundError } from "../../shared/errors";
import { paginated, type PaginationInput } from "../../shared/pagination";
import { assertLecturerOwnsClass, assertStudentEnrolled } from "../materials/resource-access";
import type { UserRole } from "@prisma/client";

export class ClassService {
  constructor(private readonly repository: PrismaClassRepository) {}

  async list(input: PaginationInput, user: { id: string; role: UserRole }, enrolled = false) {
    const scope: ClassListScope =
      user.role === "ADMIN"
        ? { role: "ADMIN" }
        : user.role === "LECTURER"
          ? { role: "LECTURER", userId: user.id }
          : { role: "STUDENT", userId: user.id, enrolled };
    const result = await this.repository.list(input, scope);
    return paginated(result.items, result.total, input.page, input.pageSize);
  }

  listSemesters() {
    return this.repository.listSemesters();
  }

  listLecturers() {
    return this.repository.listLecturers();
  }

  async getOne(id: string, user: { id: string; role: UserRole }) {
    const section = await this.repository.findById(id);
    if (!section) throw new NotFoundError("Class section not found.");
    if (user.role === "LECTURER" && section.lecturerId !== user.id) {
      assertLecturerOwnsClass(section.lecturerId, user.id);
    }
    if (user.role === "STUDENT" && !(await this.repository.canAccess(id, user.id))) {
      assertStudentEnrolled(false);
    }
    return section;
  }

  async create(input: ClassInput) {
    if (!(await this.repository.findLecturer(input.lecturerId))) {
      throw new NotFoundError("Lecturer not found.");
    }
    try {
      return await this.repository.create(input);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError(
          "This course already has a section with that name in this semester.",
        );
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new NotFoundError("Course or semester not found.");
      }
      throw error;
    }
  }

  async update(id: string, input: ClassUpdateInput) {
    const section = await this.repository.findById(id);
    if (!section) throw new NotFoundError("Class section not found.");
    if (input.lecturerId && !(await this.repository.findLecturer(input.lecturerId))) {
      throw new NotFoundError("Lecturer not found.");
    }
    if (input.capacity !== undefined && input.capacity < section._count.enrollments) {
      throw new ConflictError("Class capacity cannot be lower than its current enrollment.");
    }
    try {
      return await this.repository.update(id, input);
    } catch (error) {
      if (error instanceof ClassCapacityError) {
        throw new ConflictError("Class capacity cannot be lower than its current enrollment.");
      }
      if (error instanceof ClassSectionNotFoundError) {
        throw new NotFoundError("Class section not found.");
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError(
          "This course already has a section with that name in this semester.",
        );
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new NotFoundError("Course or semester not found.");
      }
      throw error;
    }
  }

  async delete(id: string) {
    if (!(await this.repository.findById(id))) throw new NotFoundError("Class section not found.");
    if (!(await this.repository.delete(id))) {
      throw new ConflictError("Remove class enrollments and materials before deleting this class.");
    }
  }

  async enroll(sectionId: string, studentId: string) {
    try {
      await this.repository.enroll(sectionId, studentId);
    } catch (error) {
      if (error instanceof EnrollmentDuplicateError) {
        throw new ConflictError("You are already enrolled in this class.");
      }
      if (error instanceof ClassCapacityError) throw new ConflictError("This class is full.");
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError("You are already enrolled in this class.");
      }
      if (error instanceof ClassSectionNotFoundError) {
        throw new NotFoundError("Class section not found.");
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new NotFoundError("Class section not found.");
      }
      throw error;
    }
  }

  async unenroll(sectionId: string, studentId: string) {
    if (!(await this.repository.findById(sectionId)))
      throw new NotFoundError("Class section not found.");
    if (!(await this.repository.unenroll(sectionId, studentId))) {
      throw new NotFoundError("You are not enrolled in this class.");
    }
  }
}
