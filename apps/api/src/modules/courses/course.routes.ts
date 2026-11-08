import { Router } from "express";
import { authorize, authenticate } from "../auth/auth.middleware";
import { CourseController } from "./course.controller";

export function createCourseRouter(controller: CourseController, secret: string): Router {
  const router = Router();
  router.use(authenticate(secret));
  router.get("/", authorize("ADMIN", "LECTURER", "STUDENT"), controller.list);
  router.post("/", authorize("ADMIN"), controller.create);
  router.get("/:courseId", authorize("ADMIN", "LECTURER", "STUDENT"), controller.getOne);
  router.patch("/:courseId", authorize("ADMIN"), controller.update);
  router.delete("/:courseId", authorize("ADMIN"), controller.delete);
  return router;
}
