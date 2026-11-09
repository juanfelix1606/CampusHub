import { z } from "zod";

export const courseInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{2,20}$/),
    name: z.string().trim().min(3).max(120),
    credits: z.number().int().min(1).max(8),
  })
  .strict();

export const courseUpdateSchema = courseInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one course field is required.");

export type CourseInput = z.infer<typeof courseInputSchema>;
export type CourseUpdateInput = z.infer<typeof courseUpdateSchema>;
