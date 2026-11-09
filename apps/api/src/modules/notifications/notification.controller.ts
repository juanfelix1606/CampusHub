import type { Request, Response } from "express";
import { uuidSchema } from "../../shared/pagination";
import { announcementInputSchema, notificationListSchema } from "./notification.schemas";
import { NotificationService } from "./notification.service";

export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  list = async (request: Request, response: Response): Promise<void> => {
    const { page, pageSize } = notificationListSchema.parse(request.query);
    response.json({ data: await this.service.list(request.authUser!.id, page, pageSize) });
  };

  markRead = async (request: Request, response: Response): Promise<void> => {
    await this.service.markRead(
      uuidSchema.parse(request.params.notificationId),
      request.authUser!.id,
    );
    response.json({ data: { message: "Notification marked as read." } });
  };

  markAllRead = async (request: Request, response: Response): Promise<void> => {
    response.json({ data: await this.service.markAllRead(request.authUser!.id) });
  };

  announcements = async (request: Request, response: Response): Promise<void> => {
    const { page, pageSize } = notificationListSchema.parse(request.query);
    response.json({
      data: await this.service.listAnnouncements(request.authUser!, page, pageSize),
    });
  };

  createAnnouncement = async (request: Request, response: Response): Promise<void> => {
    response.status(201).json({
      data: {
        announcement: await this.service.createAnnouncement(
          request.authUser!,
          announcementInputSchema.parse(request.body),
        ),
      },
    });
  };
}
