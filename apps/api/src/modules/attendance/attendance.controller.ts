import type { Request, Response } from "express";
import { paginationSchema, uuidSchema } from "../../shared/pagination";
import {
  attendanceListSchema,
  checkInSchema,
  openSessionSchema,
  statusOverrideSchema,
} from "./attendance.schemas";
import { AttendanceService } from "./attendance.service";

export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  openSession = async (request: Request, response: Response): Promise<void> => {
    const session = await this.service.openSession(
      uuidSchema.parse(request.params.classId),
      request.authUser!.id,
      openSessionSchema.parse(request.body),
    );
    response.status(201).json({ data: { session } });
  };

  listClassSessions = async (request: Request, response: Response): Promise<void> => {
    const { page, pageSize } = paginationSchema.parse(request.query);
    response.json({
      data: await this.service.listClassSessions(
        uuidSchema.parse(request.params.classId),
        request.authUser!.id,
        page,
        pageSize,
      ),
    });
  };

  qrToken = async (request: Request, response: Response): Promise<void> => {
    response.json({
      data: await this.service.getQrToken(
        uuidSchema.parse(request.params.sessionId),
        request.authUser!.id,
      ),
    });
  };

  checkIn = async (request: Request, response: Response): Promise<void> => {
    const { token, sessionId } = checkInSchema.parse(request.body);
    const attendance = await this.service.checkIn(token, sessionId, request.authUser!.id);
    response.status(201).json({ data: { attendance } });
  };

  closeSession = async (request: Request, response: Response): Promise<void> => {
    response.json({
      data: {
        session: await this.service.closeSession(
          uuidSchema.parse(request.params.sessionId),
          request.authUser!.id,
        ),
      },
    });
  };

  sessionAttendance = async (request: Request, response: Response): Promise<void> => {
    const input = attendanceListSchema.parse(request.query);
    response.json({
      data: await this.service.listSessionAttendance(
        uuidSchema.parse(request.params.sessionId),
        request.authUser!.id,
        input,
      ),
    });
  };

  studentAttendance = async (request: Request, response: Response): Promise<void> => {
    response.json({
      data: await this.service.listStudentAttendance(
        attendanceListSchema.parse(request.query),
        request.authUser!.id,
      ),
    });
  };

  classSummary = async (request: Request, response: Response): Promise<void> => {
    response.json({
      data: await this.service.classSummary(
        uuidSchema.parse(request.params.classId),
        request.authUser!.id,
      ),
    });
  };

  overrideStatus = async (request: Request, response: Response): Promise<void> => {
    response.json({
      data: {
        attendance: await this.service.overrideStatus(
          uuidSchema.parse(request.params.sessionId),
          uuidSchema.parse(request.params.studentId),
          request.authUser!.id,
          statusOverrideSchema.parse(request.body),
        ),
      },
    });
  };

  exportSession = async (request: Request, response: Response): Promise<void> => {
    const csv = await this.service.exportSession(
      uuidSchema.parse(request.params.sessionId),
      request.authUser!.id,
    );
    response
      .setHeader("Content-Type", "text/csv; charset=utf-8")
      .setHeader("Content-Disposition", `attachment; filename="attendance-session-${request.params.sessionId}.csv"`)
      .setHeader("X-Content-Type-Options", "nosniff")
      .send(csv);
  };

  exportClass = async (request: Request, response: Response): Promise<void> => {
    const csv = await this.service.exportClass(
      uuidSchema.parse(request.params.classId),
      request.authUser!.id,
    );
    response
      .setHeader("Content-Type", "text/csv; charset=utf-8")
      .setHeader("Content-Disposition", `attachment; filename="attendance-class-${request.params.classId}.csv"`)
      .setHeader("X-Content-Type-Options", "nosniff")
      .send(csv);
  };
}
