import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate, authorize } from "../auth/auth.middleware";
import { AttendanceController } from "./attendance.controller";

export function createAttendanceRouter(
  controller: AttendanceController,
  accessTokenSecret: string,
): Router {
  const router = Router();
  router.use(authenticate(accessTokenSecret));

  router.get("/attendance/me", authorize("STUDENT"), controller.studentAttendance);
  router.post(
    "/attendance/check-in",
    authorize("STUDENT"),
    rateLimit({
      windowMs: 60_000,
      limit: 60,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: {
        error: { code: "RATE_LIMITED", message: "Too many check-in attempts. Try again shortly." },
      },
    }),
    controller.checkIn,
  );
  router.get("/classes/:classId/attendance/me", authorize("STUDENT"), controller.classSummary);
  router.get(
    "/classes/:classId/attendance/export.csv",
    authorize("LECTURER"),
    controller.exportClass,
  );
  router.get(
    "/classes/:classId/attendance/sessions",
    authorize("LECTURER"),
    controller.listClassSessions,
  );
  router.post(
    "/classes/:classId/attendance/sessions",
    authorize("LECTURER"),
    controller.openSession,
  );
  router.get("/attendance/sessions/:sessionId/qr", authorize("LECTURER"), controller.qrToken);
  router.post(
    "/attendance/sessions/:sessionId/close",
    authorize("LECTURER"),
    controller.closeSession,
  );
  router.get(
    "/attendance/sessions/:sessionId/records",
    authorize("LECTURER"),
    controller.sessionAttendance,
  );
  router.get(
    "/attendance/sessions/:sessionId/export.csv",
    authorize("LECTURER"),
    controller.exportSession,
  );
  router.patch(
    "/attendance/sessions/:sessionId/records/:studentId",
    authorize("LECTURER"),
    controller.overrideStatus,
  );

  return router;
}
