import { extname } from "node:path";
import multer from "multer";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { BadRequestError, PayloadTooLargeError } from "../../shared/errors";

export const MAX_MATERIAL_FILE_SIZE = 10 * 1024 * 1024;
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
  if (file.size > MAX_MATERIAL_FILE_SIZE) {
    throw new PayloadTooLargeError("Material files must be 10 MB or smaller.");
  }
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

export function createMaterialUploadMiddleware(): RequestHandler {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_MATERIAL_FILE_SIZE, files: 1 },
    fileFilter: (_request, file, callback) => {
      const extension = extname(file.originalname).toLowerCase();
      if (allowedTypes.get(extension) !== file.mimetype) {
        callback(new BadRequestError("Only PDF, PNG, and JPEG files with matching extensions and MIME types are allowed."));
        return;
      }
      callback(null, true);
    },
  }).single("file");
}

export const materialUploadErrorHandler: ErrorRequestHandler = (error, _request, _response, next) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    next(new PayloadTooLargeError("Material files must be 10 MB or smaller."));
    return;
  }
  next(error);
};
