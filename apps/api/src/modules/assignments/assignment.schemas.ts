import { z } from "zod";
import { paginationSchema } from "../../shared/pagination";

const booleanField = z.preprocess(
  (value) => (value === "true" || value === "false" ? value === "true" : value),
  z.boolean(),
);

export const assignmentInputSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(5000).optional(),
  deadline: z.coerce.date(),
  maxScore: z.coerce.number().int().min(1).max(1000).default(100),
  allowLate: booleanField.default(false),
});

export const assignmentUpdateSchema = assignmentInputSchema.partial().extend({
  removeAttachment: booleanField.optional(),
});

export const assignmentListQuerySchema = paginationSchema.extend({
  classId: z.string().uuid().optional(),
  status: z.enum(["NOT_SUBMITTED", "SUBMITTED", "LATE", "GRADED"]).optional(),
});

export const submissionInputSchema = z.object({
  textContent: z.string().trim().max(20_000).optional(),
});

export const gradeInputSchema = z.object({
  score: z.coerce.number().finite().min(0).max(1000),
  feedback: z.string().trim().max(5000).optional(),
});

export const submissionListQuerySchema = paginationSchema
  .pick({
    page: true,
    pageSize: true,
  })
  .extend({
    status: z.enum(["SUBMITTED", "LATE", "GRADED"]).optional(),
  });

export type AssignmentInput = z.infer<typeof assignmentInputSchema>;
export type AssignmentUpdate = z.infer<typeof assignmentUpdateSchema>;
export type AssignmentListQuery = z.infer<typeof assignmentListQuerySchema>;
export type GradeInput = z.infer<typeof gradeInputSchema>;
export type SubmissionListQuery = z.infer<typeof submissionListQuerySchema>;
