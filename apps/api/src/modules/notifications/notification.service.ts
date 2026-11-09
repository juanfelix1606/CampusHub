import { NotificationType, UserRole } from "@prisma/client";
import { ForbiddenError } from "../../shared/errors";
import type { DomainEventBus, CampusHubEvent } from "../../shared/domain-events";
import { paginated } from "../../shared/pagination";
import type { AnnouncementInput } from "./notification.schemas";
import { PrismaNotificationRepository } from "./notification.repository";

type NotificationUser = { id: string; role: UserRole };

export class NotificationService {
  constructor(
    private readonly repository: PrismaNotificationRepository,
    events: DomainEventBus,
  ) {
    events.onCampusHubEvent((event) => this.handleEvent(event));
  }

  async list(userId: string, page: number, pageSize: number) {
    const result = await this.repository.list(userId, page, pageSize);
    return {
      ...paginated(result.items, result.total, page, pageSize),
      unreadCount: result.unreadCount,
    };
  }

  markRead(notificationId: string, userId: string) {
    return this.repository.markRead(notificationId, userId, new Date());
  }

  async markAllRead(userId: string) {
    const result = await this.repository.markAllRead(userId, new Date());
    return { updated: result.count };
  }

  async listAnnouncements(user: NotificationUser, page: number, pageSize: number) {
    const result = await this.repository.announcements(user, page, pageSize);
    return paginated(result.items, result.total, page, pageSize);
  }

  async createAnnouncement(user: NotificationUser, input: AnnouncementInput) {
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.LECTURER) {
      throw new ForbiddenError("Only admins or lecturers can publish announcements.");
    }
    if (!input.sectionId && user.role !== UserRole.ADMIN) {
      throw new ForbiddenError("Only admins can publish global announcements.");
    }
    if (input.sectionId && !(await this.repository.canPublishToSection(input.sectionId, user))) {
      throw new ForbiddenError("You cannot publish to this class.");
    }
    const announcement = await this.repository.createAnnouncement({
      authorId: user.id,
      sectionId: input.sectionId ?? null,
      title: input.title,
      body: input.body,
    });
    await this.handleEvent({
      type: "announcement.created",
      sectionId: announcement.sectionId,
      announcementId: announcement.id,
      title: announcement.title,
      body: announcement.body,
    });
    return announcement;
  }

  private async handleEvent(event: CampusHubEvent): Promise<void> {
    switch (event.type) {
      case "assignment.created":
        await this.notifySection(
          event.sectionId,
          NotificationType.ASSIGNMENT,
          event.title,
          "Tugas baru tersedia. Buka daftar tugas untuk melihat detail.",
          `/student/assignments`,
        );
        return;
      case "assignment.graded":
        await this.repository.createMany([event.studentId], {
          type: NotificationType.GRADE,
          title: `Nilai tersedia: ${event.title}`,
          body: "Dosen telah memberikan nilai dan feedback untuk tugasmu.",
          href: `/student/assignments`,
        });
        return;
      case "attendance.opened":
        await this.notifySection(
          event.sectionId,
          NotificationType.ATTENDANCE,
          event.title,
          "Sesi absensi dibuka. Segera lakukan check-in melalui QR.",
          `/student/attendance`,
        );
        return;
      case "announcement.created": {
        const recipients = event.sectionId
          ? await this.repository.recipientsForSection(event.sectionId)
          : await this.repository.allStudentIds();
        await this.repository.createMany(recipients, {
          type: NotificationType.ANNOUNCEMENT,
          title: event.title,
          body: event.body,
          href: "/dashboard",
        });
      }
    }
  }

  private async notifySection(
    sectionId: string,
    type: NotificationType,
    title: string,
    body: string,
    href: string,
  ) {
    await this.repository.createMany(await this.repository.recipientsForSection(sectionId), {
      type,
      title,
      body,
      href,
    });
  }
}
