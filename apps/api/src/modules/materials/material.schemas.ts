import { z } from "zod";

export const materialFieldsSchema = z
  .object({
    title: z.string().trim().min(2).max(160),
    description: z.string().trim().max(2000).optional().nullable(),
  })
  .strict();

export const materialUpdateSchema = z
  .object({
    title: z.string().trim().min(2).max(160).optional(),
    description: z.string().trim().max(2000).optional().nullable(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    "Provide at least one field or a replacement file.",
  );

export type MaterialFields = z.infer<typeof materialFieldsSchema>;
export type MaterialUpdate = z.infer<typeof materialUpdateSchema>;
