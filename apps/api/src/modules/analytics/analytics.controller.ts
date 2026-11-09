import type { Request, Response } from "express";
import { AnalyticsService } from "./analytics.service";

export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  dashboard = async (request: Request, response: Response): Promise<void> => {
    response.json({ data: await this.service.dashboard(request.authUser!) });
  };
}
