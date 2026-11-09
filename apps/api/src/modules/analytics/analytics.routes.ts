import { Router } from "express";
import { authenticate } from "../auth/auth.middleware";
import { AnalyticsController } from "./analytics.controller";

export function createAnalyticsRouter(controller: AnalyticsController, secret: string): Router {
  const router = Router();
  router.use(authenticate(secret));
  router.get("/dashboard", controller.dashboard);
  return router;
}
