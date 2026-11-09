import { Router } from "express";
import { authenticate, authorize } from "../auth/auth.middleware";
import {
  createMaterialUploadMiddleware,
  materialUploadErrorHandler,
} from "../materials/material-upload";
import { AssignmentController } from "./assignment.controller";

export function createAssignmentRouter(controller: AssignmentController, secret: string): Router {
  const router = Router();
  router.use(authenticate(secret));
  router.get("/classes/:classId/grades/me", authorize("STUDENT"), controller.classGrades);
  router.post(
    "/classes/:classId/assignments",
    authorize("LECTURER"),
    createMaterialUploadMiddleware(),
    controller.create,
  );
  router.get("/assignments", authorize("LECTURER", "STUDENT"), controller.list);
  router.get(
    "/assignments/:assignmentId/submissions/me",
    authorize("STUDENT"),
    controller.mySubmission,
  );
  router.post(
    "/assignments/:assignmentId/submissions/me",
    authorize("STUDENT"),
    createMaterialUploadMiddleware(),
    controller.submit,
  );
  router.get(
    "/assignments/:assignmentId/submissions/:submissionId/file",
    authorize("LECTURER", "STUDENT"),
    controller.downloadSubmission,
  );
  router.get(
    "/assignments/:assignmentId/submissions/:submissionId/versions/:versionId/file",
    authorize("LECTURER", "STUDENT"),
    controller.downloadSubmissionVersion,
  );
  router.patch(
    "/assignments/:assignmentId/submissions/:submissionId/grade",
    authorize("LECTURER"),
    controller.grade,
  );
  router.get(
    "/assignments/:assignmentId/submissions",
    authorize("LECTURER"),
    controller.submissions,
  );
  router.get(
    "/assignments/:assignmentId/attachment",
    authorize("LECTURER", "STUDENT"),
    controller.downloadAttachment,
  );
  router.get("/assignments/:assignmentId", authorize("LECTURER", "STUDENT"), controller.getOne);
  router.patch(
    "/assignments/:assignmentId",
    authorize("LECTURER"),
    createMaterialUploadMiddleware(),
    controller.update,
  );
  router.delete("/assignments/:assignmentId", authorize("LECTURER"), controller.delete);
  router.use(materialUploadErrorHandler);
  return router;
}
