import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(120).optional(),
  semesterId: z.string().uuid().optional(),
});

export const uuidSchema = z.string().uuid();

export type PaginationInput = z.infer<typeof paginationSchema>;

export function paginated<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): { items: T[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } } {
  return {
    items,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}
