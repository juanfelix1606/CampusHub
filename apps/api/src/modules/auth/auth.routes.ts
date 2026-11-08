import { Router, type RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { ForbiddenError } from "../../shared/errors";
import { AuthController } from "./auth.controller";
import { authenticate } from "./auth.middleware";
import type { AuthConfig } from "./auth.types";

export function createAuthRouter(controller: AuthController, config: AuthConfig): Router {
  const router = Router();
  const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: { code: "RATE_LIMITED", message: "Too many authentication attempts." } },
  });
  const requireTrustedOrigin: RequestHandler = (request, _response, next) => {
    const origin = request.get("origin");
    const cookieEndpoint = request.path === "/refresh" || request.path === "/logout";
    if ((cookieEndpoint && !origin) || (origin && origin !== config.webOrigin)) {
      next(new ForbiddenError("Request origin is not allowed."));
      return;
    }
    next();
  };

  router.use(authRateLimit, requireTrustedOrigin);
  router.post("/register", controller.register);
  router.post("/login", controller.login);
  router.post("/refresh", controller.refresh);
  router.post("/logout", controller.logout);
  router.get("/me", authenticate(config.accessTokenSecret), controller.me);
  return router;
}
