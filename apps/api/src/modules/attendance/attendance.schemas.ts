import { AttendanceStatus } from "@prisma/client";
import { z } from "zod";
import { paginationSchema } from "../../shared/pagination";

export const openSessionSchema = z.object({
  title: z.string().trim().min(2).max(160),
  durationMinutes: z.coerce.number().int().min(1).max(240),
  lateAfterMinutes: z.coerce.number().int().min(0).max(240).default(10),
});

export const attendanceListSchema = paginationSchema
  .pick({
    page: true,
    pageSize: true,
  })
  .extend({
    status: z.nativeEnum(AttendanceStatus).optional(),
    sessionId: z.string().uuid().optional(),
    studentId: z.string().uuid().optional(),
    classId: z.string().uuid().optional(),
  });

export const checkInSchema = z.object({
  sessionId: z.string().uuid(),
  token: z.string().min(20).max(4096),
});

export const statusOverrideSchema = z.object({
  status: z.nativeEnum(AttendanceStatus),
  reason: z.string().trim().max(500).optional(),
});

export type OpenSessionInput = z.infer<typeof openSessionSchema>;
export type AttendanceListInput = z.infer<typeof attendanceListSchema>;
export type StatusOverrideInput = z.infer<typeof statusOverrideSchema>;
