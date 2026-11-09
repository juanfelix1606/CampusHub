CREATE TYPE "NotificationType" AS ENUM ('ASSIGNMENT', 'GRADE', 'ATTENDANCE', 'ANNOUNCEMENT');

ALTER TABLE "Notification"
ADD COLUMN "type" "NotificationType" NOT NULL DEFAULT 'ANNOUNCEMENT',
ADD COLUMN "href" TEXT;

DROP INDEX "Notification_userId_readAt_createdAt_idx";
CREATE INDEX "Notification_userId_readAt_createdAt_idx"
ON "Notification"("userId", "readAt", "createdAt" DESC);
