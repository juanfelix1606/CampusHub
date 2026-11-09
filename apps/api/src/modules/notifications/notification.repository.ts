import { NotificationType, Prisma, PrismaClient, UserRole } from "@prisma/client";
import { NotFoundError } from "../../shared/errors";

export class PrismaNotificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(userId: string, page: number, pageSize: number) {
    const where = { userId };
    const [items, total, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { items, total, unreadCount };
  }

  async markRead(notificationId: string, userId: string, now: Date) {
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId, readAt: null },
      data: { readAt: now },
    });
    if (result.count === 0) {
      const owned = await this.prisma.notification.findFirst({
        where: { id: notificationId, userId },
        select: { id: true },
      });
      if (!owned) throw new NotFoundError("Notification not found.");
    }
  }

  markAllRead(userId: string, now: Date) {
    return this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: now },
    });
  }

  async recipientsForSection(sectionId: string): Promise<string[]> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { sectionId, student: { role: UserRole.STUDENT } },
      select: { studentId: true },
    });
    return enrollments.map(({ studentId }) => studentId);
  }

  async allStudentIds(): Promise<string[]> {
    const students = await this.prisma.user.findMany({
      where: { role: UserRole.STUDENT },
      select: { id: true },
    });
    return students.map(({ id }) => id);
  }

  async createMany(
    userIds: string[],
    notification: { type: NotificationType; title: string; body: string; href: string },
  ): Promise<void> {
    if (userIds.length === 0) return;
    await this.prisma.notification.createMany({
      data: userIds.map((userId) => ({ userId, ...notification })),
    });
  }

  async announcements(
    user: { id: string; role: UserRole },
    page: number,
    pageSize: number,
  ) {
    const where: Prisma.AnnouncementWhereInput =
      user.role === UserRole.ADMIN
        ? {}
        : user.role === UserRole.LECTURER
          ? { section: { lecturerId: user.id } }
          : {
              OR: [
                { sectionId: null },
                { section: { enrollments: { some: { studentId: user.id } } } },
              ],
            };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.announcement.findMany({
        where,
        include: {
          author: { select: { id: true, name: true, role: true } },
          section: { select: { id: true, name: true, course: { select: { code: true, name: true } } } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.announcement.count({ where }),
    ]);
    return { items, total };
  }

  async canPublishToSection(
    sectionId: string,
    user: { id: string; role: UserRole },
  ): Promise<boolean> {
    if (user.role === UserRole.ADMIN) {
      return (await this.prisma.classSection.count({ where: { id: sectionId } })) > 0;
    }
    if (user.role !== UserRole.LECTURER) return false;
    return (await this.prisma.classSection.count({
      where: { id: sectionId, lecturerId: user.id },
    })) > 0;
  }

  createAnnouncement(input: {
    authorId: string;
    sectionId: string | null;
    title: string;
    body: string;
  }) {
    return this.prisma.announcement.create({
      data: input,
      include: {
        author: { select: { id: true, name: true, role: true } },
        section: { select: { id: true, name: true, course: { select: { code: true, name: true } } } },
      },
    });
  }
}
