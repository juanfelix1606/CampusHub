import { Router } from "express";
import { authenticate, authorize } from "../auth/auth.middleware";
import { NotificationController } from "./notification.controller";

export function createNotificationRouter(
  controller: NotificationController,
  secret: string,
): Router {
  const router = Router();
  router.use(authenticate(secret));
  router.get("/notifications", controller.list);
  router.patch("/notifications/:notificationId/read", controller.markRead);
  router.post("/notifications/read-all", controller.markAllRead);
  router.get("/announcements", controller.announcements);
  router.post("/announcements", authorize("ADMIN", "LECTURER"), controller.createAnnouncement);
  return router;
}
