import { z } from "zod";

export const notificationListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const announcementInputSchema = z.object({
  sectionId: z.string().uuid().optional(),
  title: z.string().trim().min(2).max(160),
  body: z.string().trim().min(2).max(5000),
});

export type AnnouncementInput = z.infer<typeof announcementInputSchema>;
