import { z } from "zod";

export const classInputSchema = z
  .object({
    courseId: z.string().uuid(),
    semesterId: z.string().uuid(),
    lecturerId: z.string().uuid(),
    name: z.string().trim().min(1).max(40),
    capacity: z.number().int().min(1).max(500).default(60),
  })
  .strict();

export const classUpdateSchema = z
  .object({
    courseId: z.string().uuid().optional(),
    semesterId: z.string().uuid().optional(),
    lecturerId: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(40).optional(),
    capacity: z.number().int().min(1).max(500).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one class field is required.");

export type ClassInput = z.infer<typeof classInputSchema>;
export type ClassUpdateInput = z.infer<typeof classUpdateSchema>;
