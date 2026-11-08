import { randomUUID } from "node:crypto";
import { basename, extname } from "node:path";
import { Prisma } from "@prisma/client";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  PayloadTooLargeError,
} from "../../shared/errors";
import { paginated } from "../../shared/pagination";
import type { UserRole } from "@prisma/client";
import type { FileStorage } from "./file-storage";
import type { MaterialFields, MaterialUpdate } from "./material.schemas";
import { PrismaMaterialRepository } from "./material.repository";
import { assertLecturerOwnsClass, assertStudentEnrolled } from "./resource-access";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const allowedTypes = new Map([
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
]);

export interface UploadedMaterialFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export function validateMaterialFile(file: UploadedMaterialFile): { extension: string; mimeType: string } {
  if (file.size > MAX_FILE_SIZE) throw new PayloadTooLargeError("Material files must be 10 MB or smaller.");
  const extension = extname(file.originalname).toLowerCase();
  const mimeType = allowedTypes.get(extension);
  if (!mimeType || file.mimetype !== mimeType) {
    throw new BadRequestError("Only PDF, PNG, and JPEG files with matching extensions and MIME types are allowed.");
  }
  const validSignature =
    (extension === ".pdf" && file.buffer.subarray(0, 5).toString() === "%PDF-") ||
    (extension === ".png" &&
      file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    ((extension === ".jpg" || extension === ".jpeg") &&
      file.buffer.length >= 3 &&
      file.buffer[0] === 0xff &&
      file.buffer[1] === 0xd8 &&
      file.buffer[2] === 0xff);
  if (!validSignature) throw new BadRequestError("File content does not match its declared type.");
  return { extension: extension === ".jpeg" ? ".jpg" : extension, mimeType };
}

export class MaterialService {
  constructor(
    private readonly repository: PrismaMaterialRepository,
    private readonly storage: FileStorage,
  ) {}

  async list(classId: string, user: { id: string; role: UserRole }, page: number, pageSize: number) {
    await this.assertCanViewClass(classId, user);
    const result = await this.repository.list(classId, page, pageSize);
    return paginated(result.items, result.total, page, pageSize);
  }

  async create(
    classId: string,
    lecturerId: string,
    fields: MaterialFields,
    file: UploadedMaterialFile | undefined,
  ) {
    await this.assertCanManage(classId, lecturerId);
    if (!file) throw new ConflictError("A material file is required.");
    const { extension, mimeType } = validateMaterialFile(file);
    const fileKey = `${randomUUID()}${extension}`;
    await this.storage.save(fileKey, file.buffer);
    try {
      return await this.repository.create({
        ...fields,
        sectionId: classId,
        lecturerId,
        fileKey,
        fileName: safeOriginalName(file.originalname),
        contentType: mimeType,
      });
    } catch (error) {
      await this.deleteStoredFile(fileKey);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new NotFoundError("Class section not found.");
      }
      throw error;
    }
  }

  async update(
    id: string,
    lecturerId: string,
    fields: MaterialUpdate,
    file?: UploadedMaterialFile,
  ) {
    const material = await this.repository.findById(id);
    if (!material) throw new NotFoundError("Material not found.");
    await this.assertCanManage(material.sectionId, lecturerId);

    let replacement: { fileKey: string; fileName: string; contentType: string } | undefined;
    if (file) {
      const { extension, mimeType } = validateMaterialFile(file);
      replacement = {
        fileKey: `${randomUUID()}${extension}`,
        fileName: safeOriginalName(file.originalname),
        contentType: mimeType,
      };
      await this.storage.save(replacement.fileKey, file.buffer);
    }

    let updated;
    try {
      updated = await this.repository.update(id, { ...fields, ...replacement });
    } catch (error) {
      if (replacement) await this.deleteStoredFile(replacement.fileKey);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new NotFoundError("Material not found.");
      }
      throw error;
    }
    if (replacement) await this.deleteStoredFile(material.fileKey);
    return updated;
  }

  async delete(id: string, lecturerId: string): Promise<void> {
    const material = await this.repository.findById(id);
    if (!material) throw new NotFoundError("Material not found.");
    await this.assertCanManage(material.sectionId, lecturerId);
    await this.repository.delete(id);
    await this.deleteStoredFile(material.fileKey);
  }

  async download(id: string, user: { id: string; role: UserRole }) {
    const material = await this.repository.findWithClassAccess(id);
    if (!material) throw new NotFoundError("Material not found.");
    if (user.role === "LECTURER" && material.section.lecturerId !== user.id) {
      assertLecturerOwnsClass(material.section.lecturerId, user.id);
    }
    if (
      user.role === "STUDENT" &&
      !(await this.repository.canAccessClass(material.sectionId, user.id))
    ) {
      assertStudentEnrolled(false);
    }
    return { material, contents: await this.storage.read(material.fileKey) };
  }

  private async assertCanManage(classId: string, lecturerId: string): Promise<void> {
    const section = await this.repository.getClassOwner(classId);
    if (!section) throw new NotFoundError("Class section not found.");
    assertLecturerOwnsClass(section.lecturerId, lecturerId);
  }

  private async assertCanViewClass(
    classId: string,
    user: { id: string; role: UserRole },
  ): Promise<void> {
    if (user.role === "ADMIN") return;
    if (user.role === "LECTURER") {
      await this.assertCanManage(classId, user.id);
      return;
    }
    assertStudentEnrolled(await this.repository.canAccessClass(classId, user.id));
  }

  private async deleteStoredFile(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (error) {
      console.error(`Failed to delete stored material file ${key}:`, error);
      throw error;
    }
  }
}

function safeOriginalName(originalName: string): string {
  return basename(originalName).replace(/[^\w.-]/g, "_").slice(0, 180);
}
