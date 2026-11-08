import type { UserRole } from "@prisma/client";
import type { Request, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { ForbiddenError, UnauthorizedError } from "../../shared/errors";

declare global {
  namespace Express {
    interface Request {
      authUser?: { id: string; role: UserRole };
    }
  }
}

const accessClaimsSchema = z.object({
  sub: z.string().uuid(),
  role: z.enum(["ADMIN", "LECTURER", "STUDENT"]),
});

export function authenticate(secret: string): RequestHandler {
  return (request, _response, next) => {
    const authorization = request.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      next(new UnauthorizedError());
      return;
    }

    try {
      const payload = jwt.verify(authorization.slice("Bearer ".length), secret, {
        algorithms: ["HS256"],
      });
      const claims = accessClaimsSchema.safeParse(payload);
      if (!claims.success) {
        next(new UnauthorizedError("Access token is invalid."));
        return;
      }
      request.authUser = { id: claims.data.sub, role: claims.data.role };
      next();
    } catch {
      next(new UnauthorizedError("Access token is missing, invalid, or expired."));
    }
  };
}

export function authorize(...allowedRoles: UserRole[]): RequestHandler {
  return (request: Request, _response, next) => {
    if (!request.authUser) {
      next(new UnauthorizedError());
      return;
    }
    if (!allowedRoles.includes(request.authUser.role)) {
      next(new ForbiddenError());
      return;
    }
    next();
  };
}
