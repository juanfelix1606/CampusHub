import type { Request, Response } from "express";
import { paginationSchema, uuidSchema } from "../../shared/pagination";
import { courseInputSchema, courseUpdateSchema } from "./course.schemas";
import { CourseService } from "./course.service";

export class CourseController {
  constructor(private readonly service: CourseService) {}

  list = async (request: Request, response: Response): Promise<void> => {
    const query = paginationSchema.parse(request.query);
    response.json({ data: await this.service.list(query) });
  };

  getOne = async (request: Request, response: Response): Promise<void> => {
    response.json({ data: { course: await this.service.getOne(uuidSchema.parse(request.params.courseId)) } });
  };

  create = async (request: Request, response: Response): Promise<void> => {
    const input = courseInputSchema.parse(request.body);
    response.status(201).json({ data: { course: await this.service.create(input) } });
  };

  update = async (request: Request, response: Response): Promise<void> => {
    const input = courseUpdateSchema.parse(request.body);
    response.json({ data: { course: await this.service.update(uuidSchema.parse(request.params.courseId), input) } });
  };

  delete = async (request: Request, response: Response): Promise<void> => {
    await this.service.delete(uuidSchema.parse(request.params.courseId));
    response.status(204).end();
  };
}
