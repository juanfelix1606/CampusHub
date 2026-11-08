import { Router } from "express";
import { authorize, authenticate } from "../auth/auth.middleware";
import { ClassController } from "./class.controller";

export function createClassRouter(controller: ClassController, secret: string): Router {
  const router = Router();
  router.use(authenticate(secret));
  router.get("/semesters", authorize("ADMIN", "LECTURER", "STUDENT"), controller.semesters);
  router.get("/lecturers", authorize("ADMIN"), controller.lecturers);
  router.get("/mine", authorize("ADMIN", "LECTURER", "STUDENT"), controller.mine);
  router.get("/", authorize("ADMIN", "LECTURER", "STUDENT"), controller.list);
  router.post("/", authorize("ADMIN"), controller.create);
  router.get("/:classId", authorize("ADMIN", "LECTURER", "STUDENT"), controller.getOne);
  router.post("/:classId/enrollments/me", authorize("STUDENT"), controller.enroll);
  router.delete("/:classId/enrollments/me", authorize("STUDENT"), controller.unenroll);
  router.patch("/:classId", authorize("ADMIN"), controller.update);
  router.delete("/:classId", authorize("ADMIN"), controller.delete);
  return router;
}
