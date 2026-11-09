import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { AuthController } from "./modules/auth/auth.controller";
import { createAuthRouter } from "./modules/auth/auth.routes";
import { AuthService } from "./modules/auth/auth.service";
import { PrismaAuthRepository } from "./modules/auth/auth.repository";
import type { AuthConfig, AuthRepository } from "./modules/auth/auth.types";
import { errorHandler, notFoundHandler } from "./shared/error-handler";
import swaggerUi from "swagger-ui-express";
import { prisma } from "./shared/prisma";
import { openApiDocument } from "./shared/openapi";
import { createCourseRouter } from "./modules/courses/course.routes";
import { createClassRouter } from "./modules/classes/class.routes";
import { PrismaCourseRepository } from "./modules/courses/course.repository";
import { CourseService } from "./modules/courses/course.service";
import { CourseController } from "./modules/courses/course.controller";
import { PrismaClassRepository } from "./modules/classes/class.repository";
import { ClassService } from "./modules/classes/class.service";
import { ClassController } from "./modules/classes/class.controller";
import { createClassMaterialsRouter, createMaterialRouter } from "./modules/materials/material.routes";
import { PrismaMaterialRepository } from "./modules/materials/material.repository";
import { MaterialService } from "./modules/materials/material.service";
import { MaterialController } from "./modules/materials/material.controller";
import { LocalFileStorage } from "./modules/materials/local-file.storage";
import type { FileStorage } from "./modules/materials/file-storage";
import { PrismaAssignmentRepository } from "./modules/assignments/assignment.repository";
import { AssignmentService } from "./modules/assignments/assignment.service";
import { AssignmentController } from "./modules/assignments/assignment.controller";
import { createAssignmentRouter } from "./modules/assignments/assignment.routes";
import { PrismaAttendanceRepository } from "./modules/attendance/attendance.repository";
import { AttendanceService } from "./modules/attendance/attendance.service";
import { AttendanceController } from "./modules/attendance/attendance.controller";
import { createAttendanceRouter } from "./modules/attendance/attendance.routes";

export function createApp(
  config: AuthConfig,
  repository: AuthRepository = new PrismaAuthRepository(prisma),
  dependencies: {
    database?: typeof prisma;
    materialStorage?: FileStorage;
  } = {},
): express.Express {
  const app = express();
  const database = dependencies.database ?? prisma;
  const fileStorage = dependencies.materialStorage ?? new LocalFileStorage();
  const authService = new AuthService(repository, config);
  const authController = new AuthController(authService, config);
  const courseRepository = new PrismaCourseRepository(database);
  const courseController = new CourseController(new CourseService(courseRepository));
  const classRepository = new PrismaClassRepository(database);
  const classController = new ClassController(new ClassService(classRepository));
  const materialRepository = new PrismaMaterialRepository(database);
  const materialController = new MaterialController(
    new MaterialService(materialRepository, fileStorage),
  );
  const assignmentRepository = new PrismaAssignmentRepository(database);
  const assignmentController = new AssignmentController(
    new AssignmentService(assignmentRepository, fileStorage),
  );
  const attendanceRepository = new PrismaAttendanceRepository(database);
  const attendanceController = new AttendanceController(
    new AttendanceService(attendanceRepository, config.attendanceQrSecret),
  );

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => callback(null, origin === config.webOrigin),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));
  app.use(cookieParser());
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );

  app.get("/api/v1/health", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));
  app.use("/api/v1/auth", createAuthRouter(authController, config));
  app.use("/api/v1/courses", createCourseRouter(courseController, config.accessTokenSecret));
  app.use("/api/v1/classes", createClassRouter(classController, config.accessTokenSecret));
  app.use("/api/v1/classes/:classId/materials", createClassMaterialsRouter(materialController, config.accessTokenSecret));
  app.use("/api/v1/materials", createMaterialRouter(materialController, config.accessTokenSecret));
  app.use("/api/v1", createAssignmentRouter(assignmentController, config.accessTokenSecret));
  app.use("/api/v1", createAttendanceRouter(attendanceController, config.accessTokenSecret));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
