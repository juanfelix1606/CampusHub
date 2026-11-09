import { Router } from "express";
import { authorize, authenticate } from "../auth/auth.middleware";
import { MaterialController } from "./material.controller";
import { createMaterialUploadMiddleware, materialUploadErrorHandler } from "./material-upload";

export function createClassMaterialsRouter(controller: MaterialController, secret: string): Router {
  const router = Router({ mergeParams: true });
  router.use(authenticate(secret));
  router.get("/", authorize("ADMIN", "LECTURER", "STUDENT"), controller.list);
  router.post("/", authorize("LECTURER"), createMaterialUploadMiddleware(), controller.create);
  router.use(materialUploadErrorHandler);
  return router;
}

export function createMaterialRouter(controller: MaterialController, secret: string): Router {
  const router = Router();
  router.use(authenticate(secret));
  router.get("/:materialId/download", authorize("ADMIN", "LECTURER", "STUDENT"), controller.download);
  router.patch("/:materialId", authorize("LECTURER"), createMaterialUploadMiddleware(), controller.update);
  router.delete("/:materialId", authorize("LECTURER"), controller.delete);
  router.use(materialUploadErrorHandler);
  return router;
}
