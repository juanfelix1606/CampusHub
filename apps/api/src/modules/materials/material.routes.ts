import { Router } from "express";
import multer from "multer";
import { BadRequestError, PayloadTooLargeError } from "../../shared/errors";
import { authorize, authenticate } from "../auth/auth.middleware";
import { MaterialController } from "./material.controller";

const maximumFileSize = 10 * 1024 * 1024;
const allowedTypes = new Map([
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maximumFileSize, files: 1 },
  fileFilter: (_request, file, callback) => {
    const extension = file.originalname.slice(file.originalname.lastIndexOf(".")).toLowerCase();
    if (allowedTypes.get(extension) !== file.mimetype) {
      callback(new BadRequestError("Only PDF, PNG, and JPEG files with matching extensions and MIME types are allowed."));
      return;
    }
    callback(null, true);
  },
});

export function createClassMaterialsRouter(controller: MaterialController, secret: string): Router {
  const router = Router({ mergeParams: true });
  router.use(authenticate(secret));
  router.get("/", authorize("ADMIN", "LECTURER", "STUDENT"), controller.list);
  router.post("/", authorize("LECTURER"), upload.single("file"), controller.create);
  return router;
}

export function createMaterialRouter(controller: MaterialController, secret: string): Router {
  const router = Router();
  router.use(authenticate(secret));
  router.get("/:materialId/download", authorize("ADMIN", "LECTURER", "STUDENT"), controller.download);
  router.patch("/:materialId", authorize("LECTURER"), upload.single("file"), controller.update);
  router.delete("/:materialId", authorize("LECTURER"), controller.delete);
  router.use((error: unknown, _request: import("express").Request, _response: import("express").Response, next: import("express").NextFunction) => {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      next(new PayloadTooLargeError("Material files must be 10 MB or smaller."));
      return;
    }
    next(error);
  });
  return router;
}
