import type { UserRole } from "@prisma/client";
import type { RiskThresholds } from "./analytics.repository";
import { PrismaAnalyticsRepository } from "./analytics.repository";

export class AnalyticsService {
  constructor(
    private readonly repository: PrismaAnalyticsRepository,
    private readonly thresholds: RiskThresholds,
  ) {}

  dashboard(user: { id: string; role: UserRole }) {
    return this.repository.getDashboard(user, new Date(), this.thresholds);
  }
}
